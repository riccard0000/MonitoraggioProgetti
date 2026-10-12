/* Avvio dell'applicazione: schermata iniziale, apertura della cartella dei dati (uno o piu' team),
 * schede, avvisi (copie di conflitto, file illeggibili, sola lettura) e ricaricamento dei dati.
 */
(function (radice) {
  'use strict';

  const MP = radice.MP;
  const UI = MP.ui;
  const { h, sostituisci } = UI;
  const Codice = MP.codice;
  const Modello = MP.modello;

  const radiceDom = document.getElementById('radice');
  const $ = (id) => document.getElementById(id);

  // «Sola consultazione» si ricorda su questo PC: chi deve solo vedere (il responsabile) la attiva
  // una volta e basta.
  const leggiPreferenza = () => { try { return radice.localStorage.getItem('mp-consultazione') === '1'; } catch (e) { return false; } };
  const salvaPreferenza = (v) => { try { radice.localStorage.setItem('mp-consultazione', v ? '1' : '0'); } catch (e) { /* facoltativo */ } };

  UI.viste = UI.viste || {};
  UI.stato = {
    adapter: null,            // archivio di salvataggio (uno o piu' team)
    modalita: null,           // 'cartella' | 'demo'
    voci: [],                 // [{ progetto, rev, team }]
    squadre: [],              // stato dei team: [{ nome, ok, scrivibile, soloLettura, motivo, nuova, ... }]
    configPerTeam: {},        // { nomeTeam: configurazione }
    consultazione: leggiPreferenza(),
    copieConflitto: [],
    erroriFile: [],
    filtri: { testo: '', fasi: [], team: '' },
    ordinamento: { campo: 'codice', direzione: 1 },
    vista: 'riepilogo',
    caricatoIl: 0
  };

  // ----------------------------------------------------------------- accesso ai dati

  UI.progetti = () => UI.stato.voci.map((v) => v.progetto);
  UI.voce = (codice, team) => UI.stato.voci.find((v) => Codice.uguali(v.progetto.codice, codice) && (!team || v.team === team)) || null;
  UI.teamDi = (codice) => { const v = UI.voce(codice); return v ? v.team : ''; };
  UI.multi = () => UI.stato.squadre.length > 1;
  UI.squadreScrivibili = () => UI.stato.squadre.filter((s) => s.scrivibile);

  // Si puo' scrivere nel team indicato? Senza argomento: si puo' scrivere in almeno un team?
  UI.scrivibile = (team) => {
    if (team) return UI.stato.squadre.some((s) => s.nome === team && s.scrivibile);
    return UI.stato.squadre.some((s) => s.scrivibile);
  };

  // Configurazione di un team (senza argomento: del primo team).
  UI.config = (team) => {
    const S = UI.stato;
    const nome = team || (S.squadre[0] && S.squadre[0].nome);
    return S.configPerTeam[nome] || Modello.creaConfigurazione();
  };

  // Dopo un salvataggio riuscito: aggiorna l'elenco locale senza rileggere la cartella.
  UI.registraVoce = function (esito, codicePrecedente) {
    const S = UI.stato;
    const chiavi = [Codice.chiave(esito.progetto.codice)];
    if (codicePrecedente) chiavi.push(Codice.chiave(codicePrecedente));
    S.voci = S.voci.filter((v) => !(v.team === esito.team && chiavi.includes(Codice.chiave(v.progetto.codice))));
    S.voci.push({ progetto: esito.progetto, rev: esito.rev, team: esito.team });
    S.voci.sort((a, b) => {
      const ka = Codice.chiave(a.progetto.codice);
      const kb = Codice.chiave(b.progetto.codice);
      return ka !== kb ? (ka < kb ? -1 : 1) : (a.team < b.team ? -1 : 1);
    });
    if (S.adapter) S.squadre = S.adapter.squadre();
  };

  // Se la scrittura e' stata rifiutata perche' si e' in sola lettura, lo dice e aggiorna lo stato.
  // -> true se l'errore era di questo tipo (e quindi e' gia' stato gestito).
  UI.gestisciErroreScrittura = function (e) {
    if (!e || e.name !== 'SolaLettura') return false;
    const S = UI.stato;
    if (S.adapter) S.squadre = S.adapter.squadre();
    UI.toast(e.message, 'avviso');
    UI.aggiorna();
    return true;
  };

  UI.impostaConsultazione = function (valore) {
    const S = UI.stato;
    S.consultazione = !!valore;
    if (S.adapter) {
      S.adapter.impostaConsultazione(S.consultazione);
      S.squadre = S.adapter.squadre();
    }
    if (S.modalita !== 'demo') salvaPreferenza(S.consultazione);
    UI.aggiorna();
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
    const elenco = await S.adapter.elenca();
    S.voci = elenco.progetti;
    S.copieConflitto = elenco.copieConflitto;
    S.erroriFile = elenco.errori;
    S.configPerTeam = await S.adapter.configurazioni();
    S.squadre = S.adapter.squadre();
    if (S.filtri.team && !S.squadre.some((s) => s.nome === S.filtri.team)) S.filtri.team = '';
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
    const S = UI.stato;
    S.adapter = null;
    S.modalita = null;
    S.voci = [];
    S.squadre = [];
    const supportata = typeof radice.showDirectoryPicker === 'function';
    let ultima = null;
    if (supportata && radice.indexedDB) {
      try { ultima = await leggiHandle(); } catch (e) { ultima = null; }
    }

    sostituisci(radiceDom, h('main', { class: 'avvio' }, h('div', { class: 'carta' },
      h('h1', {}, '📊 Monitoraggio Progetti'),
      h('p', {}, 'Evolutive, ordini, attività, VPU e carico FTE. I dati stanno in una cartella condivisa: apri quella del tuo gruppo, oppure la cartella con tutti i team.'),
      messaggio ? h('div', { class: 'banner banner-avviso', role: 'alert' }, messaggio) : null,
      !supportata ? h('div', { class: 'banner banner-errore' },
        'Questo browser non permette di aprire cartelle. Usa Microsoft Edge o Google Chrome.') : null,
      h('div', { class: 'azioni', style: { marginTop: '14px' } },
        supportata ? h('button', { type: 'button', class: 'btn btn-primario', onclick: scegliCartella }, 'Apri la cartella dei dati') : null,
        ultima ? h('button', { type: 'button', class: 'btn btn-secondario', onclick: () => riapri(ultima) }, 'Riapri «' + ultima.name + '»') : null,
        h('button', { type: 'button', class: 'btn btn-secondario', onclick: avviaDemo }, 'Prova con dati di esempio')),
      supportata ? h('label', { class: 'interruttore interruttore-avvio', title: 'Per chi deve solo vedere i progetti: l\'app non permette nessuna modifica' },
        h('input', { type: 'checkbox', checked: S.consultazione, onchange: (e) => { S.consultazione = e.target.checked; salvaPreferenza(S.consultazione); } }),
        ' Apri in sola consultazione (per chi deve solo vedere)') : null,
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
      S.adapter = await MP.archivio.apriArchivio(handle, { consultazione: S.consultazione });
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
    S.consultazione = false;
    S.adapter = MP.archivio.creaArchivio(UI.squadreDemo(UI.oggiIso()).map((s) => ({
      nome: s.nome,
      adapter: MP.memoria.creaMemoria({ progetti: s.progetti.map((p) => ({ progetto: p, rev: 1 })), config: s.config })
    })), { nome: 'Dati di prova' });
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
    sostituisci(radiceDom, h('div', { class: 'contenitore' },
      h('header', { class: 'testata', id: 'testata' }),
      h('div', { class: 'barra', id: 'barra' }),
      h('div', { id: 'banner' }),
      h('div', { class: 'schede', role: 'tablist', id: 'schede' }),
      h('main', { class: 'pannello', id: 'contenuto', role: 'tabpanel' })));
    UI.aggiorna();
  }

  UI.aggiorna = function () {
    const contenuto = $('contenuto');
    if (!contenuto) return;
    disegnaTestata();
    disegnaBarra();
    disegnaBanner();
    disegnaSchede();
    if (UI.vistaAttiva && UI.vistaAttiva.chiudi) UI.vistaAttiva.chiudi();
    UI.vistaAttiva = UI.viste[UI.stato.vista];
    UI.vistaAttiva.disegna(contenuto);
  };

  function disegnaTestata() {
    const S = UI.stato;
    const demo = S.modalita === 'demo';
    sostituisci($('testata'),
      h('div', {}, h('h1', {}, '📊 Monitoraggio Progetti'), h('p', {}, 'Gestione del portafoglio progetti, ordini e attività')),
      h('span', { class: 'spazio' }),
      h('div', { class: 'cartella-attiva' + (demo ? ' demo' : '') },
        (demo ? 'Dati di prova: non vengono salvati' : '📁 ' + S.adapter.nome) + (UI.multi() ? ' · ' + S.squadre.length + ' team' : ''),
        h('label', { class: 'interruttore', title: 'Non permette nessuna modifica: per chi deve solo vedere i progetti' },
          h('input', { type: 'checkbox', checked: S.consultazione, onchange: (e) => UI.impostaConsultazione(e.target.checked) }),
          ' Sola consultazione'),
        h('button', { type: 'button', class: 'btn btn-chiaro', onclick: () => mostraAvvio() }, demo ? 'Esci' : 'Cambia cartella')));
  }

  function disegnaBarra() {
    const S = UI.stato;
    const puoScrivere = UI.scrivibile();
    const perche = S.consultazione
      ? 'In sola consultazione non si può modificare'
      : 'Nessun team in cui hai il permesso di modificare';
    sostituisci($('barra'),
      h('button', { type: 'button', class: 'btn btn-ok', disabled: !puoScrivere, title: puoScrivere ? null : perche, onclick: () => UI.apriModulo(null) }, '+ Nuovo progetto'),
      h('button', { type: 'button', class: 'btn btn-scuro', disabled: !puoScrivere, title: puoScrivere ? null : perche, onclick: () => UI.apriImportazione() }, 'Importa CSV'),
      h('span', { class: 'spazio' }),
      h('button', { type: 'button', class: 'btn btn-secondario', onclick: async () => { if (await UI.ricarica()) UI.toast('Dati aggiornati', 'ok'); } }, '↻ Aggiorna'),
      h('button', { type: 'button', class: 'btn btn-secondario', onclick: () => UI.apriImpostazioni() }, '⚙ Impostazioni'));
  }

  function disegnaSchede() {
    const S = UI.stato;
    sostituisci($('schede'), SCHEDE.map((k) => {
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
    const voci = [];
    const multi = UI.multi();

    if (S.consultazione) {
      voci.push(h('div', { class: 'banner banner-info' },
        '👁 Sola consultazione: puoi vedere tutto ma non modificare nulla. Chi deve modificare la disattiva in alto.'));
    } else {
      const inSolaLettura = S.squadre.filter((s) => s.soloLettura && s.ok);
      if (inSolaLettura.length) {
        voci.push(h('div', { class: 'banner banner-info' },
          '🔒 In sola lettura: ' + inSolaLettura.map((s) => s.nome).join(', ') +
          '. La cartella non permette di modificare (permessi di SharePoint): i progetti si vedono ma non si possono cambiare.'));
      }
    }

    if (S.copieConflitto.length) {
      const risolvibili = S.copieConflitto.some((c) => UI.scrivibile(c.team));
      voci.push(h('div', { class: 'banner banner-avviso', role: 'alert' },
        h('span', { class: 'spazio' }, '⚠ ' + S.copieConflitto.length + (S.copieConflitto.length === 1 ? ' copia di conflitto' : ' copie di conflitto') +
          ': due persone hanno salvato lo stesso progetto quasi insieme e OneDrive ha tenuto entrambe le versioni.' +
          (risolvibili ? '' : ' Le risolve chi ha il permesso di modificare il team.')),
        h('button', { type: 'button', class: 'btn btn-primario btn-piccolo', onclick: apriConflitti }, risolvibili ? 'Risolvi…' : 'Vedi…')));
    }

    if (S.erroriFile.length) {
      voci.push(h('div', { class: 'banner banner-errore', role: 'alert' },
        h('span', { class: 'spazio' }, '⚠ ' + S.erroriFile.length + (S.erroriFile.length === 1 ? ' elemento non leggibile' : ' elementi non leggibili') +
          ' nella cartella dei dati: ' +
          S.erroriFile.map((e) => ((multi && e.team && e.team !== e.file) ? e.team + '/' : '') + e.file + ' (' + e.messaggio + ')').join('; ') +
          '. Non vengono mostrati né modificati.')));
    }

    const configRotte = S.squadre.filter((s) => s.erroreConfig);
    if (configRotte.length) {
      voci.push(h('div', { class: 'banner banner-avviso', role: 'alert' },
        'Impostazioni non leggibili: ' + configRotte.map((s) => s.nome + ' (' + s.erroreConfig + ')').join('; ') +
        '. Si usano i valori predefiniti: non salvare le impostazioni finché non è risolto.'));
    }

    if (multi) {
      const perCodice = new Map();
      S.voci.forEach((v) => {
        const k = Codice.chiave(v.progetto.codice);
        if (!perCodice.has(k)) perCodice.set(k, []);
        perCodice.get(k).push(v.team);
      });
      const doppi = Array.from(perCodice.entries()).filter(([, team]) => team.length > 1);
      if (doppi.length) {
        voci.push(h('div', { class: 'banner banner-avviso', role: 'alert' },
          '⚠ Codici presenti in più team (non previsto): ' +
          doppi.map(([k, team]) => k + ' (' + team.join(', ') + ')').join('; ') + '.'));
      }
    }

    if (S.modalita === 'cartella' && S.adapter.nuova && !S.voci.length) {
      voci.push(h('div', { class: 'banner banner-info' }, multi
        ? 'Le cartelle dei team sono ancora vuote. Il primo salvataggio in un team crea al suo interno le cartelle progetti e backup. Le cartelle dei team le crea il proprietario del sito, con i permessi giusti.'
        : 'Cartella nuova, senza progetti. Il primo salvataggio crea le cartelle progetti e backup; puoi anche importare un CSV.'));
    }
    sostituisci($('banner'), voci);
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
    const multi = UI.multi();

    const carte = S.copieConflitto.map((c) => {
      const originale = UI.voce(c.codice, c.team);
      const diversi = originale ? Modello.differenze(originale.progetto, c.progetto).filter((k) => k !== 'codice') : [];
      const puoRisolvere = UI.scrivibile(c.team);
      const risolvi = async (scelta) => {
        try {
          await S.adapter.risolviCopia(c.file, scelta, c.team);
          UI.toast(scelta === 'usa' ? 'La copia è diventata la versione corrente' : 'Copia scartata', 'ok');
          await UI.ricarica();
          d.chiudi('fatto');
        } catch (e) {
          if (!UI.gestisciErroreScrittura(e)) UI.toast('Operazione non riuscita: ' + e.message, 'errore');
        }
      };
      return h('div', { class: 'scheda-info' },
        h('div', { class: 'titolo-scheda' }, c.codice + (multi ? ' — ' + c.team : '')),
        h('p', { class: 'tenue', style: { margin: '2px 0 8px' } },
          'File ' + c.file + ', salvato il ' + new Date(c.modificato).toLocaleString('it-IT') + '.'),
        originale && diversi.length
          ? h('table', { class: 'dati' },
            h('thead', {}, h('tr', {}, h('th', {}, 'Campo'), h('th', {}, 'Originale'), h('th', {}, 'Copia'))),
            h('tbody', {}, diversi.map((k) => h('tr', {},
              h('td', {}, UI.etichetteCampi[k] || k), h('td', {}, riassunto(k, originale.progetto)), h('td', {}, riassunto(k, c.progetto))))))
          : h('p', {}, originale ? 'La copia è identica all\'originale.' : 'L\'originale non esiste più: la copia può diventare il progetto.'),
        puoRisolvere
          ? h('div', { style: { marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            h('button', { type: 'button', class: 'btn btn-secondario btn-piccolo', onclick: () => risolvi('elimina') }, 'Tieni l\'originale, scarta la copia'),
            h('button', { type: 'button', class: 'btn btn-primario btn-piccolo', onclick: () => risolvi('usa') }, 'Usa la copia al posto dell\'originale'))
          : h('p', { class: 'tenue', style: { marginTop: '8px' } }, 'In sola lettura: la risolve chi può modificare il team.'));
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
