/* Verifica ambiente (fase 0).
 *
 * Script classico, senza moduli ES: deve funzionare aprendo l'HTML da file://.
 * Nessuna dipendenza e nessun accesso al DOM (la parte grafica e' in app.js).
 * Le funzioni ricevono gli oggetti del browser (window, fetch, handle di
 * cartella) cosi' si provano in Node con degli handle finti: vedi
 * test/verifica.test.js.
 */
(function (radice) {
  'use strict';

  var VERSIONE = '1.0';
  var PREFISSO = '_verifica_';
  var FILE_CONTROLLO = PREFISSO + 'controllo.json';

  // ---------------------------------------------------------------- utilita'

  function esito(id, titolo, stato, dettaglio) {
    // stato: 'ok' | 'ko' | 'avviso' | 'info'
    return { id: id, titolo: titolo, stato: stato, dettaglio: dettaglio || '' };
  }

  function descriviErrore(e) {
    var nome = e && e.name ? e.name : 'Errore';
    return e && e.message ? nome + ': ' + e.message : nome;
  }

  function ora() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }

  function trascorsi(t0) {
    return Math.round(ora() - t0);
  }

  // -------------------------------------------------------------- 1. ambiente

  // Descrive da dove gira la pagina senza rivelare percorsi o nomi del tenant.
  function classificaOrigine(loc) {
    var protocollo = loc.protocol || '';
    if (protocollo === 'file:') {
      var percorso = loc.pathname || '';
      try { percorso = decodeURIComponent(percorso); } catch (e) { /* tenuto cosi' */ }
      if (/onedrive/i.test(percorso)) return 'file:// (il percorso contiene "OneDrive")';
      if (/sharepoint/i.test(percorso)) return 'file:// (il percorso contiene "SharePoint")';
      if (/^\/\/|^\\\\/.test(percorso)) return 'file:// (percorso di rete)';
      return 'file:// (percorso locale)';
    }
    if (protocollo === 'https:' || protocollo === 'http:') {
      var host = (loc.hostname || '').toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1') return protocollo + ' localhost';
      if (/\.sharepoint\.com$/.test(host)) return protocollo + ' SharePoint Online';
      return protocollo + ' altro host (nome nascosto)';
    }
    return protocollo || 'n/d';
  }

  function raccogliAmbiente(g) {
    var nav = g.navigator || {};
    var r = [];

    r.push(esito('browser', 'Browser', 'info', nav.userAgent || 'n/d'));
    r.push(esito('origine', 'Pagina aperta da', 'info', classificaOrigine(g.location || {})));
    r.push(esito('sicuro', 'Contesto sicuro', g.isSecureContext ? 'ok' : 'ko',
      g.isSecureContext ? 'sì' : 'no: le API per le cartelle non saranno disponibili'));

    var cartelle = typeof g.showDirectoryPicker === 'function';
    r.push(esito('fsa-cartella', 'Accesso a cartelle (showDirectoryPicker)', cartelle ? 'ok' : 'ko',
      cartelle ? 'disponibile' : 'non disponibile in questo browser o contesto'));

    var file = typeof g.showOpenFilePicker === 'function' && typeof g.showSaveFilePicker === 'function';
    r.push(esito('fsa-file', 'Accesso a file singoli', file ? 'ok' : 'avviso',
      file ? 'disponibile' : 'non disponibile: resterebbe solo import/export manuale'));

    r.push(esito('indexeddb', 'IndexedDB', g.indexedDB ? 'ok' : 'ko', g.indexedDB ? 'disponibile' : 'non disponibile'));

    var ls = false;
    try { g.localStorage.setItem('_v', '1'); g.localStorage.removeItem('_v'); ls = true; } catch (e) { /* bloccato */ }
    r.push(esito('localstorage', 'localStorage', ls ? 'ok' : 'ko', ls ? 'disponibile' : 'non disponibile o bloccato'));

    var lingua = 'n/d';
    var fuso = 'n/d';
    try {
      var o = (g.Intl || Intl).DateTimeFormat().resolvedOptions();
      lingua = o.locale;
      fuso = o.timeZone;
    } catch (e) { /* lasciato n/d */ }
    r.push(esito('locale', 'Lingua e fuso orario', 'info', lingua + ', ' + fuso));

    var appunti = !!(nav.clipboard && nav.clipboard.writeText);
    r.push(esito('appunti', 'Appunti (clipboard)', appunti ? 'ok' : 'avviso', appunti ? 'disponibile' : 'non disponibile'));

    r.push(esito('rete', 'Connessione di rete', nav.onLine === false ? 'ko' : 'ok', nav.onLine === false ? 'offline' : 'online'));
    return r;
  }

  // ----------------------------------------------------------------- 2. rete

  var BERSAGLI_RETE = [
    { id: 'jsdelivr', nome: 'cdn.jsdelivr.net (librerie JS)', url: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js' },
    { id: 'cdnjs', nome: 'cdnjs.cloudflare.com (librerie JS)', url: 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js' },
    { id: 'login', nome: 'login.microsoftonline.com (accesso Microsoft)', url: 'https://login.microsoftonline.com/' },
    { id: 'graph', nome: 'graph.microsoft.com (Microsoft Graph)', url: 'https://graph.microsoft.com/' }
  ];

  // fetch in modalita' no-cors: non esegue nulla, dice solo se il percorso di rete esiste.
  async function provaRaggiungibilita(fetchFn, url, timeoutMs) {
    var t0 = ora();
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 6000) : null;
    try {
      await fetchFn(url, { mode: 'no-cors', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
      return { raggiungibile: true, ms: trascorsi(t0) };
    } catch (e) {
      return { raggiungibile: false, ms: trascorsi(t0), errore: e && e.name };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Gli URL facoltativi (Dataverse, SharePoint) non finiscono nel report: solo il nome.
  async function verificaRete(fetchFn, extra) {
    var bersagli = BERSAGLI_RETE.concat(extra || []);
    var out = [];
    for (var i = 0; i < bersagli.length; i++) {
      var b = bersagli[i];
      var p = await provaRaggiungibilita(fetchFn, b.url);
      out.push(esito('rete-' + b.id, b.nome, p.raggiungibile ? 'ok' : 'ko',
        p.raggiungibile
          ? 'raggiungibile (' + p.ms + ' ms)'
          : 'non raggiungibile o bloccato (rete, proxy o policy della pagina) dopo ' + p.ms + ' ms'));
    }
    return out;
  }

  // ------------------------------------------------------ 3. cartella condivisa

  // Prova su una cartella scelta dall'utente: scrittura, lettura, sovrascrittura,
  // elenco, sottocartelle, maiuscole/minuscole e tempi su molti file piccoli.
  // Tutti i file creati hanno il prefisso "_verifica_" e vengono rimossi alla fine.
  async function verificaCartella(dir, opzioni) {
    var opt = Object.assign({ file: 10, avanzamento: function () {} }, opzioni);
    var risultati = [];
    var metriche = {};
    var creati = []; // { padre, nome, ricorsivo }
    var tag = PREFISSO + Date.now().toString(36) + '_';
    var base1 = JSON.stringify({ tag: tag, versione: 1, riempimento: new Array(2001).join('x') });
    var base2 = JSON.stringify({ tag: tag, versione: 2 });
    var stato = {};

    async function passo(id, titolo, fn) {
      opt.avanzamento(titolo);
      var t0 = ora();
      try {
        var out = await fn();
        var testo = (out.dettaglio ? out.dettaglio + ' ' : '') + '(' + trascorsi(t0) + ' ms)';
        risultati.push(esito(id, titolo, out.stato || 'ok', testo));
      } catch (e) {
        risultati.push(esito(id, titolo, 'ko', descriviErrore(e)));
      }
    }

    async function scrivi(padre, nome, testo) {
      var fh = await padre.getFileHandle(nome, { create: true });
      creati.push({ padre: padre, nome: nome, ricorsivo: false });
      var w = await fh.createWritable();
      await w.write(testo);
      await w.close();
      return fh;
    }

    async function leggi(fh) {
      var f = await fh.getFile();
      return { testo: await f.text(), lastModified: f.lastModified, size: f.size };
    }

    await passo('permesso', 'Permesso sulla cartella', async function () {
      if (!dir.queryPermission) return { stato: 'info', dettaglio: 'queryPermission non disponibile' };
      var p = await dir.queryPermission({ mode: 'readwrite' });
      return { stato: p === 'granted' ? 'ok' : 'avviso', dettaglio: 'lettura/scrittura: ' + p };
    });

    await passo('scrittura', 'Creazione e scrittura di un file', async function () {
      stato.nomeA = tag + 'a.json';
      stato.fhA = await scrivi(dir, stato.nomeA, base1);
      return { dettaglio: base1.length + ' byte scritti' };
    });

    await passo('lettura', 'Rilettura del file', async function () {
      var l = await leggi(stato.fhA);
      if (l.testo !== base1) throw new Error('il contenuto letto è diverso da quello scritto');
      stato.lm1 = l.lastModified;
      return { dettaglio: 'contenuto identico, ultima modifica ' + new Date(l.lastModified).toISOString() };
    });

    await passo('sovrascrittura', 'Sovrascrittura (come un salvataggio)', async function () {
      var w = await stato.fhA.createWritable();
      await w.write(base2);
      await w.close();
      var l = await leggi(stato.fhA);
      if (l.testo !== base2) throw new Error('dopo il salvataggio il contenuto non è quello nuovo');
      return {
        stato: l.lastModified >= stato.lm1 ? 'ok' : 'avviso',
        dettaglio: 'contenuto aggiornato' + (l.lastModified >= stato.lm1 ? '' : ', ma la data di modifica non è avanzata')
      };
    });

    await passo('elenco', 'Elenco dei file della cartella', async function () {
      var file = 0;
      var cartelle = 0;
      for await (var voce of dir.entries()) {
        if (voce[1].kind === 'directory') cartelle++; else file++;
      }
      return { dettaglio: file + ' file e ' + cartelle + ' sottocartelle (inclusi i file di prova)' };
    });

    await passo('sottocartella', 'Sottocartella (per backup e archivio)', async function () {
      var nome = tag + 'dir';
      var sub = await dir.getDirectoryHandle(nome, { create: true });
      creati.push({ padre: dir, nome: nome, ricorsivo: true });
      var fh = await sub.getFileHandle('x.json', { create: true });
      var w = await fh.createWritable();
      await w.write('{}');
      await w.close();
      var l = await leggi(fh);
      if (l.testo !== '{}') throw new Error('contenuto non coerente nella sottocartella');
      return { dettaglio: 'creata, scritta e riletta' };
    });

    await passo('maiuscole', 'Nomi file: maiuscole e minuscole', async function () {
      var nome = tag + 'Maiuscole.json';
      await scrivi(dir, nome, '{}');
      var distingue;
      try {
        await dir.getFileHandle(nome.toLowerCase());
        distingue = false;
      } catch (e) {
        if (e && e.name === 'NotFoundError') distingue = true; else throw e;
      }
      metriche.distingueMaiuscole = distingue;
      return {
        stato: 'info',
        dettaglio: distingue
          ? 'le distingue: EVO-26-001 ed evo-26-001 sarebbero file diversi'
          : 'NON le distingue (atteso su Windows/OneDrive): il nome del file può garantire l\'unicità del codice'
      };
    });

    await passo('latenza', 'Tempi su ' + opt.file + ' file piccoli', async function () {
      var nomi = [];
      var t0 = ora();
      for (var i = 0; i < opt.file; i++) {
        var nome = tag + 'n' + i + '.json';
        nomi.push(nome);
        await scrivi(dir, nome, base1);
      }
      var scritturaMs = ora() - t0;
      var t1 = ora();
      for (var j = 0; j < nomi.length; j++) {
        var fh = await dir.getFileHandle(nomi[j]);
        await leggi(fh);
      }
      var letturaMs = ora() - t1;
      var perFileLettura = letturaMs / opt.file;
      var stima300 = (perFileLettura * 300) / 1000;
      metriche.file = opt.file;
      metriche.scritturaMsPerFile = Math.round(scritturaMs / opt.file);
      metriche.letturaMsPerFile = Math.round(perFileLettura);
      metriche.stimaCaricamento300FileSec = Math.round(stima300 * 10) / 10;
      return {
        stato: stima300 < 3 ? 'ok' : stima300 < 10 ? 'avviso' : 'ko',
        dettaglio: 'scrittura ' + metriche.scritturaMsPerFile + ' ms/file, lettura ' + metriche.letturaMsPerFile +
          ' ms/file: caricare 300 progetti richiederebbe circa ' + metriche.stimaCaricamento300FileSec +
          ' s (stima indicativa; la prima lettura di file OneDrive non ancora scaricati può essere più lenta)'
      };
    });

    await passo('pulizia', 'Rimozione dei file di prova', async function () {
      var errori = 0;
      for (var i = creati.length - 1; i >= 0; i--) {
        try {
          var c = creati[i];
          await c.padre.removeEntry(c.nome, c.ricorsivo ? { recursive: true } : undefined);
        } catch (e) {
          if (!e || e.name !== 'NotFoundError') errori++;
        }
      }
      var residui = 0;
      for await (var voce of dir.entries()) {
        if (voce[0].indexOf(tag) === 0) residui++;
      }
      return {
        stato: errori || residui ? 'avviso' : 'ok',
        dettaglio: errori || residui
          ? 'restano ' + residui + ' elementi "' + tag + '*" da cancellare a mano'
          : creati.length + ' elementi rimossi, nessun residuo'
      };
    });

    return { risultati: risultati, metriche: metriche };
  }

  // ----------------------------------- 4. modifiche fatte da altri utenti (sync)

  async function scriviJson(dir, nome, oggetto) {
    var fh = await dir.getFileHandle(nome, { create: true });
    var w = await fh.createWritable();
    await w.write(JSON.stringify(oggetto));
    await w.close();
  }

  async function leggiControllo(dir) {
    var fh = await dir.getFileHandle(FILE_CONTROLLO);
    var f = await fh.getFile();
    var dati = JSON.parse(await f.text());
    return {
      rev: dati.rev,
      ultimoScrittore: dati.ultimoScrittore,
      quando: dati.quando,
      lastModified: f.lastModified,
      size: f.size
    };
  }

  async function creaControllo(dir, chi) {
    await scriviJson(dir, FILE_CONTROLLO, { rev: 1, ultimoScrittore: chi, quando: new Date().toISOString() });
    return leggiControllo(dir);
  }

  // Lettura + scrittura non atomica, come farebbe un salvataggio dell'app.
  async function incrementaControllo(dir, chi) {
    var rev = 0;
    try {
      rev = (await leggiControllo(dir)).rev;
    } catch (e) {
      if (!e || e.name !== 'NotFoundError') throw e;
    }
    await scriviJson(dir, FILE_CONTROLLO, { rev: rev + 1, ultimoScrittore: chi, quando: new Date().toISOString() });
    return leggiControllo(dir);
  }

  // Quante copie "extra" del file di controllo esistono (es. copie di conflitto di OneDrive).
  async function contaCopieControllo(dir) {
    var n = 0;
    for await (var voce of dir.entries()) {
      if (voce[1].kind === 'file' && voce[0] !== FILE_CONTROLLO && voce[0].indexOf(PREFISSO + 'controllo') === 0) n++;
    }
    return n;
  }

  async function eliminaControllo(dir) {
    var nomi = [];
    for await (var voce of dir.entries()) {
      if (voce[1].kind === 'file' && voce[0].indexOf(PREFISSO + 'controllo') === 0) nomi.push(voce[0]);
    }
    for (var i = 0; i < nomi.length; i++) await dir.removeEntry(nomi[i]);
    return nomi.length;
  }

  // -------------------------------------------------- 5. questionario manuale

  var NON_RISPOSTO = '(non risposto)';

  var DOMANDE = [
    { id: 'html-sharepoint', testo: 'Un file .html caricato in una libreria SharePoint, aperto dal browser...',
      opzioni: ['Non provato', 'Si apre e funziona', 'Viene scaricato', 'È bloccato o dà errore'] },
    { id: 'browser-colleghi', testo: 'Browser usato dai colleghi',
      opzioni: ['Edge', 'Chrome', 'Misto o altro', 'Non so'] },
    { id: 'scrittori', testo: 'Quante persone scriveranno dati (te compreso)',
      opzioni: ['1-2', '3-5', '6-10', 'Più di 10', 'Non so'] },
    { id: 'dataverse-tipo', testo: 'Tipo di Dataverse disponibile',
      opzioni: ['Dataverse in un ambiente completo', 'Dataverse for Teams', 'Non so'] },
    { id: 'dataverse-tabelle', testo: 'Posso creare tabelle Dataverse in un ambiente di sviluppo/sandbox',
      opzioni: ['Sì', 'No', 'Non so'] },
    { id: 'dataverse-condivisione', testo: 'Posso dare ai colleghi accesso ai dati/app (ruoli di sicurezza)',
      opzioni: ['Sì', 'No', 'Non so'] },
    { id: 'entra', testo: 'Posso registrare un\'app in Microsoft Entra ID (o ottenerlo dall\'IT in tempi ragionevoli)',
      opzioni: ['Sì', 'No', 'Non so'] },
    { id: 'code-apps', testo: 'Le "code apps" di Power Apps sono abilitate nel mio ambiente',
      opzioni: ['Sì', 'No', 'Non so'] },
    { id: 'power-automate', testo: 'Power Automate (flussi cloud) disponibile',
      opzioni: ['Sì', 'No', 'Non so'] },
    { id: 'liste-sharepoint', testo: 'Posso creare liste SharePoint in un sito condiviso con i colleghi',
      opzioni: ['Sì', 'No', 'Non so'] },
    { id: 'posizione-dati', testo: 'Dove metteresti i dati condivisi se usassimo una cartella',
      opzioni: ['Libreria SharePoint sincronizzata con OneDrive', 'Cartella OneDrive condivisa', 'Share di rete (SMB)', 'Altro'] }
  ];

  // -------------------------------------------------------------- 6. report

  var ETICHETTE = { ok: 'OK', ko: 'KO', avviso: 'ATTENZIONE', info: 'INFO' };

  function righe(titolo, elenco) {
    var t = ['', '## ' + titolo];
    if (!elenco || !elenco.length) {
      t.push('- (non eseguito)');
      return t;
    }
    elenco.forEach(function (r) {
      t.push('- [' + (ETICHETTE[r.stato] || r.stato) + '] ' + r.titolo + ': ' + r.dettaglio);
    });
    return t;
  }

  // dati: { generatoIl, ambiente, rete, cartella, metriche, persistenza, monitor, risposte, note }
  function costruisciReport(dati) {
    var t = [
      '# Verifica ambiente - report',
      'Generato il: ' + (dati.generatoIl || new Date().toISOString()),
      'Versione pagina di verifica: ' + VERSIONE
    ];
    t = t.concat(righe('Ambiente', dati.ambiente));
    t = t.concat(righe('Rete', dati.rete));
    t = t.concat(righe('Cartella condivisa', dati.cartella));

    if (dati.persistenza) {
      t.push('- [' + (ETICHETTE[dati.persistenza.stato] || dati.persistenza.stato) + '] ' +
        dati.persistenza.titolo + ': ' + dati.persistenza.dettaglio);
    }

    t.push('', '## Modifiche fatte da altri utenti (sincronizzazione)');
    if (!dati.monitor || !dati.monitor.length) {
      t.push('- (nessuna modifica rilevata o test non eseguito)');
    } else {
      dati.monitor.forEach(function (m) {
        t.push('- dopo ' + m.tSec + ' s: rev ' + m.rev + ' scritta da ' + m.scrittore +
          ' (copie di conflitto presenti: ' + m.copie + ')');
      });
    }

    t.push('', '## Questionario');
    DOMANDE.forEach(function (d) {
      var r = dati.risposte && dati.risposte[d.id];
      t.push('- ' + d.testo + ': ' + (r || NON_RISPOSTO));
    });

    t.push('', '## Note', dati.note && dati.note.trim() ? dati.note.trim() : '(nessuna)');

    return {
      testo: t.join('\n'),
      json: {
        versione: VERSIONE,
        generatoIl: dati.generatoIl,
        ambiente: dati.ambiente || [],
        rete: dati.rete || [],
        cartella: dati.cartella || [],
        metriche: dati.metriche || null,
        persistenza: dati.persistenza || null,
        monitor: dati.monitor || [],
        risposte: dati.risposte || {},
        note: dati.note || ''
      }
    };
  }

  var api = {
    VERSIONE: VERSIONE,
    FILE_CONTROLLO: FILE_CONTROLLO,
    NON_RISPOSTO: NON_RISPOSTO,
    ETICHETTE: ETICHETTE,
    DOMANDE: DOMANDE,
    BERSAGLI_RETE: BERSAGLI_RETE,
    esito: esito,
    descriviErrore: descriviErrore,
    classificaOrigine: classificaOrigine,
    raccogliAmbiente: raccogliAmbiente,
    provaRaggiungibilita: provaRaggiungibilita,
    verificaRete: verificaRete,
    verificaCartella: verificaCartella,
    creaControllo: creaControllo,
    leggiControllo: leggiControllo,
    incrementaControllo: incrementaControllo,
    contaCopieControllo: contaCopieControllo,
    eliminaControllo: eliminaControllo,
    costruisciReport: costruisciReport
  };

  radice.Verifica = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
