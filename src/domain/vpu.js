/* VPU da emettere.
 *
 * Il VPU si emette per *ordine*. Il criterio e' quello dell'app attuale, applicato ai singoli
 * ordini: progetto finito da almeno un giorno e ordine con VPU = NO. Non guarda la fase
 * (questione aperta in docs/modello-dati.md).
 */
(function (radice) {
  'use strict';

  const dep = (nome) => (typeof require === 'function' ? require('./' + nome + '.js') : radice.MP[nome]);
  const Data = dep('date');
  const Importi = dep('importi');

  // `oggi` e' una data `aaaa-mm-gg` passata dal chiamante, cosi' la funzione e' deterministica.
  // -> [{ codice, applicativo, descrizione, riferimento, importo, inizio, fine, giorniDallaFine }]
  function daEmettere(progetti, oggi) {
    const o = Data.leggi(oggi);
    if (!o.valida) throw new Error('VPU: data odierna non valida: ' + oggi);

    const out = [];
    for (const p of progetti) {
      const fine = Data.leggi(p.fine);
      if (!fine.valida) continue;
      const giorni = Data.giorniTra(fine.valore, o.valore);
      if (giorni < 1) continue;

      for (const ordine of p.ordini || []) {
        if (String(ordine.vpu || '').trim().toUpperCase() !== 'NO') continue;
        out.push({
          codice: p.codice,
          applicativo: p.applicativo,
          descrizione: p.descrizione,
          riferimento: ordine.riferimento,
          importo: ordine.importo,
          inizio: p.inizio,
          fine: fine.valore,
          giorniDallaFine: giorni
        });
      }
    }

    // Prima i progetti finiti da piu' tempo.
    out.sort((a, b) => {
      if (a.fine !== b.fine) return a.fine < b.fine ? -1 : 1;
      return a.codice.localeCompare(b.codice) || a.riferimento.localeCompare(b.riferimento);
    });
    return out;
  }

  // Bozza dell'email di richiesta del VPU per un ordine. Le date di rilascio e il collaudatore
  // restano da compilare a mano. `destinatari`: elenco di indirizzi (dalla configurazione).
  function bozzaEmail(progetto, ordine, destinatari) {
    const rif = ordine.riferimento + (progetto.descrizione ? ' - ' + progetto.descrizione : '');
    const corpo = [
      'Buongiorno,',
      '',
      'in base alla lettera d\'ordine ' + rif + ' si richiede la predisposizione del relativo VPU per l\'evolutiva ' +
        progetto.codice + '.',
      '',
      'L\'importo dell\'ordine è di ' + Importi.formatoEuro(ordine.importo) + ' €.',
      '',
      'L\'evolutiva è stata rilasciata in esercizio il _____________.',
      'Il collaudo è stato effettuato dal collega ____________ della funzione _______________.',
      '',
      'Grazie.'
    ].join('\r\n');
    return {
      a: (destinatari || []).join(','),
      oggetto: 'Invio VPU - ' + progetto.codice + (progetto.applicativo ? ' ' + progetto.applicativo : ''),
      corpo
    };
  }

  function mailto(bozza) {
    return 'mailto:' + bozza.a + '?subject=' + encodeURIComponent(bozza.oggetto) + '&body=' + encodeURIComponent(bozza.corpo);
  }

  const api = { daEmettere, bozzaEmail, mailto };

  radice.MP = radice.MP || {};
  radice.MP.vpu = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
