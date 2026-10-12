/* Import da CSV con anteprima: si vede cosa cambia, e i conflitti vanno riconosciuti, prima di scrivere.
 * Con piu' team si sceglie in quale team importare: l'anteprima confronta con i progetti di quel team.
 */
(function (radice) {
  'use strict';

  const MP = radice.MP;
  const UI = MP.ui;
  const { h, sostituisci } = UI;
  const ImportCsv = MP.importCsv;
  const Codice = MP.codice;

  // Excel in italiano salva spesso in Windows-1252 invece che in UTF-8.
  function decodifica(buffer) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch (e) {
      return new TextDecoder('windows-1252').decode(buffer);
    }
  }

  function apriImportazione() {
    if (!UI.scrivibile()) {
      UI.toast(UI.stato.consultazione ? 'In sola consultazione non si può importare.' : 'Nessun team in cui hai il permesso di importare.', 'avviso');
      return;
    }
    const input = h('input', { type: 'file', accept: '.csv,text/csv', hidden: true });
    document.body.appendChild(input);
    input.addEventListener('cancel', () => input.remove());
    input.addEventListener('change', async () => {
      const file = input.files[0];
      input.remove();
      if (file) await leggiFile(file);
    });
    input.click();
  }

  async function leggiFile(file) {
    let risultato;
    try {
      risultato = ImportCsv.importa(decodifica(await file.arrayBuffer()));
    } catch (e) {
      UI.toast('Impossibile leggere il file: ' + e.message, 'errore');
      return;
    }
    if (!risultato.progetti.length) {
      UI.toast(risultato.avvisi.length ? risultato.avvisi[0].messaggio : 'Nessun progetto trovato nel file.', 'errore');
      return;
    }
    mostraAnteprima(file.name, risultato);
  }

  function mostraAnteprima(nomeFile, r) {
    const S = UI.stato;
    const scrivibili = UI.squadreScrivibili();
    const multi = UI.multi();
    const etichetta = (k) => (UI.etichetteCampi && UI.etichetteCampi[k]) || k;
    let team = (scrivibili.find((s) => s.nome === S.filtri.team) || scrivibili[0]).nome;
    let anteprima;
    let daScrivere;

    const ack = h('input', { type: 'checkbox', onchange: aggiorna });
    const bloccato = r.errori.length > 0;

    // Confronto con i progetti del team scelto.
    function calcola() {
      const esistenti = S.voci.filter((v) => !multi || v.team === team).map((v) => v.progetto);
      anteprima = ImportCsv.anteprima(esistenti, r.progetti);
      const invariati = new Set(anteprima.invariati.map(Codice.chiave));
      daScrivere = r.progetti.filter((p) => !invariati.has(Codice.chiave(p.codice)));
    }

    // Codici gia' presenti in un altro team: non e' previsto, meglio saperlo prima.
    const altrove = () => (multi
      ? daScrivere.map((p) => {
        const v = S.voci.find((x) => x.team !== team && Codice.uguali(x.progetto.codice, p.codice));
        return v ? p.codice + ' esiste già nel team «' + v.team + '»' : null;
      }).filter((x) => x)
      : []);

    const elenco = (titolo, righe, classe, aperto) => h('details', { class: 'sezione ' + (classe || ''), open: aperto },
      h('summary', {}, titolo), h('ul', { class: 'elenco-problemi' }, righe.map((x) => h('li', {}, x))));

    function contenuto() {
      calcola();
      const doppi = altrove();
      return h('div', {},
        multi ? h('div', { class: 'campo', style: { maxWidth: '320px', marginBottom: '8px' } },
          h('label', { for: 'imp-team' }, 'Importa nel team'),
          h('select', { id: 'imp-team', onchange: (e) => { team = e.target.value; ridisegna(); } },
            scrivibili.map((s) => h('option', { value: s.nome, selected: s.nome === team }, s.nome)))) : null,
        h('p', {}, 'File ', h('strong', {}, nomeFile), ' — formato ', r.formato === 'esteso' ? 'esteso (con più ordini)' : 'piatto dell\'app precedente',
          ', ', String(r.righe), ' righe lette.'),
        h('div', { class: 'sommario-import' },
          UI.kpi('Nuovi', String(anteprima.nuovi.length), 'verde'),
          UI.kpi('Aggiornati', String(anteprima.aggiornati.length), 'arancio'),
          UI.kpi('Invariati', String(anteprima.invariati.length), '')),

        anteprima.aggiornati.length
          ? elenco('Progetti che verranno sostituiti (' + anteprima.aggiornati.length + ')',
            anteprima.aggiornati.map((a) => a.codice + ': cambiano ' + a.differenze.map(etichetta).join(', ')), '', anteprima.aggiornati.length <= 6)
          : null,

        doppi.length ? elenco('Codici già presenti in un altro team (' + doppi.length + ')', doppi, 'conflitti', true) : null,

        bloccato ? elenco('Errori da correggere nel file (' + r.errori.length + ')',
          r.errori.map((e) => e.codice + ' — ' + e.messaggio), 'errori', true) : null,

        r.conflitti.length ? h('details', { class: 'sezione conflitti', open: true },
          h('summary', {}, 'Conflitti: valori diversi per lo stesso codice (' + r.conflitti.length + ')'),
          h('p', { class: 'tenue' }, 'Righe dello stesso progetto riportano valori diversi. Viene tenuto il primo; gli altri andrebbero persi.'),
          h('div', { class: 'scorrimento' }, h('table', { class: 'dati' },
            h('thead', {}, h('tr', {}, h('th', {}, 'Codice'), h('th', {}, 'Campo'), h('th', {}, 'Valori trovati'), h('th', {}, 'Tenuto'))),
            h('tbody', {}, r.conflitti.map((c) => h('tr', {},
              h('td', { class: 'codice' }, c.codice), h('td', {}, etichetta(c.campo)),
              h('td', {}, c.valori.join('  |  ')), h('td', {}, h('strong', {}, c.tenuto))))))),
          h('label', { style: { display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' } },
            ack, 'Ho controllato i conflitti: importo tenendo i valori indicati')) : null,

        r.avvisi.length ? elenco('Avvisi (' + r.avvisi.length + ')',
          r.avvisi.map((a) => (a.codice ? a.codice + ' — ' : '') + (a.riga ? 'riga ' + a.riga + ': ' : '') + a.messaggio), '', r.avvisi.length <= 5) : null);
    }

    const d = UI.dialogo({
      titolo: 'Importa da CSV',
      contenuto: contenuto(),
      larghezza: 'min(860px, 97vw)',
      pulsanti: [
        { testo: 'Annulla', valore: 'annulla' },
        { testo: 'Importa', classe: 'btn-ok', valore: 'importato', disabilitato: true, azione: applica }
      ]
    });
    const bottone = d.pulsanti[1];

    function aggiorna() {
      bottone.textContent = daScrivere.length
        ? 'Importa ' + daScrivere.length + (daScrivere.length === 1 ? ' progetto' : ' progetti')
        : 'Niente da importare';
      bottone.disabled = bloccato || daScrivere.length === 0 || (r.conflitti.length > 0 && !ack.checked);
    }

    function ridisegna() {
      sostituisci(d.corpo, contenuto());
      aggiorna();
    }
    aggiorna();

    async function applica() {
      const testoOriginale = bottone.textContent;
      bottone.disabled = true;
      let fatti = 0;
      const falliti = [];
      for (let i = 0; i < daScrivere.length; i++) {
        const p = daScrivere[i];
        bottone.textContent = 'Importo ' + (i + 1) + ' di ' + daScrivere.length + '…';
        const esistente = S.voci.find((v) => (!multi || v.team === team) && Codice.uguali(v.progetto.codice, p.codice));
        try {
          const esito = await S.adapter.salva(p, { team: multi ? team : undefined, revAtteso: esistente ? esistente.rev : null });
          UI.registraVoce(esito, null);
          fatti++;
        } catch (e) {
          if (e && e.name === 'SolaLettura') {
            // Inutile insistere: il team non si puo' scrivere. I restanti non vengono provati.
            UI.gestisciErroreScrittura(e);
            daScrivere.slice(i).forEach((x) => falliti.push(x.codice + ' — ' + e.message));
            break;
          }
          falliti.push(p.codice + ' — ' + (e.name === 'ConflittoDiVersione'
            ? 'modificato nel frattempo da un altro utente: ricarica i dati e riprova' : e.message));
        }
      }
      UI.aggiorna();
      if (!falliti.length) {
        UI.toast('Importati ' + fatti + (fatti === 1 ? ' progetto' : ' progetti'), 'ok');
        return true;
      }
      bottone.textContent = testoOriginale;
      await UI.dialogo({
        titolo: 'Import completato con problemi',
        larghezza: 'min(620px, 96vw)',
        contenuto: h('div', {}, h('p', {}, 'Importati ' + fatti + ' progetti, ' + falliti.length + ' non riusciti:'),
          h('ul', { class: 'elenco-problemi' }, falliti.map((f) => h('li', {}, f)))),
        pulsanti: [{ testo: 'Chiudi', classe: 'btn-primario', valore: 'ok' }]
      }).finita;
      await UI.ricarica();
      return true;
    }
  }

  UI.apriImportazione = apriImportazione;
})(window);
