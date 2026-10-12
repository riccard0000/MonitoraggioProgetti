/* Carico FTE del project manager.
 *
 * Ogni progetto attivo in un mese pesa `fteProgetto` FTE, in proporzione ai giorni del mese
 * in cui e' attivo. Il progetto e' uno solo per codice: gli ordini non moltiplicano il carico.
 *
 * `fteProgetto` e' un segnaposto (0,20), non un valore reale: va passato in configurazione.
 * Senza data di fine il progetto e' considerato attivo fino al 31/12 dell'anno di `oggi`
 * (come nell'app attuale). Nessun filtro sull'anno e nessun controllo sul formato del codice.
 */
(function (radice) {
  'use strict';

  const dep = (nome) => (typeof require === 'function' ? require('./' + nome + '.js') : radice.MP[nome]);
  const Data = dep('date');

  const FTE_PROGETTO_SEGNAPOSTO = 0.2;

  function configurazione(opzioni) {
    const cfg = Object.assign({ fteProgetto: FTE_PROGETTO_SEGNAPOSTO, oggi: null }, opzioni);
    const oggi = Data.leggi(cfg.oggi);
    if (!oggi.valida) throw new Error('FTE: serve la data odierna `oggi` in formato aaaa-mm-gg');
    cfg.annoOggi = Number(oggi.valore.slice(0, 4));
    return cfg;
  }

  // `mese0` va da 0 (gennaio) a 11 (dicembre).
  // -> { anno, mese, progettiAttivi, fte, dettaglio: [{ codice, giorniAttivi, fte }] }
  function mese(progetti, anno, mese0, opzioni) {
    const cfg = configurazione(opzioni);
    const giorniMese = Data.giorniNelMese(anno, mese0);
    const primo = Data.iso(anno, mese0, 1);
    const ultimo = Data.iso(anno, mese0, giorniMese);

    const dettaglio = [];
    let totale = 0;
    for (const p of progetti) {
      const inizio = Data.leggi(p.inizio);
      if (!inizio.valida) continue;
      const fine = Data.leggi(p.fine);
      const fineEffettiva = fine.valida ? fine.valore : Data.iso(cfg.annoOggi, 11, 31);

      const da = inizio.valore > primo ? inizio.valore : primo;
      const a = fineEffettiva < ultimo ? fineEffettiva : ultimo;
      const giorniAttivi = Data.giorniTra(da, a) + 1;
      if (giorniAttivi <= 0) continue;

      const quota = cfg.fteProgetto * giorniAttivi / giorniMese;
      dettaglio.push({ codice: p.codice, giorniAttivi, fte: quota });
      totale += quota;
    }
    return { anno, mese: mese0, progettiAttivi: dettaglio.length, fte: totale, dettaglio };
  }

  // I dodici mesi di un anno. `sommaMesi` e' la somma degli FTE mensili (come il totale
  // annuo dell'app attuale), `mediaMensile` la stessa divisa per 12.
  function anno(progetti, annoRiferimento, opzioni) {
    const mesi = [];
    for (let m = 0; m < 12; m++) mesi.push(mese(progetti, annoRiferimento, m, opzioni));
    const sommaMesi = mesi.reduce((tot, m) => tot + m.fte, 0);
    return { anno: annoRiferimento, mesi, sommaMesi, mediaMensile: sommaMesi / 12 };
  }

  const api = { FTE_PROGETTO_SEGNAPOSTO, mese, anno };

  radice.MP = radice.MP || {};
  radice.MP.fte = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
