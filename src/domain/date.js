/* Date.
 *
 * Nel dato le date sono stringhe `aaaa-mm-gg`; a schermo `gg/mm/aaaa`. Tutti i calcoli
 * passano da UTC: niente `new Date("aaaa-mm-gg")` letto come ora locale, niente
 * scarti dovuti all'ora legale.
 */
(function (radice) {
  'use strict';

  const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
  const IT = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

  function pad(n, lunghezza) {
    return String(n).padStart(lunghezza, '0');
  }

  function esiste(anno, mese, giorno) {
    const d = new Date(Date.UTC(anno, mese - 1, giorno));
    return d.getUTCFullYear() === anno && d.getUTCMonth() === mese - 1 && d.getUTCDate() === giorno;
  }

  // Accetta `aaaa-mm-gg` e `gg/mm/aaaa`.
  // -> { vuota: true } | { valida: true, valore: 'aaaa-mm-gg' } | { valida: false }
  function leggi(input) {
    if (input == null) return { vuota: true };
    const s = String(input).trim();
    if (s === '') return { vuota: true };

    let anno;
    let mese;
    let giorno;
    let r = ISO.exec(s);
    if (r) {
      anno = Number(r[1]); mese = Number(r[2]); giorno = Number(r[3]);
    } else if ((r = IT.exec(s))) {
      giorno = Number(r[1]); mese = Number(r[2]); anno = Number(r[3]);
    } else {
      return { valida: false };
    }
    if (!esiste(anno, mese, giorno)) return { valida: false };
    return { valida: true, valore: pad(anno, 4) + '-' + pad(mese, 2) + '-' + pad(giorno, 2) };
  }

  function formatoIT(iso) {
    const r = ISO.exec(iso || '');
    return r ? r[3] + '/' + r[2] + '/' + r[1] : '';
  }

  function inGiorni(iso) {
    const r = ISO.exec(iso);
    if (!r) throw new Error('Data non valida: ' + iso);
    return Date.UTC(Number(r[1]), Number(r[2]) - 1, Number(r[3])) / 86400000;
  }

  // Giorni da `da` ad `a` (negativo se `a` precede `da`).
  function giorniTra(da, a) {
    return Math.round(inGiorni(a) - inGiorni(da));
  }

  function giorniNelMese(anno, mese0) {
    return new Date(Date.UTC(anno, mese0 + 1, 0)).getUTCDate();
  }

  // `mese0` va da 0 (gennaio) a 11 (dicembre).
  function iso(anno, mese0, giorno) {
    return pad(anno, 4) + '-' + pad(mese0 + 1, 2) + '-' + pad(giorno, 2);
  }

  const api = { leggi, formatoIT, giorniTra, giorniNelMese, iso };

  radice.MP = radice.MP || {};
  radice.MP.date = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
