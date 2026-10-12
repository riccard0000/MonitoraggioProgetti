/* Vista «Riepilogo»: filtri, indicatori, grafici per fase e tabella dei progetti. */
(function (radice) {
  'use strict';

  const MP = radice.MP;
  const UI = MP.ui;
  const { h, sostituisci, badgeFase, badgeSiNo, euro, periodo } = UI;
  const Elenco = MP.elenco;
  const Modello = MP.modello;
  const Vpu = MP.vpu;
  const Codice = MP.codice;

  const COLONNE = [
    { k: 'codice', l: 'Codice' },
    { k: 'applicativo', l: 'Applicativo' },
    { k: 'projectManager', l: 'Project manager' },
    { k: 'fase', l: 'Fase' },
    { k: 'periodo', l: 'Periodo' },
    { k: 'descrizione', l: 'Descrizione' },
    { k: 'ordini', l: 'Ordini' },
    { k: 'costo', l: 'Costo', classe: 'numero' },
    { k: 'promemoria', l: 'Prom.', classe: 'centro' },
    { k: 'offerta', l: 'Off.', classe: 'centro' },
    { k: 'vpu', l: 'VPU', classe: 'centro' },
    { k: null, l: 'Azioni', classe: 'centro' }
  ];

  const COLORI_FASE = {
    Ideazione: '#7f8c8d', Avvio: '#2980b9', Analisi: '#f7dc6f', Sviluppo: '#f39c12',
    Collaudo: '#8e44ad', Certificazione: '#aed6f1', Esercizio: '#27ae60'
  };

  let grafici = { fasi: null, costi: null };
  let chiudiMenu = null;
  let aggiornaRisultati = () => {};

  // Progetti dopo ricerca, filtro per fase e ordinamento scelti a schermo.
  function elencoVisibile() {
    const S = UI.stato;
    return Elenco.ordina(Elenco.filtra(UI.progetti(), S.filtri), S.ordinamento.campo, S.ordinamento.direzione);
  }

  // Scrive il numero (o la somma) al centro della ciambella, riducendo il testo finche' ci sta.
  const testoCentrale = {
    id: 'testoCentrale',
    afterDraw(chart, args, opzioni) {
      if (!opzioni || !opzioni.testo) return;
      const arco = chart.getDatasetMeta(0).data[0];
      if (!arco) return;
      const { ctx } = chart;
      const larghezzaMax = arco.innerRadius * 1.6;
      let corpo = Math.max(12, arco.innerRadius / 2);
      ctx.save();
      do {
        ctx.font = 'bold ' + corpo + 'px "Segoe UI", sans-serif';
        corpo -= 1;
      } while (ctx.measureText(opzioni.testo).width > larghezzaMax && corpo > 9);
      ctx.fillStyle = '#2c3e50';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opzioni.testo, arco.x, arco.y);
      ctx.restore();
    }
  };

  function creaGrafico(tela, titolo, etichette, valori, testo, formatoTooltip) {
    return new radice.Chart(tela, {
      type: 'doughnut',
      plugins: [testoCentrale],
      data: {
        labels: etichette,
        datasets: [{ data: valori, backgroundColor: etichette.map((f) => COLORI_FASE[f]), borderWidth: 1 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        devicePixelRatio: Math.max(2, radice.devicePixelRatio || 1), // immagini nitide nel PDF
        cutout: '55%',
        plugins: {
          testoCentrale: { testo },
          legend: { position: 'bottom' },
          title: { display: true, text: titolo },
          tooltip: { callbacks: { label: (c) => c.label + ': ' + formatoTooltip(c.raw) } }
        }
      }
    });
  }

  function distruggiGrafici() {
    ['fasi', 'costi'].forEach((k) => { if (grafici[k]) { grafici[k].destroy(); grafici[k] = null; } });
  }

  function disegnaGrafici(visibili, telaFasi, telaCosti, messaggi) {
    distruggiGrafici();
    const conteggi = Elenco.conteggiPerFase(visibili);
    const costi = Elenco.costiPerFase(visibili);
    const conDati = Modello.FASI.filter((f) => conteggi[f] > 0);
    const conCosti = Modello.FASI.filter((f) => costi[f] > 0);

    messaggi.fasi.hidden = conDati.length > 0;
    messaggi.costi.hidden = conCosti.length > 0;
    if (!radice.Chart) {
      messaggi.fasi.hidden = messaggi.costi.hidden = false;
      messaggi.fasi.textContent = messaggi.costi.textContent = 'Grafici non disponibili (libreria non caricata).';
      return;
    }
    if (conDati.length) {
      grafici.fasi = creaGrafico(telaFasi, 'Progetti per fase', conDati, conDati.map((f) => conteggi[f]),
        String(visibili.length), (v) => String(v));
    }
    if (conCosti.length) {
      const totale = conCosti.reduce((t, f) => t + costi[f], 0);
      grafici.costi = creaGrafico(telaCosti, 'Costi per fase', conCosti, conCosti.map((f) => costi[f]),
        euro(totale), (v) => euro(v));
    }
  }

  // ---------------------------------------------------------------- azioni

  async function elimina(p) {
    const voce = UI.voce(p.codice);
    const ok = await UI.conferma('Eliminare il progetto ' + p.codice + '?\nUna copia dell\'ultima versione resta nella cartella backup.',
      { titolo: 'Elimina progetto', conferma: 'Elimina', pericolo: true });
    if (!ok || !voce) return;
    try {
      await UI.stato.adapter.elimina(p.codice, voce.rev);
      UI.stato.voci = UI.stato.voci.filter((v) => !Codice.uguali(v.progetto.codice, p.codice));
      UI.toast('Progetto ' + p.codice + ' eliminato', 'ok');
      UI.aggiorna();
    } catch (e) {
      UI.toast(e.name === 'ConflittoDiVersione'
        ? 'Il progetto è stato modificato da un altro utente: ricarico i dati, controlla e riprova.'
        : 'Eliminazione non riuscita: ' + e.message, 'errore');
      if (e.name === 'ConflittoDiVersione') UI.ricarica();
    }
  }

  function esportaCsv() {
    const testo = MP.esportaCsv.esporta(UI.progetti());
    UI.scarica(MP.reports.nomeFile('progetti').replace(/\.pdf$/, '.csv'), 'text/csv;charset=utf-8', '﻿' + testo);
    UI.toast('File CSV esportato (' + UI.progetti().length + ' progetti)', 'ok');
  }

  function pdfRiepilogo() {
    try {
      const immagine = (g) => (g ? g.toBase64Image('image/png', 1) : null);
      const doc = MP.reports.riepilogo(elencoVisibile(), {
        filtri: UI.stato.filtri,
        immagini: { fasi: immagine(grafici.fasi), costi: immagine(grafici.costi) }
      });
      doc.save(MP.reports.nomeFile(MP.reports.prefissi.riepilogo));
    } catch (e) {
      UI.toast('Impossibile creare il PDF: ' + e.message, 'errore');
    }
  }

  // ------------------------------------------------------------------ vista

  function riga(p) {
    const ordini = p.ordini || [];
    const tr = h('tr', {
      class: 'cliccabile' + (p.fase === 'Esercizio' ? ' esercizio' : ''),
      tabindex: '0',
      onclick: () => UI.apriDettaglio(p.codice),
      onkeydown: (e) => { if (e.key === 'Enter') UI.apriDettaglio(p.codice); }
    },
    h('td', { class: 'codice' }, p.codice),
    h('td', {}, p.applicativo),
    h('td', {}, p.projectManager),
    h('td', {}, badgeFase(p.fase)),
    h('td', { class: 'nowrap' }, periodo(p)),
    h('td', { class: 'descr', title: p.descrizione }, p.descrizione),
    h('td', {}, ordini.length
      ? h('ul', { class: 'ordini-lista' },
        ordini.slice(0, 2).map((o) => h('li', {}, o.riferimento)),
        ordini.length > 2 ? h('li', { class: 'altri' }, '+ altri ' + (ordini.length - 2)) : null)
      : h('span', { class: 'tenue' }, '-')),
    h('td', { class: 'numero' }, ordini.length ? euro(Modello.costoProgetto(p)) : '-'),
    h('td', { class: 'centro' }, badgeSiNo(p.promemoria)),
    h('td', { class: 'centro' }, badgeSiNo(Elenco.sintesiOrdini(p, 'offerta'))),
    h('td', { class: 'centro' }, badgeSiNo(Elenco.sintesiOrdini(p, 'vpu'))),
    h('td', { class: 'azioni' },
      h('button', { type: 'button', class: 'icona', title: 'Modifica', 'aria-label': 'Modifica ' + p.codice,
        onclick: (e) => { e.stopPropagation(); UI.apriModulo(p.codice); } }, '✏️'),
      h('button', { type: 'button', class: 'icona pericolo', title: 'Elimina', 'aria-label': 'Elimina ' + p.codice,
        onclick: (e) => { e.stopPropagation(); elimina(p); } }, '🗑️')));
    return tr;
  }

  function disegna(contenitore) {
    const S = UI.stato;
    if (chiudiMenu) document.removeEventListener('click', chiudiMenu);

    // ----- filtri
    const campoRicerca = h('input', {
      type: 'search', value: S.filtri.testo, 'aria-label': 'Cerca nei progetti',
      placeholder: 'Cerca…  (usa "virgolette" per una frase esatta)',
      oninput: (e) => { S.filtri.testo = e.target.value; aggiornaRisultati(); }
    });

    const etichettaFasi = h('summary', { class: 'btn btn-scuro' });
    const caselle = new Map();
    const aggiornaEtichettaFasi = () => {
      const n = S.filtri.fasi.length;
      etichettaFasi.textContent = (n === 0 ? 'Tutte le fasi' : n === 1 ? S.filtri.fasi[0] : n + ' fasi') + ' ▾';
    };
    const menu = h('details', { class: 'menu-fasi' }, etichettaFasi,
      h('div', { class: 'elenco' },
        h('div', { class: 'azioni' },
          h('button', { type: 'button', class: 'btn btn-secondario btn-piccolo', onclick: () => {
            S.filtri.fasi = [];
            caselle.forEach((c) => { c.checked = false; });
            aggiornaEtichettaFasi();
            aggiornaRisultati();
          } }, 'Mostra tutte')),
        Modello.FASI.map((fase) => {
          const casella = h('input', {
            type: 'checkbox', checked: S.filtri.fasi.includes(fase),
            onchange: (e) => {
              S.filtri.fasi = Modello.FASI.filter((f) => (f === fase ? e.target.checked : S.filtri.fasi.includes(f)));
              aggiornaEtichettaFasi();
              aggiornaRisultati();
            }
          });
          caselle.set(fase, casella);
          return h('label', {}, casella, badgeFase(fase), h('span', { class: 'tenue', 'data-conta': fase }));
        })));
    aggiornaEtichettaFasi();
    chiudiMenu = (e) => { if (!menu.contains(e.target)) menu.open = false; };
    document.addEventListener('click', chiudiMenu);

    const filtri = h('div', { class: 'filtri' },
      campoRicerca, menu,
      h('button', { type: 'button', class: 'btn btn-secondario', onclick: () => {
        S.filtri = { testo: '', fasi: [] };
        campoRicerca.value = '';
        caselle.forEach((c) => { c.checked = false; });
        aggiornaEtichettaFasi();
        aggiornaRisultati();
      } }, 'Reimposta filtri'),
      h('span', { style: { flex: '1' } }),
      h('button', { type: 'button', class: 'btn btn-scuro', onclick: esportaCsv }, 'Esporta CSV'),
      h('button', { type: 'button', class: 'btn btn-scuro', onclick: pdfRiepilogo }, 'PDF riepilogo'));

    // ----- risultati
    const indicatori = h('div', { class: 'indicatori' });
    const telaFasi = h('canvas', { 'aria-label': 'Grafico dei progetti per fase', role: 'img' });
    const telaCosti = h('canvas', { 'aria-label': 'Grafico dei costi per fase', role: 'img' });
    const vuotoFasi = h('div', { class: 'vuoto' }, 'Nessun dato da mostrare');
    const vuotoCosti = h('div', { class: 'vuoto' }, 'Nessun costo da mostrare');
    const graficiEl = h('div', { class: 'grafici' },
      h('div', { class: 'grafico' }, h('div', { style: { position: 'relative', height: '280px' } }, telaFasi), vuotoFasi),
      h('div', { class: 'grafico' }, h('div', { style: { position: 'relative', height: '280px' } }, telaCosti), vuotoCosti));

    const corpo = h('tbody');
    const piede = h('tfoot');
    const intestazioni = h('tr');
    const tabella = h('div', { class: 'scorrimento' }, h('table', { class: 'dati' },
      h('thead', {}, intestazioni), corpo, piede));

    aggiornaRisultati = function () {
      const visibili = elencoVisibile();
      const tot = Elenco.totali(visibili);
      const daEmettere = Vpu.daEmettere(visibili, UI.oggiIso()).length;
      const totaleArchivio = UI.progetti().length;

      sostituisci(indicatori,
        kpi('Progetti', visibili.length === totaleArchivio ? String(tot.progetti) : tot.progetti + ' di ' + totaleArchivio, ''),
        kpi('Costo totale', euro(tot.costo), 'verde'),
        kpi('Ordini', String(tot.ordini), 'blu'),
        kpi('VPU da emettere', String(daEmettere), daEmettere ? 'rosso' : 'verde'));

      const conteggi = Elenco.conteggiPerFase(UI.progetti());
      menu.querySelectorAll('[data-conta]').forEach((el) => { el.textContent = '(' + conteggi[el.dataset.conta] + ')'; });

      disegnaGrafici(visibili, telaFasi, telaCosti, { fasi: vuotoFasi, costi: vuotoCosti });

      sostituisci(intestazioni, COLONNE.map((c) => {
        const attiva = S.ordinamento.campo === c.k;
        return h('th', {
          class: c.classe || '',
          scope: 'col',
          'aria-sort': attiva ? (S.ordinamento.direzione === 1 ? 'ascending' : 'descending') : 'none'
        }, c.k
          ? h('button', { type: 'button', onclick: () => {
            if (S.ordinamento.campo === c.k) S.ordinamento.direzione *= -1;
            else S.ordinamento = { campo: c.k, direzione: 1 };
            aggiornaRisultati();
          } }, c.l, attiva ? (S.ordinamento.direzione === 1 ? ' ▲' : ' ▼') : '')
          : c.l);
      }));

      sostituisci(corpo, visibili.length
        ? visibili.map(riga)
        : h('tr', {}, h('td', { class: 'vuoto-tabella', colspan: COLONNE.length },
          totaleArchivio ? 'Nessun progetto corrisponde ai filtri.' : 'Nessun progetto: crea il primo con «Nuovo progetto» o importa un CSV.')));

      sostituisci(piede, visibili.length ? h('tr', {},
        h('td', { colspan: 7, class: 'destra' }, 'Totale (' + tot.progetti + ' progetti)'),
        h('td', { class: 'numero' }, euro(tot.costo)),
        h('td', { colspan: 4 })) : null);
    };

    sostituisci(contenitore, filtri, indicatori, graficiEl, tabella);
    aggiornaRisultati();
  }

  // `piccolo`: per valori lunghi come un periodo di date.
  function kpi(etichetta, valore, colore, piccolo) {
    return h('div', { class: 'indicatore ' + colore + (piccolo ? ' piccolo' : '') },
      h('div', { class: 'etichetta-kpi' }, etichetta), h('div', { class: 'valore' }, valore));
  }

  UI.elencoVisibile = elencoVisibile;
  UI.kpi = kpi;
  UI.viste = UI.viste || {};
  UI.viste.riepilogo = { titolo: 'Riepilogo', disegna, chiudi: distruggiGrafici };
})(window);
