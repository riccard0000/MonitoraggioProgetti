/* Finestra di dettaglio di un progetto, e l'invio della richiesta di VPU per un ordine. */
(function (radice) {
  'use strict';

  const MP = radice.MP;
  const UI = MP.ui;
  const { h, badgeFase, badgeSiNo, euro, dataIT, periodo } = UI;
  const Modello = MP.modello;
  const Vpu = MP.vpu;

  // Solo indirizzi http/https: un valore come "javascript:..." non diventa mai un collegamento.
  function urlSicuro(testo) {
    const s = String(testo || '').trim();
    if (/^https?:\/\//i.test(s)) return s;
    if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s)) return 'https://' + s;
    return null;
  }

  function scheda(titolo, ...contenuto) {
    return h('div', { class: 'scheda-info' }, h('div', { class: 'titolo-scheda' }, titolo), contenuto);
  }

  // I destinatari sono quelli del team del progetto.
  function inviaEmailVpu(progetto, ordine, team) {
    const destinatari = UI.config(team || UI.teamDi(progetto.codice)).destinatariVpu || [];
    if (!destinatari.length) {
      UI.toast('Nessun destinatario per le email VPU: aggiungilo in Impostazioni. Apro la bozza senza destinatari.', 'avviso');
    }
    const link = h('a', { href: Vpu.mailto(Vpu.bozzaEmail(progetto, ordine, destinatari)) });
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function pdfScheda(p, team) {
    try {
      MP.reports.schedaProgetto(p, { team: UI.multi() ? team : null }).save(MP.reports.nomeFile(MP.reports.prefissi.scheda + '_' + p.codice));
    } catch (e) {
      UI.toast('Impossibile creare il PDF: ' + e.message, 'errore');
    }
  }

  function apriDettaglio(codice, team) {
    const voce = UI.voce(codice, team);
    if (!voce) return null;
    const p = voce.progetto;
    const puoModificare = UI.scrivibile(voce.team);
    const ordini = p.ordini || [];
    const attivita = (p.attivita || []).slice().sort((a, b) => ((a.inizio || '9999') < (b.inizio || '9999') ? -1 : 1));
    const url = urlSicuro(p.sito);

    const contenuto = h('div', {},
      h('div', { class: 'dettaglio-testa' },
        h('div', { class: 'titolo' }, p.codice, badgeFase(p.fase),
          UI.multi() ? h('span', { class: 'etichetta etichetta-nd', title: 'Team' }, voce.team) : null,
          puoModificare ? null : h('span', { class: 'etichetta etichetta-nd', title: 'Non si può modificare' }, '🔒 sola lettura')),
        h('div', { class: 'meta' },
          h('div', {}, 'Applicativo: ', h('strong', {}, p.applicativo || 'n/d')),
          h('div', {}, 'Project manager: ', h('strong', {}, p.projectManager || 'Non assegnato')))),

      h('div', { class: 'indicatori' },
        UI.kpi('Costo totale', euro(Modello.costoProgetto(p)), 'verde'),
        UI.kpi('Periodo', periodo(p), '', true),
        UI.kpi('Ordini', String(ordini.length), 'blu'),
        UI.kpi('Attività', String(attivita.length), 'arancio'),
        h('div', { class: 'indicatore' }, h('div', { class: 'etichetta-kpi' }, 'Promemoria'),
          h('div', { class: 'valore' }, badgeSiNo(p.promemoria)))),

      scheda('Descrizione', h('div', { class: 'testo' }, p.descrizione || 'Nessuna descrizione presente.')),
      p.sito ? scheda('Sito progetto', h('div', { class: 'testo' },
        url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, p.sito) : p.sito)) : null,
      p.note ? scheda('Note', h('div', { class: 'testo' }, p.note)) : null,

      scheda('Ordini (' + ordini.length + ')', ordini.length
        ? h('table', { class: 'dati' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'Riferimento'), h('th', { class: 'numero' }, 'Importo'),
            h('th', { class: 'centro' }, 'Offerta'), h('th', { class: 'centro' }, 'VPU'), h('th', {}, ''))),
          h('tbody', {}, ordini.map((o) => h('tr', {},
            h('td', {}, o.riferimento),
            h('td', { class: 'numero' }, euro(o.importo)),
            h('td', { class: 'centro' }, badgeSiNo(o.offerta)),
            h('td', { class: 'centro' }, badgeSiNo(o.vpu)),
            h('td', { class: 'destra' }, o.vpu === 'NO'
              ? h('button', { type: 'button', class: 'btn btn-secondario btn-piccolo', onclick: () => inviaEmailVpu(p, o, voce.team) }, '📧 Richiedi VPU')
              : null)))))
        : h('p', { class: 'tenue' }, 'Nessun ordine presente.')),

      scheda('Attività collegate (' + attivita.length + ')', attivita.length
        ? h('table', { class: 'dati' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Stato'), h('th', {}, 'Descrizione'), h('th', {}, 'Periodo'), h('th', {}, 'Note'))),
          h('tbody', {}, attivita.map((a) => h('tr', {},
            h('td', {}, h('strong', {}, a.stato === 'Completata' ? '✔ Completata' : a.stato)),
            h('td', {}, a.descrizione),
            h('td', { class: 'nowrap' }, a.inizio === a.fine || !a.fine ? dataIT(a.inizio) : dataIT(a.inizio) + ' – ' + dataIT(a.fine)),
            h('td', {}, a.note || '-')))))
        : h('p', { class: 'tenue' }, 'Nessuna attività presente.')));

    const d = UI.dialogo({
      titolo: 'Dettaglio progetto',
      contenuto,
      larghezza: 'min(900px, 97vw)',
      pulsanti: [
        { testo: 'Chiudi', valore: 'chiudi' },
        { testo: 'PDF', classe: 'btn-scuro', azione: () => { pdfScheda(p, voce.team); return false; } }
      ].concat(puoModificare ? [{ testo: 'Modifica', classe: 'btn-primario', valore: 'modifica' }] : [])
    });
    d.finita.then((esito) => { if (esito === 'modifica') UI.apriModulo(p.codice, voce.team); });
    return d;
  }

  UI.apriDettaglio = apriDettaglio;
  UI.inviaEmailVpu = inviaEmailVpu;
  UI.urlSicuro = urlSicuro;
})(window);
