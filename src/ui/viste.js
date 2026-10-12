/* Viste di analisi: VPU da emettere, scadenze delle attivita', carico FTE. */
(function (radice) {
  'use strict';

  const MP = radice.MP;
  const UI = MP.ui;
  const { h, sostituisci, euro, dataIT } = UI;
  const Vpu = MP.vpu;
  const Scadenze = MP.scadenze;
  const Fte = MP.fte;
  const Importi = MP.importi;
  const Codice = MP.codice;

  UI.viste = UI.viste || {};

  const vaiAlProgetto = (codice) => h('button', {
    type: 'button', class: 'btn-link', onclick: () => UI.apriDettaglio(codice), title: 'Apri il dettaglio'
  }, codice);

  function salvaPdf(crea, prefisso) {
    try {
      crea().save(MP.reports.nomeFile(prefisso));
    } catch (e) {
      UI.toast('Impossibile creare il PDF: ' + e.message, 'errore');
    }
  }

  function vuoto(testo) {
    return h('p', { class: 'tenue', style: { padding: '18px 4px' } }, testo);
  }

  // ------------------------------------------------------------------------ VPU

  function disegnaVpu(contenitore) {
    const oggi = UI.oggiIso();
    const righe = Vpu.daEmettere(UI.progetti(), oggi);
    const importo = Importi.arrotonda(righe.reduce((t, r) => t + (Number(r.importo) || 0), 0));
    const mediaGiorni = righe.length ? Math.round(righe.reduce((t, r) => t + r.giorniDallaFine, 0) / righe.length) : 0;

    const richiedi = (r) => {
      const voce = UI.voce(r.codice);
      const ordine = voce && voce.progetto.ordini.find((o) => o.riferimento === r.riferimento);
      if (ordine) UI.inviaEmailVpu(voce.progetto, ordine);
    };

    sostituisci(contenitore,
      h('div', { class: 'barra', style: { marginTop: '0' } },
        h('p', { class: 'tenue', style: { margin: '0' } }, 'Ordini con VPU a NO di progetti conclusi da almeno un giorno. Il VPU si emette per ordine.'),
        h('span', { class: 'spazio' }),
        h('button', { type: 'button', class: 'btn btn-scuro', onclick: () => salvaPdf(() => MP.reports.vpu(righe, oggi), MP.reports.prefissi.vpu) }, 'PDF')),
      h('div', { class: 'indicatori' },
        UI.kpi('VPU da emettere', String(righe.length), righe.length ? 'rosso' : 'verde'),
        UI.kpi('Importo totale', euro(importo), 'verde'),
        UI.kpi('Progetti', String(new Set(righe.map((r) => Codice.chiave(r.codice))).size), 'blu'),
        UI.kpi('Giorni medi dalla fine', String(mediaGiorni), 'arancio')),
      righe.length
        ? h('div', { class: 'scorrimento' }, h('table', { class: 'dati' },
          h('thead', {}, h('tr', {},
            ['Codice', 'Applicativo', 'Descrizione', 'Ordine', 'Inizio', 'Fine'].map((t) => h('th', {}, t)),
            h('th', { class: 'numero' }, 'Importo'), h('th', { class: 'numero', title: 'Giorni dalla fine del progetto' }, 'GG'), h('th', {}, ''))),
          h('tbody', {}, righe.map((r) => h('tr', {},
            h('td', { class: 'codice' }, vaiAlProgetto(r.codice)),
            h('td', {}, r.applicativo), h('td', { class: 'descr' }, r.descrizione), h('td', {}, r.riferimento),
            h('td', { class: 'nowrap' }, dataIT(r.inizio)), h('td', { class: 'nowrap' }, dataIT(r.fine)),
            h('td', { class: 'numero' }, euro(r.importo)), h('td', { class: 'numero' }, String(r.giorniDallaFine)),
            h('td', { class: 'azioni' }, h('button', { type: 'button', class: 'btn btn-secondario btn-piccolo', onclick: () => richiedi(r) }, '📧 Richiedi VPU'))))),
          h('tfoot', {}, h('tr', {}, h('td', { colspan: 6, class: 'destra' }, 'Totale (' + righe.length + ' ordini)'),
            h('td', { class: 'numero' }, euro(importo)), h('td', { colspan: 2 })))))
        : vuoto('Nessun VPU da emettere.'));
  }

  // ------------------------------------------------------------------- scadenze

  function disegnaScadenze(contenitore) {
    const oggi = UI.oggiIso();
    const righe = Scadenze.classifica(UI.progetti(), oggi);
    const r = Scadenze.riepilogo(righe);
    const classe = { 'SCADUTA': 'scaduta', 'IN CORSO': 'in-corso', 'DA AVVIARE': 'da-avviare' };

    sostituisci(contenitore,
      h('div', { class: 'barra', style: { marginTop: '0' } },
        h('p', { class: 'tenue', style: { margin: '0' } }, 'Attività in corso o da avviare, aggiornate al ' + dataIT(oggi) + '.'),
        h('span', { class: 'spazio' }),
        h('button', { type: 'button', class: 'btn btn-scuro', onclick: () => salvaPdf(() => MP.reports.scadenze(righe, oggi), MP.reports.prefissi.scadenze) }, 'PDF')),
      h('div', { class: 'indicatori' },
        UI.kpi('In corso', String(r.inCorso), 'verde'),
        UI.kpi('Da avviare', String(r.daAvviare), 'blu'),
        UI.kpi('Scadute', String(r.scadute), r.scadute ? 'rosso' : 'verde'),
        UI.kpi('Progetti', String(r.progetti), '')),
      righe.length
        ? h('div', { class: 'scorrimento' }, h('table', { class: 'dati' },
          h('thead', {}, h('tr', {},
            ['Codice', 'Applicativo', 'Progetto', 'Attività', 'Inizio', 'Fine'].map((t) => h('th', {}, t)),
            h('th', { class: 'numero', title: 'Giorni di ritardo (scadute), all\'inizio (da avviare) o alla fine (in corso)' }, 'GG'),
            h('th', { class: 'centro' }, 'Classificazione'), h('th', {}, 'Note'))),
          h('tbody', {}, righe.map((x) => h('tr', { class: classe[x.tag] },
            h('td', { class: 'codice' }, vaiAlProgetto(x.codice)),
            h('td', {}, x.applicativo), h('td', { class: 'descr' }, x.progetto), h('td', {}, x.attivita),
            h('td', { class: 'nowrap' }, dataIT(x.inizio)), h('td', { class: 'nowrap' }, dataIT(x.fine)),
            h('td', { class: 'numero' }, x.giorni == null ? '' : String(x.giorni)),
            h('td', { class: 'centro' }, h('span', { class: 'etichetta etichetta-' + classe[x.tag] }, x.tag)),
            h('td', {}, x.note))))))
        : vuoto('Nessuna attività in corso o da avviare.'));
  }

  // ------------------------------------------------------------------------ FTE

  const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const decimali = (n) => n.toFixed(2).replace('.', ',');
  let annoScelto = null;
  const meseAperto = new Set();

  function disegnaFte(contenitore) {
    const progetti = UI.progetti();
    const oggi = UI.oggiIso();
    const annoCorrente = Number(oggi.slice(0, 4));
    const cfg = UI.stato.config;

    const anni = new Set([annoCorrente]);
    progetti.forEach((p) => {
      if (!p.inizio) return;
      const da = Number(p.inizio.slice(0, 4));
      const a = p.fine ? Number(p.fine.slice(0, 4)) : annoCorrente;
      for (let y = da; y <= Math.max(a, da); y++) anni.add(y);
    });
    const elencoAnni = Array.from(anni).sort((a, b) => a - b);
    if (!annoScelto || !anni.has(annoScelto)) annoScelto = annoCorrente;

    const dati = Fte.anno(progetti, annoScelto, { oggi, fteProgetto: cfg.fteProgetto });

    const selezione = h('select', { 'aria-label': 'Anno', onchange: (e) => { annoScelto = Number(e.target.value); meseAperto.clear(); disegnaFte(contenitore); } },
      elencoAnni.map((y) => h('option', { value: y, selected: y === annoScelto }, String(y))));

    const righe = [];
    dati.mesi.forEach((m) => {
      const aperto = meseAperto.has(m.mese);
      righe.push(h('tr', {},
        h('td', {}, MESI[m.mese]),
        h('td', { class: 'centro' }, m.progettiAttivi
          ? h('button', { type: 'button', class: 'btn-link', 'aria-expanded': String(aperto), title: 'Mostra i progetti attivi', onclick: () => {
            if (meseAperto.has(m.mese)) meseAperto.delete(m.mese); else meseAperto.add(m.mese);
            disegnaFte(contenitore);
          } }, String(m.progettiAttivi))
          : '0'),
        h('td', { class: 'numero' }, decimali(m.fte))));
      if (aperto) {
        righe.push(h('tr', {}, h('td', { colspan: 3, style: { background: '#f8fafc' } },
          h('ul', { class: 'elenco-problemi', style: { margin: '0' } }, m.dettaglio.map((d) => {
            const voce = UI.voce(d.codice);
            return h('li', {}, vaiAlProgetto(d.codice), voce && voce.progetto.projectManager ? ' (' + voce.progetto.projectManager + ')' : '',
              ' — ' + d.giorniAttivi + ' giorni, FTE ' + decimali(d.fte));
          })))));
      }
    });

    sostituisci(contenitore,
      h('div', { class: 'barra', style: { marginTop: '0' } },
        h('label', {}, 'Anno ', selezione),
        h('span', { class: 'spazio' }),
        h('span', { class: 'tenue' }, 'FTE per progetto: ', h('strong', {}, decimali(cfg.fteProgetto)), ' '),
        h('button', { type: 'button', class: 'btn btn-secondario btn-piccolo', onclick: () => UI.apriImpostazioni() }, 'Modifica')),
      h('p', { class: 'tenue' }, 'Ogni progetto attivo pesa quanto il valore FTE per progetto, in proporzione ai giorni del mese in cui è attivo. ' +
        'Un progetto è uno solo anche se ha più ordini. I progetti senza data di fine sono considerati attivi fino al 31/12 dell\'anno corrente. ' +
        'Il valore 0,20 è un segnaposto: impostalo in Impostazioni.'),
      h('div', { class: 'scorrimento' }, h('table', { class: 'dati' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Mese'), h('th', { class: 'centro' }, 'Progetti attivi'), h('th', { class: 'numero' }, 'FTE project manager'))),
        h('tbody', {}, righe),
        h('tfoot', {},
          h('tr', {}, h('td', {}, 'Somma dei mesi ' + annoScelto), h('td'), h('td', { class: 'numero' }, decimali(dati.sommaMesi))),
          h('tr', {}, h('td', {}, 'Media mensile ' + annoScelto), h('td'), h('td', { class: 'numero' }, decimali(dati.mediaMensile)))))));
  }

  UI.viste.vpu = { titolo: 'VPU da emettere', disegna: disegnaVpu, conta: () => Vpu.daEmettere(UI.progetti(), UI.oggiIso()).length, allerta: true };
  UI.viste.scadenze = { titolo: 'Scadenze', disegna: disegnaScadenze, conta: () => Scadenze.riepilogo(Scadenze.classifica(UI.progetti(), UI.oggiIso())).scadute, allerta: true };
  UI.viste.fte = { titolo: 'Analisi FTE', disegna: disegnaFte };
})(window);
