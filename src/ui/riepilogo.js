/* Vista «Riepilogo»: filtri, indicatori, grafici per fase e tabella dei progetti. */
(function (radice) {
  'use strict';

  const MP = radice.MP;
  const UI = MP.ui;
  const { h, sostituisci, badgeFase, badgeSiNo, euro, periodo } = UI;
  const Elenco = MP.elenco;
  const Modello = MP.modello;
  const Vpu = MP.vpu;
  const Scadenze = MP.scadenze;
  const Codice = MP.codice;

  // La colonna Team compare solo quando ci sono piu' team.
  function colonne() {
    const base = [
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
    if (UI.multi()) base.splice(1, 0, { k: 'team', l: 'Team' });
    return base;
  }

  const COLORI_FASE = {
    Ideazione: '#7f8c8d', Avvio: '#2980b9', Analisi: '#f7dc6f', Sviluppo: '#f39c12',
    Collaudo: '#8e44ad', Certificazione: '#aed6f1', Esercizio: '#27ae60'
  };

  let grafici = { fasi: null, costi: null };
  let chiudiMenu = null;
  let aggiornaRisultati = () => {};

  // A quale team appartiene ogni progetto (per riferimento all'oggetto: regge anche codici uguali).
  function contestoTeam() {
    const mappa = new Map(UI.stato.voci.map((v) => [v.progetto, v.team]));
    return { team: (p) => mappa.get(p) || '' };
  }

  // Progetti dopo ricerca, filtro per team e per fase, e ordinamento scelti a schermo.
  function elencoVisibile() {
    const S = UI.stato;
    const ctx = contestoTeam();
    return Elenco.ordina(Elenco.filtra(UI.progetti(), S.filtri, ctx), S.ordinamento.campo, S.ordinamento.direzione, ctx);
  }

  // Scrive il numero (o la somma) al centro della ciambella, riducendo il testo finche' ci sta.
  // Il centro e il raggio interno si calcolano dall'area del grafico, non dalle fette: restano
  // giusti anche quando tutte le fette sono nascoste.
  const testoCentrale = {
    id: 'testoCentrale',
    afterDraw(chart, args, opzioni) {
      if (!opzioni || opzioni.testo == null) return;
      const controller = chart.getDatasetMeta(0).controller;
      const raggioInterno = controller && controller.innerRadius;
      const area = chart.chartArea;
      if (!raggioInterno || !area) return;
      const { ctx } = chart;
      const larghezzaMax = raggioInterno * 1.6;
      let corpo = Math.max(12, raggioInterno / 2);
      ctx.save();
      do {
        ctx.font = 'bold ' + corpo + 'px "Segoe UI", sans-serif';
        corpo -= 1;
      } while (ctx.measureText(opzioni.testo).width > larghezzaMax && corpo > 9);
      ctx.fillStyle = '#2c3e50';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opzioni.testo, (area.left + area.right) / 2, (area.top + area.bottom) / 2);
      ctx.restore();
    }
  };

  // `nascoste`: indici delle fette escluse dal filtro per fase (restano in legenda, barrate, cosi'
  // si possono riattivare). `alClicLegenda(fase)`: cosa fare quando si clicca una voce della legenda.
  function creaGrafico(tela, titolo, etichette, valori, testo, formatoTooltip, nascoste, alClicLegenda) {
    const grafico = new radice.Chart(tela, {
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
          legend: { position: 'bottom', onClick: (evento, voce) => alClicLegenda(voce.text) },
          title: { display: true, text: titolo },
          tooltip: { callbacks: { label: (c) => c.label + ': ' + formatoTooltip(c.raw) } }
        }
      }
    });
    if (nascoste.length) {
      nascoste.forEach((i) => grafico.toggleDataVisibility(i));
      grafico.update('none');
    }
    return grafico;
  }

  function distruggiGrafici() {
    ['fasi', 'costi'].forEach((k) => { if (grafici[k]) { grafici[k].destroy(); grafici[k] = null; } });
  }

  // `base`: i progetti dopo ricerca e filtro per team, ma *prima* del filtro per fase: cosi' la
  // legenda mostra tutte le fasi presenti e quelle escluse si possono riattivare con un clic.
  // `fasiAttive`: il filtro per fase (vuoto = tutte). Il numero al centro e' la somma delle sole
  // fette visibili, quindi coincide con gli indicatori e con la tabella.
  function disegnaGrafici(base, fasiAttive, telaFasi, telaCosti, messaggi, alClicLegenda) {
    distruggiGrafici();
    const conteggi = Elenco.conteggiPerFase(base);
    const costi = Elenco.costiPerFase(base);
    const conDati = Modello.FASI.filter((f) => conteggi[f] > 0);
    const conCosti = Modello.FASI.filter((f) => costi[f] > 0);
    const attive = new Set(fasiAttive);
    const attiva = (f) => attive.size === 0 || attive.has(f);
    const nascosta = (elenco) => elenco.map((f, i) => (attiva(f) ? -1 : i)).filter((i) => i >= 0);

    messaggi.fasi.hidden = conDati.length > 0;
    messaggi.costi.hidden = conCosti.length > 0;
    if (!radice.Chart) {
      messaggi.fasi.hidden = messaggi.costi.hidden = false;
      messaggi.fasi.textContent = messaggi.costi.textContent = 'Grafici non disponibili (libreria non caricata).';
      return;
    }
    if (conDati.length) {
      const progetti = conDati.filter(attiva).reduce((t, f) => t + conteggi[f], 0);
      grafici.fasi = creaGrafico(telaFasi, 'Progetti per fase', conDati, conDati.map((f) => conteggi[f]),
        String(progetti), (v) => String(v), nascosta(conDati), alClicLegenda);
    }
    if (conCosti.length) {
      const totale = MP.importi.arrotonda(conCosti.filter(attiva).reduce((t, f) => t + costi[f], 0));
      grafici.costi = creaGrafico(telaCosti, 'Costi per fase', conCosti, conCosti.map((f) => costi[f]),
        euro(totale), (v) => euro(v), nascosta(conCosti), alClicLegenda);
    }
  }

  // ---------------------------------------------------------------- azioni

  async function elimina(p, team) {
    const voce = UI.voce(p.codice, team);
    const ok = await UI.conferma('Eliminare il progetto ' + p.codice + '?\nUna copia dell\'ultima versione resta nella cartella backup.',
      { titolo: 'Elimina progetto', conferma: 'Elimina', pericolo: true });
    if (!ok || !voce) return;
    try {
      await UI.stato.adapter.elimina(p.codice, voce.rev, voce.team);
      UI.stato.voci = UI.stato.voci.filter((v) => !(v.team === voce.team && Codice.uguali(v.progetto.codice, p.codice)));
      UI.toast('Progetto ' + p.codice + ' eliminato', 'ok');
      UI.aggiorna();
    } catch (e) {
      if (UI.gestisciErroreScrittura(e)) return;
      UI.toast(e.name === 'ConflittoDiVersione'
        ? 'Il progetto è stato modificato da un altro utente: ricarico i dati, controlla e riprova.'
        : 'Eliminazione non riuscita: ' + e.message, 'errore');
      if (e.name === 'ConflittoDiVersione') UI.ricarica();
    }
  }

  function esportaCsv() {
    const testo = MP.esportaCsv.esporta(UI.progetti(), UI.multi() ? contestoTeam() : null);
    UI.scarica(MP.reports.nomeFile('progetti').replace(/\.pdf$/, '.csv'), 'text/csv;charset=utf-8', '﻿' + testo);
    UI.toast('File CSV esportato (' + UI.progetti().length + ' progetti)', 'ok');
  }

  function pdfRiepilogo() {
    try {
      const immagine = (g) => (g ? g.toBase64Image('image/png', 1) : null);
      const doc = MP.reports.riepilogo(elencoVisibile(), {
        filtri: UI.stato.filtri,
        team: UI.multi() ? contestoTeam().team : null,
        immagini: { fasi: immagine(grafici.fasi), costi: immagine(grafici.costi) }
      });
      doc.save(MP.reports.nomeFile(MP.reports.prefissi.riepilogo));
    } catch (e) {
      UI.toast('Impossibile creare il PDF: ' + e.message, 'errore');
    }
  }

  // ------------------------------------------------------------------ vista

  function riga(p, team) {
    const ordini = p.ordini || [];
    const puoModificare = UI.scrivibile(team);
    const tr = h('tr', {
      class: 'cliccabile' + (p.fase === 'Esercizio' ? ' esercizio' : ''),
      tabindex: '0',
      onclick: () => UI.apriDettaglio(p.codice, team),
      onkeydown: (e) => { if (e.key === 'Enter') UI.apriDettaglio(p.codice, team); }
    },
    h('td', { class: 'codice' }, p.codice),
    UI.multi() ? h('td', { class: 'nowrap' }, team) : null,
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
    h('td', { class: 'azioni' }, puoModificare
      ? [h('button', { type: 'button', class: 'icona', title: 'Modifica', 'aria-label': 'Modifica ' + p.codice,
        onclick: (e) => { e.stopPropagation(); UI.apriModulo(p.codice, team); } }, '✏️'),
      h('button', { type: 'button', class: 'icona pericolo', title: 'Elimina', 'aria-label': 'Elimina ' + p.codice,
        onclick: (e) => { e.stopPropagation(); elimina(p, team); } }, '🗑️')]
      : h('span', { class: 'tenue', title: 'Sola lettura: non si può modificare' }, '🔒')));
    return tr;
  }

  // Riquadro per team: una riga per team con i numeri che interessano al responsabile.
  // Un clic su una riga filtra per quel team (di nuovo per toglierlo).
  function pannelloTeam(contenitore, selezioneTeam, aggiorna) {
    const S = UI.stato;
    const oggi = UI.oggiIso();
    const righe = S.squadre.map((sq) => {
      const lista = S.voci.filter((v) => v.team === sq.nome).map((v) => v.progetto);
      return {
        sq,
        n: lista.length,
        costo: Elenco.totali(lista).costo,
        vpu: Vpu.daEmettere(lista, oggi).length,
        scadute: Scadenze.riepilogo(Scadenze.classifica(lista, oggi)).scadute
      };
    });
    const tot = righe.reduce((t, r) => ({ n: t.n + r.n, costo: t.costo + r.costo, vpu: t.vpu + r.vpu, scadute: t.scadute + r.scadute }),
      { n: 0, costo: 0, vpu: 0, scadute: 0 });

    sostituisci(contenitore, h('div', { class: 'scorrimento' }, h('table', { class: 'dati' },
      h('caption', {}, 'Per team — clic su una riga per filtrare'),
      h('thead', {}, h('tr', {},
        h('th', {}, 'Team'), h('th', { class: 'numero' }, 'Progetti'), h('th', { class: 'numero' }, 'Costo'),
        h('th', { class: 'numero' }, 'VPU da emettere'), h('th', { class: 'numero' }, 'Attività scadute'), h('th', {}, 'Accesso'))),
      h('tbody', {}, righe.map((r) => h('tr', {
        class: 'cliccabile' + (S.filtri.team === r.sq.nome ? ' attivo' : ''),
        tabindex: '0',
        onclick: () => { S.filtri.team = S.filtri.team === r.sq.nome ? '' : r.sq.nome; selezioneTeam.value = S.filtri.team; aggiorna(); },
        onkeydown: (e) => { if (e.key === 'Enter') e.currentTarget.click(); }
      },
      h('td', { class: 'codice' }, r.sq.nome),
      h('td', { class: 'numero' }, String(r.n)),
      h('td', { class: 'numero' }, euro(r.costo)),
      h('td', { class: 'numero' }, r.vpu ? h('span', { class: 'etichetta etichetta-no' }, String(r.vpu)) : '0'),
      h('td', { class: 'numero' }, r.scadute ? h('span', { class: 'etichetta etichetta-no' }, String(r.scadute)) : '0'),
      h('td', {}, !r.sq.ok ? h('span', { class: 'etichetta etichetta-no' }, 'non accessibile')
        : r.sq.scrivibile ? h('span', { class: 'etichetta etichetta-si' }, 'modifica')
          : h('span', { class: 'etichetta etichetta-nd' }, '🔒 sola lettura'))))),
      h('tfoot', {}, h('tr', {},
        h('td', {}, 'Totale'), h('td', { class: 'numero' }, String(tot.n)), h('td', { class: 'numero' }, euro(tot.costo)),
        h('td', { class: 'numero' }, String(tot.vpu)), h('td', { class: 'numero' }, String(tot.scadute)), h('td'))))));
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

    // Un clic sulla legenda dei grafici e' un clic sul filtro per fase: la voce si nasconde o
    // si riattiva e tutto (numero al centro, indicatori, altro grafico, tabella, menu delle fasi)
    // si ricalcola. Il filtro vuoto vale «tutte le fasi», quindi nascondere una voce da «tutte»
    // significa selezionare le altre sei.
    function alternaFase(fase) {
      const tutte = Modello.FASI;
      const selezionate = S.filtri.fasi.length ? S.filtri.fasi.slice() : tutte.slice();
      const i = selezionate.indexOf(fase);
      if (i >= 0) {
        if (selezionate.length === 1) {
          UI.toast('Deve restare selezionata almeno una fase.', 'avviso');
          return;
        }
        selezionate.splice(i, 1);
      } else {
        selezionate.push(fase);
      }
      const ordinate = tutte.filter((f) => selezionate.includes(f));
      S.filtri.fasi = ordinate.length === tutte.length ? [] : ordinate;
      caselle.forEach((casella, f) => { casella.checked = S.filtri.fasi.includes(f); });
      aggiornaEtichettaFasi();
      aggiornaRisultati();
    }

    chiudiMenu = (e) => { if (!menu.contains(e.target)) menu.open = false; };
    document.addEventListener('click', chiudiMenu);

    // Filtro per team: solo quando i team sono piu' di uno.
    const selezioneTeam = UI.multi()
      ? h('select', { 'aria-label': 'Filtra per team', onchange: (e) => { S.filtri.team = e.target.value; aggiornaRisultati(); } },
        h('option', { value: '' }, 'Tutti i team'),
        S.squadre.map((s) => h('option', { value: s.nome, selected: S.filtri.team === s.nome }, s.nome)))
      : null;

    const filtri = h('div', { class: 'filtri' },
      campoRicerca, selezioneTeam, menu,
      h('button', { type: 'button', class: 'btn btn-secondario', onclick: () => {
        S.filtri = { testo: '', fasi: [], team: '' };
        campoRicerca.value = '';
        if (selezioneTeam) selezioneTeam.value = '';
        caselle.forEach((c) => { c.checked = false; });
        aggiornaEtichettaFasi();
        aggiornaRisultati();
      } }, 'Reimposta filtri'),
      h('span', { style: { flex: '1' } }),
      h('button', { type: 'button', class: 'btn btn-scuro', onclick: esportaCsv }, 'Esporta CSV'),
      h('button', { type: 'button', class: 'btn btn-scuro', onclick: pdfRiepilogo }, 'PDF riepilogo'));

    // ----- risultati
    const riquadroTeam = UI.multi() ? h('div', { class: 'riquadro-team' }) : null;
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
    const tabella = h('div', { class: 'scorrimento' }, h('table', { class: 'dati', id: 'tabella-progetti' },
      h('thead', {}, intestazioni), corpo, piede));

    aggiornaRisultati = function () {
      const visibili = elencoVisibile();
      const ctx = contestoTeam();
      const tot = Elenco.totali(visibili);
      const daEmettere = Vpu.daEmettere(visibili, UI.oggiIso()).length;
      const totaleArchivio = UI.progetti().length;
      const colonneAttive = colonne();
      if (riquadroTeam) pannelloTeam(riquadroTeam, selezioneTeam, aggiornaRisultati);

      sostituisci(indicatori,
        kpi('Progetti', visibili.length === totaleArchivio ? String(tot.progetti) : tot.progetti + ' di ' + totaleArchivio, ''),
        kpi('Costo totale', euro(tot.costo), 'verde'),
        kpi('Ordini', String(tot.ordini), 'blu'),
        kpi('VPU da emettere', String(daEmettere), daEmettere ? 'rosso' : 'verde'));

      const conteggi = Elenco.conteggiPerFase(UI.progetti());
      menu.querySelectorAll('[data-conta]').forEach((el) => { el.textContent = '(' + conteggi[el.dataset.conta] + ')'; });

      // I grafici partono da tutto cio' che passa ricerca e team: il filtro per fase lo applicano
      // loro (fette nascoste), cosi' la legenda resta completa. Si ridisegnano dopo il clic, non
      // durante: il grafico non puo' distruggersi dentro il suo stesso gestore.
      const base = Elenco.filtra(UI.progetti(), { testo: S.filtri.testo, team: S.filtri.team }, ctx);
      disegnaGrafici(base, S.filtri.fasi, telaFasi, telaCosti, { fasi: vuotoFasi, costi: vuotoCosti },
        (fase) => setTimeout(() => alternaFase(fase), 0));

      sostituisci(intestazioni, colonneAttive.map((c) => {
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
        ? visibili.map((p) => riga(p, ctx.team(p)))
        : h('tr', {}, h('td', { class: 'vuoto-tabella', colspan: colonneAttive.length },
          totaleArchivio ? 'Nessun progetto corrisponde ai filtri.' : 'Nessun progetto: crea il primo con «Nuovo progetto» o importa un CSV.')));

      sostituisci(piede, visibili.length ? h('tr', {},
        h('td', { colspan: UI.multi() ? 8 : 7, class: 'destra' }, 'Totale (' + tot.progetti + ' progetti)'),
        h('td', { class: 'numero' }, euro(tot.costo)),
        h('td', { colspan: 4 })) : null);
    };

    sostituisci(contenitore, filtri, riquadroTeam, indicatori, graficiEl, tabella);
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
