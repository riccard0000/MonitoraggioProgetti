/* Export in CSV, nel formato esteso che `importCsv` rilegge senza perdite.
 *
 * Una riga per ordine o per attivita': per ogni progetto le righe sono max(1, ordini,
 * attivita') e la riga i porta l'ordine i e l'attivita' i. Le colonne del progetto si
 * ripetono su ogni riga. Date `gg/mm/aaaa` e importi `10.000,00` perche' Excel in italiano
 * li legge bene. Separatore `;`. Il BOM UTF-8 lo aggiunge chi salva il file.
 */
(function (radice) {
  'use strict';

  const dep = (nome) => (typeof require === 'function' ? require('./' + nome + '.js') : radice.MP[nome]);
  const Data = dep('date');
  const Importi = dep('importi');

  const INTESTAZIONI = [
    'Codice', 'Applicativo', 'Project Manager', 'Fase', 'Periodo Inizio', 'Periodo Fine',
    'Sito Progetto', 'Descrizione', 'Note', 'Promemoria',
    'Ordine Riferimento', 'Ordine Importo', 'Ordine Offerta', 'Ordine VPU',
    'Attività Descrizione', 'Attività Inizio', 'Attività Fine', 'Attività Stato', 'Attività Note'
  ];

  function cella(valore) {
    const testo = valore == null ? '' : String(valore);
    return '"' + testo.replace(/"/g, '""') + '"';
  }

  function esporta(progetti) {
    const righe = [INTESTAZIONI.map(cella).join(';')];

    for (const p of progetti) {
      const ordini = p.ordini || [];
      const attivita = p.attivita || [];
      const quante = Math.max(1, ordini.length, attivita.length);

      for (let i = 0; i < quante; i++) {
        const o = ordini[i];
        const a = attivita[i];
        righe.push([
          p.codice, p.applicativo, p.projectManager, p.fase,
          Data.formatoIT(p.inizio), Data.formatoIT(p.fine),
          p.sito, p.descrizione, p.note, p.promemoria,
          o ? o.riferimento : '', o ? Importi.formatoEuro(o.importo) : '', o ? o.offerta : '', o ? o.vpu : '',
          a ? a.descrizione : '', a ? Data.formatoIT(a.inizio) : '', a ? Data.formatoIT(a.fine) : '',
          a ? a.stato : '', a ? a.note : ''
        ].map(cella).join(';'));
      }
    }
    return righe.join('\r\n') + '\r\n';
  }

  const api = { INTESTAZIONI, esporta };

  radice.MP = radice.MP || {};
  radice.MP.esportaCsv = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
