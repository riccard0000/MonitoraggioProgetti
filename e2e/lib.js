'use strict';
// Strumenti per i test end-to-end: pilotano Edge (o Chrome) senza interfaccia grafica tramite il
// protocollo di debug (CDP). Nessuna dipendenza: solo Node 22+ (WebSocket e fetch integrati).

const { spawn, execSync } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RADICE = path.resolve(__dirname, '..');
const RISULTATI = path.join(__dirname, 'risultati');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function trovaBrowser() {
  const candidati = [
    process.env.BROWSER_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ].filter(Boolean);
  const trovato = candidati.find((p) => fs.existsSync(p));
  if (!trovato) throw new Error('Edge o Chrome non trovati. Imposta la variabile BROWSER_PATH con il percorso dell\'eseguibile.');
  return trovato;
}

// ------------------------------------------------------------------ server statico

// Serve la cartella del progetto in sola lettura: serve per le prove che richiedono http
// (la cartella privata del browser, OPFS, non e' disponibile da file://).
function avviaServer(porta) {
  const tipi = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8'
  };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(RADICE, rel);
    if (!file.startsWith(RADICE)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, dati) => {
      if (err) { res.writeHead(404); return res.end('non trovato'); }
      res.writeHead(200, { 'Content-Type': tipi[path.extname(file)] || 'application/octet-stream' });
      res.end(dati);
    });
  });
  return new Promise((ok) => server.listen(porta, '127.0.0.1', () => ok({
    base: 'http://127.0.0.1:' + porta + '/index.html',
    chiudi: () => server.close()
  })));
}

// ------------------------------------------------------------------------ browser

async function avviaBrowser(url, opzioni) {
  const { larghezza = 1400, altezza = 1000 } = opzioni || {};
  const porta = 9400 + Math.floor(Math.random() * 500);
  const profilo = path.join(os.tmpdir(), 'mp-e2e-' + porta);
  const proc = spawn(trovaBrowser(), [
    '--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + profilo,
    '--remote-debugging-port=' + porta, '--window-size=' + larghezza + ',' + altezza, 'about:blank'
  ], { stdio: 'ignore' });

  const getJson = (p) => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: porta, path: p }, (r) => {
      let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  let pagina;
  for (let i = 0; i < 80 && !pagina; i++) {
    try { pagina = (await getJson('/json')).find((t) => t.type === 'page'); } catch (e) { /* si riprova */ }
    if (!pagina) await sleep(250);
  }
  if (!pagina) throw new Error('Il browser non ha esposto la pagina');

  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let prossimo = 1;
  const attese = new Map();
  const errori = [];
  const eventi = [];

  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && attese.has(m.id)) { attese.get(m.id)(m); attese.delete(m.id); return; }
    if (!m.method) return;
    eventi.push(m.method);
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errori.push('eccezione: ' + ((d.exception && d.exception.description) || d.text));
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errori.push('console.error: ' + m.params.args.map((a) => a.value || a.description || '').join(' '));
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      errori.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    }
  };
  const invia = (metodo, params) => new Promise((ok, ko) => {
    const id = prossimo++;
    attese.set(id, (m) => (m.error ? ko(new Error(metodo + ': ' + JSON.stringify(m.error))) : ok(m.result)));
    ws.send(JSON.stringify({ id, method: metodo, params: params || {} }));
  });

  await invia('Page.enable');
  await invia('Runtime.enable');
  await invia('Log.enable');
  await invia('Emulation.setDeviceMetricsOverride', { width: larghezza, height: altezza, deviceScaleFactor: 1, mobile: false });

  const caricamenti = () => eventi.filter((x) => x === 'Page.loadEventFired').length;
  const naviga = async (indirizzo) => {
    const prima = caricamenti();
    await invia('Page.navigate', { url: indirizzo });
    for (let i = 0; i < 100 && caricamenti() === prima; i++) await sleep(100);
  };
  await naviga(url);

  const valuta = async (espressione) => {
    const r = await invia('Runtime.evaluate', { expression: espressione, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('valuta: ' + ((d.exception && d.exception.description) || d.text));
    }
    return r.result.value;
  };
  const attendi = async (condizione, timeout) => {
    const fine = Date.now() + (timeout || 6000);
    while (Date.now() < fine) {
      try { if (await valuta(condizione)) return true; } catch (e) { /* si riprova */ }
      await sleep(100);
    }
    throw new Error('Timeout in attesa di: ' + condizione);
  };
  const schermata = async (nome, intera) => {
    fs.mkdirSync(RISULTATI, { recursive: true });
    const params = { format: 'png' };
    if (intera) {
      const alto = await valuta('Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)');
      Object.assign(params, { captureBeyondViewport: true, clip: { x: 0, y: 0, width: larghezza, height: Math.min(alto, 4000), scale: 1 } });
    }
    const r = await invia('Page.captureScreenshot', params);
    fs.writeFileSync(path.join(RISULTATI, nome + '.png'), Buffer.from(r.data, 'base64'));
  };
  // Edge si rilancia internamente: il PID di partenza non basta. Si terminano tutti i processi
  // che usano il profilo temporaneo di questa prova (e solo quelli: l'Edge dell'utente non si tocca).
  const chiudi = () => {
    try { ws.close(); } catch (e) { /* gia' chiuso */ }
    try { execSync('taskkill /PID ' + proc.pid + ' /T /F', { stdio: 'ignore' }); } catch (e) { /* gia' chiuso */ }
    try {
      const nome = path.basename(profilo);
      // Il filtro sul nome del processo evita che la ricerca trovi (e termini) se stessa.
      const eseguibile = path.basename(trovaBrowser());
      execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq \'' + eseguibile +
        '\' -and $_.CommandLine -like \'*' + nome + '*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"',
      { stdio: 'ignore' });
    } catch (e) { /* niente da terminare */ }
    for (let i = 0; i < 10; i++) {
      try { fs.rmSync(profilo, { recursive: true, force: true }); break; } catch (e) { execSync('ping -n 2 127.0.0.1 >nul', { stdio: 'ignore' }); }
    }
  };
  return { valuta, attendi, schermata, naviga, errori, chiudi, sleep };
}

// ---------------------------------------------------------------- azioni sulla pagina

// Funzioni di comodo per pilotare l'app: cliccare un pulsante per testo, compilare un campo per
// etichetta, leggere lo stato dell'app, catturare i file che l'app genera (PDF, CSV).
function aiuti(b) {
  const clic = (testo) => b.valuta(`(()=>{const el=[...document.querySelectorAll('button')].filter(x=>x.offsetParent!==null&&x.textContent.trim()===${JSON.stringify(testo)}).pop();if(!el)throw new Error('pulsante non trovato: '+${JSON.stringify(testo)});el.click();return true})()`);
  const campo = (etichetta, valore) => b.valuta(`(()=>{const l=[...document.querySelectorAll('dialog[open] label')].find(x=>x.textContent.trim()===${JSON.stringify(etichetta)});if(!l)throw new Error('campo non trovato: '+${JSON.stringify(etichetta)});const el=document.getElementById(l.htmlFor);el.value=${JSON.stringify(valore)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  const stato = (espressione) => b.valuta('(()=>{const S=MP.ui.stato;return ' + espressione + '})()');
  const dialoghi = (n) => b.attendi("document.querySelectorAll('dialog[open]').length===" + n, 6000);
  const testoDialogo = (indice) => b.valuta(`document.querySelectorAll('dialog[open]')[${indice || 0}].innerText`);
  const righeCon = (testo) => `[...document.querySelectorAll('tbody tr')].find(r=>r.textContent.includes(${JSON.stringify(testo)}))`;

  // Cattura i file generati (Blob) invece di scaricarli.
  const intercettaFile = () => b.valuta(`(()=>{
    window.__blobs=[];
    const orig=URL.createObjectURL.bind(URL);
    URL.createObjectURL=(blob)=>{window.__blobs.push(blob);return orig(blob)};
    const click=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){ if(this.download) return; return click.call(this) };
    const dispatch=EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent=function(e){ if(this instanceof HTMLAnchorElement && this.download) return true; return dispatch.call(this,e) };
    return true})()`);
  const prossimoFile = async () => {
    await b.attendi('window.__blobs.length>0', 8000);
    const base64 = await b.valuta(`(async()=>{const blob=window.__blobs.pop();window.__blobs=[];return await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result.split(',')[1]);fr.readAsDataURL(blob)})})()`);
    return Buffer.from(base64, 'base64');
  };

  // Simula la scelta di un file nel selettore dell'importazione.
  const intercettaSelettoreFile = () => b.valuta(`(()=>{const orig=HTMLInputElement.prototype.click;HTMLInputElement.prototype.click=function(){if(this.type==='file'){window.__input=this;return;}return orig.call(this)};return true})()`);
  const scegliFile = async (nome, testo) => {
    await b.valuta('(()=>{MP.ui.apriImportazione();return true})()');
    await b.valuta(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(testo)}],${JSON.stringify(nome)},{type:'text/csv'}));window.__input.files=dt.files;window.__input.dispatchEvent(new Event('change'))})()`);
  };

  return { clic, campo, stato, dialoghi, testoDialogo, righeCon, intercettaFile, prossimoFile, intercettaSelettoreFile, scegliFile };
}

const urlFile = (query) => pathToFileURL(path.join(RADICE, 'index.html')).href + (query || '');

module.exports = { RADICE, RISULTATI, sleep, avviaBrowser, avviaServer, aiuti, urlFile };
