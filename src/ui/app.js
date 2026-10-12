/* Avvio dell'applicazione: schermata iniziale, apertura della cartella dei dati, schede, avvisi
 * (copie di conflitto, file illeggibili) e ricaricamento dei dati.
 */
(function (radice) {
  'use strict';

  const MP = radice.MP;
  const UI = MP.ui;
  const { h, sostituisci } = UI;
  const Codice = MP.codice;
  const Modello = MP.modello;

  const radiceDom = document.getElementById('radice');

  UI.viste = UI.viste || {};
  UI.stato = {
    adapter: null,            // adapter di salvataggio (cartella o memoria)
    modalita: null,           // 'cartella' | 'demo'
    voci: [],                 // [{ progetto, rev }]
    copieConflitto: [],
    erroriFile: [],
    config: Modello.creaConfigurazione(),
    filtri: { testo: '', fasi: [] },
    ordinamento: { campo: 'codice', direzione: 1 },
    vista: 'riepilogo',
    caricatoIl: 0
  };

  UI.progetti = () => UI.stato.voci.map((v) => v.progetto);
  UI.voce = (codice) => UI.stato.voci.find((v) => Codice.uguali(v.progetto.codice, codice)) || null;

  // Dopo un salvataggio riuscito: aggiorna l'elenco locale senza rileggere la cartella.
  UI.registraVoce = function (esito, codicePrecedente) {
    const chiavi = [Codice.chiave(esito.progetto.codice)];
    if (codicePrecedente) chiavi.push(Codice.chiave(codicePrecedente));
    const S = UI.stato;
    S.voci = S.voci.filter((v) => !chiavi.includes(Codice.chiave(v.progetto.codice)));
    S.voci.push({ progetto: esito.progetto, rev: esito.rev });
    S.voci.sort((a, b) => (Codice.chiave(a.progetto.codice) < Codice.chiave(b.progetto.codice) ? -1 : 1));
  };

  // ------------------------------------------------- cartella ricordata (IndexedDB)

  function apriDb() {
    return new Promise((ok, ko) => {
      const r = indexedDB.open('monitoraggio-progetti', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('handles');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    });
  }

  async function salvaHandle(handle) {
    const db = await apriDb();
    return new Promise((ok, ko) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, 'cartella');
      tx.oncomplete = () => ok();
      tx.onerror = () => ko(tx.error);
    });
  }

  async function leggiHandle() {
    const db = await apriDb();
    return new Promise((ok, ko) => {
      const rq = db.transaction('handles').objectStore('handles').get('cartella');
      rq.onsuccess = () => ok(rq.result || null);
      rq.onerror = () => ko(rq.error);
    });
  }

  // ------------------------------------------------------------------ dati

  async function caricaDati() {
    const S = UI.stato;
    const [elenco, config] = await Promise.all([S.adapter.elenca(), S.adapter.leggiConfigurazione()]);
    S.voci = elenco.progetti;
    S.copieConflitto = elenco.copieConflitto;
    S.erroriFile = elenco.errori;
    S.config = config;
    S.caricatoIl = Date.now();
  }

  // Rilegge la cartella e ridisegna. Non lancia: mostra l'errore.
  UI.ricarica = async function () {
    if (!UI.stato.adapter) return false;
    try {
      await caricaDati();
      UI.aggiorna();
      return true;
    } catch (e) {
      UI.toast('Impossibile leggere i dati: ' + e.message + (e.name === 'NotAllowedError' ? ' (permesso sulla cartella scaduto: riaprila)' : ''), 'errore');
      return false;
    }
  };

  // ------------------------------------------------------------ schermata iniziale

  async function mostraAvvio(messaggio) {
    UI.stato.adapter = null;
    UI.stato.modalita = null;
    const supportata = typeof radice.showDirectoryPicker === 'function';
    let ultima = null;
    if (supportata && radice.indexedDB) {
      try { ultima = await leggiHandle(); } catch (e) { ultima = null; }
    }

    sostituisci(radiceDom, h('main', { class: 'avvio' }, h('div', { class: 'carta' },
      h('h1', {}, '📊 Monitoraggio Progetti'),
      h('p', {}, 'Evolutive, ordini, attività, VPU e carico FTE. I dati stanno in una cartella condivisa: apri quella del tuo gruppo.'),
      messaggio ? h('div', { class: 'banner banner-avviso', role: 'alert' }, messaggio) : null,
      !supportata ? h('div', { class: 'banner banner-errore' },
        'Questo browser non permette di aprire cartelle. Usa Microsoft Edge o Google Chrome.') : null,
      h('div', { class: 'azioni', style: { marginTop: '14px' } },
        supportata ? h('button', { type: 'button', class: 'btn btn-primario', onclick: scegliCartella }, 'Apri la cartella dei dati') : null,
        ultima ? h('button', { type: 'button', class: 'btn btn-secondario', onclick: () => riapri(ultima) }, 'Riapri «' + ultima.name + '»') : null,
        h('button', { type: 'button', class: 'btn btn-secondario', onclick: avviaDemo }, 'Prova con dati di esempio')),
      h('p', { class: 'nota' }, 'I dati di esempio restano solo in questa pagina: non scrivono nulla su disco.'))));
  }

  async function scegliCartella() {
    let handle;
    try {
      handle = await radice.showDirectoryPicker({ id: 'monitoraggio-progetti', mode: 'readwrite' });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      mostraAvvio('Impossibile aprire questa cartella (' + e.message + '). Se è una cartella di sistema come Documenti o Desktop, scegli una sua sottocartella.');
      return;
    }
    await apriCartella(handle);
  }

  async function riapri(handle) {
    try {
      let permesso = await handle.queryPermission({ mode: 'readwrite' });
      if (permesso !== 'granted') permesso = await handle.requestPermission({ mode: 'readwrite' });
      if (permesso !== 'granted') {
        mostraAvvio('Permesso negato sulla cartella «' + handle.name + '».');
        return;
      }
    } catch (e) {
      mostraAvvio('Impossibile riaprire la cartella «' + handle.name + '»: ' + e.message);
      return;
    }
    await apriCartella(handle);
  }

  async function apriCartella(handle) {
    const S = UI.stato;
    try {
      S.adapter = await MP.cartella.creaCartella(handle);
      S.modalita = 'cartella';
      await caricaDati();
    } catch (e) {
      await mostraAvvio('Errore nell\'apertura della cartella: ' + e.message);
      return;
    }
    if (radice.indexedDB) salvaHandle(handle).catch(() => {});
    mostraApp();
  }

  async function avviaDemo() {
    const S = UI.stato;
    S.adapter = MP.memoria.creaMemoria({
      progetti: UI.datiDemo(UI.oggiIso()).map((p) => ({ progetto: p, rev: 1 })),
      config: { destinatariVpu: ['vpu@esempio.it'] }
    });
    S.modalita = 'demo';
    await caricaDati();
    mostraApp();
  }

  // Solo per lo sviluppo: ?opfs usa una cartella privata del browser al posto di quella condivisa.
  async function avviaOpfs() {
    const radiceOpfs = await navigator.storage.getDirectory();
    await apriCartella(await radiceOpfs.getDirectoryHandle('monitoraggio-dev', { create: true }));
  }

  // ----------------------------------------------------------------- applicazione

  const SCHEDE = ['riepilogo', 'vpu', 'scadenze', 'fte'];

  function mostraApp() {
    const S = UI.stato;
    const demo = S.modalita === 'demo';

    const testata = h('header', { class: 'testata' },
      h('div', {}, h('h1', {}, '📊 Monitoraggio Progetti'), h('p', {}, 'Gestione del portafoglio progetti, ordini e attività')),
      h('span', { class: 'spazio' }),
      h('div', { class: 'cartella-attiva' + (demo ? ' demo' : '') },
        demo ? 'Dati di prova: non vengono salvati' : '📁 ' + S.adapter.nome,
        h('button', { type: 'button', class: 'btn btn-chiaro', onclick: () => mostraAvvio() }, demo ? 'Esci' : 'Cambia cartella')));

    const barra = h('div', { class: 'barra' },
      h('button', { type: 'button', class: 'btn btn-ok', onclick: () => UI.apriModulo(null) }, '+ Nuovo progetto'),
      h('button', { type: 'button', class: 'btn btn-scuro', onclick: () => UI.apriImportazione() }, 'Importa CSV'),
      h('span', { class: 'spazio' }),
      h('button', { type: 'button', class: 'btn btn-secondario', onclick: async () => { if (await UI.ricarica()) UI.toast('Dati aggiornati', 'ok'); } }, '↻ Aggiorna'),
      h('button', { type: 'button', class: 'btn btn-secondario', onclick: () => UI.apriImpostazioni() }, '⚙ Impostazioni'));

    sostituisci(radiceDom, h('div', { class: 'contenitore' },
      testata, barra,
      h('div', { id: 'banner' }),
      h('div', { class: 'schede', role: 'tablist', id: 'schede' }),
      h('main', { class: 'pannello', id: 'contenuto', role: 'tabpanel' })));
    UI.aggiorna();
  }

  UI.aggiorna = function () {
    const contenuto = document.getElementById('contenuto');
    if (!contenuto) return;
    disegnaBanner();
    disegnaSchede();
    if (UI.vistaAttiva && UI.vistaAttiva.chiudi) UI.vistaAttiva.chiudi();
    UI.vistaAttiva = UI.viste[UI.stato.vista];
    UI.vistaAttiva.disegna(contenuto);
  };

  function disegnaSchede() {
    const S = UI.stato;
    sostituisci(document.getElementById('schede'), SCHEDE.map((k) => {
      const v = UI.viste[k];
      const conta = v.conta ? v.conta() : null;
      return h('button', {
        type: 'button', class: 'scheda', role: 'tab', 'aria-selected': String(S.vista === k),
        onclick: () => { S.vista = k; UI.aggiorna(); }
      }, v.titolo, conta ? h('span', { class: 'conta' + (v.allerta ? ' allerta' : '') }, String(conta)) : null);
    }));
  }

  function disegnaBanner() {
    const S = UI.stato;
    const box = document.getElementById('banner');
    const voci = [];

    if (S.copieConflitto.length) {
      voci.push(h('div', { class: 'banner banner-avviso', role: 'alert' },
        h('span', { class: 'spazio' }, '⚠ ' + S.copieConflitto.length + (S.copieConflitto.length === 1 ? ' copia di conflitto' : ' copie di conflitto') +
          ': due persone hanno salvato lo stesso progetto quasi insieme e OneDrive ha tenuto entrambe le versioni.'),
        h('button', { type: 'button', class: 'btn btn-primario btn-piccolo', onclick: apriConflitti }, 'Risolvi…')));
    }
    if (S.erroriFile.length) {
      voci.push(h('div', { class: 'banner banner-errore', role: 'alert' },
        h('span', { class: 'spazio' }, '⚠ ' + S.erroriFile.length + (S.erroriFile.length === 1 ? ' file non leggibile' : ' file non leggibili') +
          ' nella cartella dei progetti: ' + S.erroriFile.map((e) => e.file + ' (' + e.messaggio + ')').join('; ') +
          '. Non vengono mostrati né modificati.')));
    }
    if (S.modalita === 'cartella' && S.adapter.nuova && !S.voci.length) {
      voci.push(h('div', { class: 'banner banner-info' },
        'Cartella nuova, senza progetti. Il primo salvataggio crea le cartelle progetti e backup; puoi anche importare un CSV.'));
    }
    sostituisci(box, voci);
  }

  // ------------------------------------------------------------ copie di conflitto

  const riassunto = (campo, p) => {
    if (campo === 'ordini') return p.ordini.map((o) => o.riferimento + ' (' + UI.euro(o.importo) + ')').join(', ') || 'nessuno';
    if (campo === 'attivita') return p.attivita.length + ' attività';
    const v = String(p[campo] == null ? '' : p[campo]);
    return v.length > 90 ? v.slice(0, 90) + '…' : (v || '-');
  };

  async function apriConflitti() {
    const S = UI.stato;
    if (!S.copieConflitto.length) return;

    const carte = S.copieConflitto.map((c) => {
      const originale = UI.voce(c.codice);
      const diversi = originale ? Modello.differenze(originale.progetto, c.progetto).filter((k) => k !== 'codice') : [];
      const risolvi = async (scelta) => {
        try {
          await S.adapter.risolviCopia(c.file, scelta);
          UI.toast(scelta === 'usa' ? 'La copia è diventata la versione corrente' : 'Copia scartata', 'ok');
          await UI.ricarica();
          d.chiudi('fatto');
        } catch (e) {
          UI.toast('Operazione non riuscita: ' + e.message, 'errore');
        }
      };
      return h('div', { class: 'scheda-info' },
        h('div', { class: 'titolo-scheda' }, c.codice),
        h('p', { class: 'tenue', style: { margin: '2px 0 8px' } },
          'File ' + c.file + ', salvato il ' + new Date(c.modificato).toLocaleString('it-IT') + '.'),
        originale && diversi.length
          ? h('table', { class: 'dati' },
            h('thead', {}, h('tr', {}, h('th', {}, 'Campo'), h('th', {}, 'Originale'), h('th', {}, 'Copia'))),
            h('tbody', {}, diversi.map((k) => h('tr', {},
              h('td', {}, UI.etichetteCampi[k] || k), h('td', {}, riassunto(k, originale.progetto)), h('td', {}, riassunto(k, c.progetto))))))
          : h('p', {}, originale ? 'La copia è identica all\'originale.' : 'L\'originale non esiste più: la copia può diventare il progetto.'),
        h('div', { style: { marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          h('button', { type: 'button', class: 'btn btn-secondario btn-piccolo', onclick: () => risolvi('elimina') }, 'Tieni l\'originale, scarta la copia'),
          h('button', { type: 'button', class: 'btn btn-primario btn-piccolo', onclick: () => risolvi('usa') }, 'Usa la copia al posto dell\'originale')));
    });

    const d = UI.dialogo({
      titolo: 'Copie di conflitto',
      larghezza: 'min(860px, 97vw)',
      contenuto: h('div', {},
        h('p', {}, 'Ogni copia contiene una versione diversa dello stesso progetto. Scegli quale tenere: l\'altra resta comunque nella cartella backup.'),
        carte),
      pulsanti: [{ testo: 'Chiudi', valore: 'chiudi' }]
    });
    const esito = await d.finita;
    if (esito === 'fatto' && UI.stato.copieConflitto.length) apriConflitti();
  }

  // --------------------------------------------------------------------- avvio

  // Tornando sulla pagina dopo un po', rilegge la cartella: i colleghi potrebbero aver salvato.
  document.addEventListener('visibilitychange', () => {
    const S = UI.stato;
    if (document.visibilityState !== 'visible' || !S.adapter || S.modalita !== 'cartella') return;
    if (Date.now() - S.caricatoIl < 30000 || document.querySelector('dialog[open]')) return;
    UI.ricarica();
  });

  radice.addEventListener('unhandledrejection', (e) => {
    UI.toast('Errore imprevisto: ' + (e.reason && e.reason.message ? e.reason.message : e.reason), 'errore');
  });

  function avvia() {
    const q = new URLSearchParams(radice.location.search);
    if (q.has('demo')) return avviaDemo();
    if (q.has('opfs') && navigator.storage && navigator.storage.getDirectory) return avviaOpfs();
    return mostraAvvio();
  }

  UI.avvia = avvia;
  avvia();
})(window);
