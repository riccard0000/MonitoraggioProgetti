'use strict';
// Prova la logica della pagina di verifica con cartelle finte che imitano
// l'interfaccia della File System Access API (getFileHandle, createWritable, ...).

const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../verifica/verifica.js');

let orologio = 1000;

function errore(name) {
  return Object.assign(new Error(name), { name });
}

function creaFile() {
  let testo = '';
  let modificato = ++orologio;
  return {
    kind: 'file',
    async createWritable() {
      let buffer = '';
      return {
        async write(t) { buffer += t; },
        async close() { testo = buffer; modificato = ++orologio; }
      };
    },
    async getFile() {
      return { async text() { return testo; }, lastModified: modificato, size: testo.length };
    }
  };
}

// maiuscoleDistinte=false imita Windows/OneDrive (nomi file senza distinzione).
function creaDir({ maiuscoleDistinte = false, falliSottocartella = false } = {}) {
  const chiave = (n) => (maiuscoleDistinte ? n : n.toLowerCase());
  const voci = new Map();
  return {
    kind: 'directory',
    voci,
    async queryPermission() { return 'granted'; },
    async getFileHandle(nome, opz = {}) {
      let v = voci.get(chiave(nome));
      if (!v) {
        if (!opz.create) throw errore('NotFoundError');
        v = { nome, handle: creaFile() };
        voci.set(chiave(nome), v);
      }
      if (v.handle.kind !== 'file') throw errore('TypeMismatchError');
      return v.handle;
    },
    async getDirectoryHandle(nome, opz = {}) {
      if (falliSottocartella) throw errore('NotAllowedError');
      let v = voci.get(chiave(nome));
      if (!v) {
        if (!opz.create) throw errore('NotFoundError');
        v = { nome, handle: creaDir({ maiuscoleDistinte }) };
        voci.set(chiave(nome), v);
      }
      return v.handle;
    },
    async removeEntry(nome, opz = {}) {
      const v = voci.get(chiave(nome));
      if (!v) throw errore('NotFoundError');
      if (v.handle.kind === 'directory' && v.handle.voci.size && !opz.recursive) {
        throw errore('InvalidModificationError');
      }
      voci.delete(chiave(nome));
    },
    async *entries() {
      for (const v of voci.values()) yield [v.nome, v.handle];
    }
  };
}

const perId = (risultati, id) => risultati.find((r) => r.id === id);

test('verificaCartella: tutti i passi riescono e la cartella resta pulita', async () => {
  const dir = creaDir();
  const { risultati, metriche } = await V.verificaCartella(dir, { file: 5 });

  assert.deepEqual(risultati.filter((r) => r.stato === 'ko'), []);
  assert.equal(dir.voci.size, 0, 'nessun file di prova deve restare');
  assert.equal(perId(risultati, 'pulizia').stato, 'ok');
  assert.equal(metriche.file, 5);
  assert.equal(typeof metriche.letturaMsPerFile, 'number');
  assert.equal(metriche.distingueMaiuscole, false);
  assert.match(perId(risultati, 'maiuscole').dettaglio, /NON le distingue/);
});

test('verificaCartella: riconosce un file system che distingue le maiuscole', async () => {
  const dir = creaDir({ maiuscoleDistinte: true });
  const { risultati, metriche } = await V.verificaCartella(dir, { file: 2 });

  assert.equal(metriche.distingueMaiuscole, true);
  assert.match(perId(risultati, 'maiuscole').dettaglio, /le distingue/);
  assert.equal(dir.voci.size, 0);
});

test('verificaCartella: un passo che fallisce viene segnalato e il resto prosegue', async () => {
  const dir = creaDir({ falliSottocartella: true });
  const { risultati } = await V.verificaCartella(dir, { file: 2 });

  assert.equal(perId(risultati, 'sottocartella').stato, 'ko');
  assert.match(perId(risultati, 'sottocartella').dettaglio, /NotAllowedError/);
  assert.equal(perId(risultati, 'latenza').stato === 'ko', false);
  assert.equal(dir.voci.size, 0, 'la pulizia deve avvenire comunque');
});

test('verificaCartella: segnala l\'avanzamento passo per passo', async () => {
  const titoli = [];
  await V.verificaCartella(creaDir(), { file: 1, avanzamento: (t) => titoli.push(t) });
  assert.ok(titoli.length >= 8);
  assert.ok(titoli.includes('Rimozione dei file di prova'));
});

test('file di controllo: crea, incrementa, conta le copie e rimuove tutto', async () => {
  const dir = creaDir();

  const c1 = await V.creaControllo(dir, 'aaaa');
  assert.equal(c1.rev, 1);

  const c2 = await V.incrementaControllo(dir, 'bbbb');
  assert.equal(c2.rev, 2);
  assert.equal(c2.ultimoScrittore, 'bbbb');
  assert.ok(c2.lastModified > c1.lastModified);

  // Una copia di conflitto come quelle create da OneDrive.
  await dir.getFileHandle('_verifica_controllo-PC-ALTRO.json', { create: true });
  assert.equal(await V.contaCopieControllo(dir), 1);

  assert.equal(await V.eliminaControllo(dir), 2);
  assert.equal(dir.voci.size, 0);
});

test('incrementaControllo: parte da rev 1 se il file non esiste ancora', async () => {
  const c = await V.incrementaControllo(creaDir(), 'aaaa');
  assert.equal(c.rev, 1);
});

test('classificaOrigine: non rivela percorsi né nomi del tenant', () => {
  assert.equal(V.classificaOrigine({ protocol: 'file:', pathname: '/C:/Users/mario/OneDrive%20-%20Azienda/app/index.html' }),
    'file:// (il percorso contiene "OneDrive")');
  assert.equal(V.classificaOrigine({ protocol: 'file:', pathname: '/C:/Progetti/index.html' }),
    'file:// (percorso locale)');
  assert.equal(V.classificaOrigine({ protocol: 'https:', hostname: 'contoso.sharepoint.com' }),
    'https: SharePoint Online');
  assert.equal(V.classificaOrigine({ protocol: 'https:', hostname: 'intranet.azienda.it' }),
    'https: altro host (nome nascosto)');
  assert.equal(V.classificaOrigine({ protocol: 'http:', hostname: 'localhost' }), 'http: localhost');
});

test('raccogliAmbiente: segnala KO quando mancano le API per le cartelle', () => {
  const senza = V.raccogliAmbiente({
    navigator: { userAgent: 'Prova', onLine: true },
    location: { protocol: 'file:', pathname: '/x/index.html' },
    isSecureContext: false
  });
  assert.equal(perId(senza, 'sicuro').stato, 'ko');
  assert.equal(perId(senza, 'fsa-cartella').stato, 'ko');
  assert.equal(perId(senza, 'indexeddb').stato, 'ko');

  const con = V.raccogliAmbiente({
    navigator: { userAgent: 'Prova', onLine: true, clipboard: { writeText() {} } },
    location: { protocol: 'https:', hostname: 'x.sharepoint.com' },
    isSecureContext: true,
    showDirectoryPicker() {}, showOpenFilePicker() {}, showSaveFilePicker() {},
    indexedDB: {},
    localStorage: { setItem() {}, removeItem() {} }
  });
  assert.equal(perId(con, 'fsa-cartella').stato, 'ok');
  assert.equal(perId(con, 'fsa-file').stato, 'ok');
  assert.equal(perId(con, 'localstorage').stato, 'ok');
  assert.equal(perId(con, 'appunti').stato, 'ok');
});

test('provaRaggiungibilita: distingue rete aperta e rete bloccata', async () => {
  const ok = await V.provaRaggiungibilita(async () => ({ type: 'opaque' }), 'https://x');
  assert.equal(ok.raggiungibile, true);

  const ko = await V.provaRaggiungibilita(async () => { throw new TypeError('Failed to fetch'); }, 'https://x');
  assert.equal(ko.raggiungibile, false);
  assert.equal(ko.errore, 'TypeError');
});

test('verificaRete: gli URL facoltativi non compaiono nei risultati', async () => {
  const chiamati = [];
  const fetchFinto = async (url) => { chiamati.push(url); if (url.includes('bloccato')) throw new TypeError('x'); };
  const out = await V.verificaRete(fetchFinto, [
    { id: 'dataverse', nome: 'Ambiente Dataverse indicato', url: 'https://segreto-org.crm4.dynamics.com/' },
    { id: 'sp', nome: 'Sito SharePoint indicato', url: 'https://bloccato.sharepoint.com/' }
  ]);

  assert.equal(chiamati.length, V.BERSAGLI_RETE.length + 2);
  assert.equal(perId(out, 'rete-dataverse').stato, 'ok');
  assert.equal(perId(out, 'rete-sp').stato, 'ko');
  assert.ok(!JSON.stringify(out).includes('segreto-org'));
});

test('costruisciReport: contiene tutte le sezioni e le risposte, non gli URL', () => {
  const r = V.costruisciReport({
    generatoIl: '2026-10-12T10:00:00.000Z',
    ambiente: [V.esito('browser', 'Browser', 'info', 'Edge')],
    rete: [V.esito('rete-jsdelivr', 'cdn.jsdelivr.net', 'ko', 'bloccato')],
    cartella: [V.esito('scrittura', 'Scrittura', 'ok', 'ok')],
    persistenza: V.esito('persistenza', 'Permesso ricordato', 'avviso', 'serve un clic'),
    monitor: [{ tSec: 14, rev: 3, scrittore: 'un\'altra pagina', copie: 0 }],
    risposte: { 'html-sharepoint': 'Viene scaricato', scrittori: '3-5' },
    note: 'Prova eseguita in ufficio'
  });

  for (const sezione of ['## Ambiente', '## Rete', '## Cartella condivisa',
    '## Modifiche fatte da altri utenti', '## Questionario', '## Note']) {
    assert.ok(r.testo.includes(sezione), 'manca ' + sezione);
  }
  assert.match(r.testo, /\[KO\] cdn\.jsdelivr\.net: bloccato/);
  assert.match(r.testo, /dopo 14 s: rev 3 scritta da un'altra pagina/);
  assert.match(r.testo, /Viene scaricato/);
  assert.match(r.testo, /Quante persone scriveranno dati \(te compreso\): 3-5/);
  assert.match(r.testo, /Posso creare tabelle Dataverse.*: \(non risposto\)/);
  assert.equal(r.json.risposte.scrittori, '3-5');
  assert.equal(r.json.note, 'Prova eseguita in ufficio');
});

test('costruisciReport: funziona anche con una sezione non eseguita', () => {
  const r = V.costruisciReport({ ambiente: [], risposte: {} });
  assert.match(r.testo, /\(non eseguito\)/);
  assert.match(r.testo, /nessuna modifica rilevata/);
  assert.match(r.testo, /\(nessuna\)/);
});
