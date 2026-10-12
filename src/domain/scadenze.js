/* Scadenze delle attivita'.
 *
 * Considera solo le attivita' «In corso» e «Da avviare» e le classifica rispetto a `oggi`:
 *  - SCADUTA: la data di fine e' passata (la scadenza ha la precedenza);
 *  - DA AVVIARE: la data di inizio e' futura;
 *  - IN CORSO: tutte le altre.
 * `giorni` e' la distanza dalla data che conta: giorni di ritardo (SCADUTA), giorni
 * all'inizio (DA AVVIARE), giorni alla fine (IN CORSO, null se manca la fine).
 */
(function (radice) {
  'use strict';

  const dep = (nome) => (typeof require === 'function' ? require('./' + nome + '.js') : radice.MP[nome]);
  const Codice = dep('codice');
  const Data = dep('date');
  const Modello = dep('modello');

  const SCADUTA = 'SCADUTA';
  const IN_CORSO = 'IN CORSO';
  const DA_AVVIARE = 'DA AVVIARE';
  const PRIORITA = { [SCADUTA]: 1, [IN_CORSO]: 2, [DA_AVVIARE]: 3 };

  // -> [{ codice, applicativo, progetto, attivita, inizio, fine, giorni, tag, note }]
  function classifica(progetti, oggi) {
    const o = Data.leggi(oggi);
    if (!o.valida) throw new Error('Scadenze: data odierna non valida: ' + oggi);

    const righe = [];
    for (const p of progetti) {
      for (const a of p.attivita || []) {
        const stato = Modello.canonico(Modello.STATI_ATTIVITA, a.stato);
        if (stato !== 'In corso' && stato !== 'Da avviare') continue;

        const inizio = Data.leggi(a.inizio);
        const fine = Data.leggi(a.fine);
        let tag;
        let giorni = null;
        if (fine.valida && o.valore > fine.valore) {
          tag = SCADUTA;
          giorni = Data.giorniTra(fine.valore, o.valore);
        } else if (inizio.valida && o.valore < inizio.valore) {
          tag = DA_AVVIARE;
          giorni = Data.giorniTra(o.valore, inizio.valore);
        } else {
          tag = IN_CORSO;
          giorni = fine.valida ? Data.giorniTra(o.valore, fine.valore) : null;
        }

        righe.push({
          codice: p.codice,
          applicativo: p.applicativo,
          progetto: p.descrizione,
          attivita: a.descrizione,
          inizio: inizio.valida ? inizio.valore : '',
          fine: fine.valida ? fine.valore : '',
          giorni,
          tag,
          note: a.note || ''
        });
      }
    }

    // Prima le scadute, poi quelle in corso, poi da avviare; nel gruppo per data (senza data in fondo).
    const quando = (r) => (r.tag === DA_AVVIARE ? r.inizio : r.fine) || '9999-12-31';
    righe.sort((a, b) => {
      if (PRIORITA[a.tag] !== PRIORITA[b.tag]) return PRIORITA[a.tag] - PRIORITA[b.tag];
      const qa = quando(a);
      const qb = quando(b);
      if (qa !== qb) return qa < qb ? -1 : 1;
      return a.codice.localeCompare(b.codice);
    });
    return righe;
  }

  function riepilogo(righe) {
    return {
      scadute: righe.filter((r) => r.tag === SCADUTA).length,
      inCorso: righe.filter((r) => r.tag === IN_CORSO).length,
      daAvviare: righe.filter((r) => r.tag === DA_AVVIARE).length,
      progetti: new Set(righe.map((r) => Codice.chiave(r.codice))).size
    };
  }

  const api = { SCADUTA, IN_CORSO, DA_AVVIARE, classifica, riepilogo };

  radice.MP = radice.MP || {};
  radice.MP.scadenze = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
