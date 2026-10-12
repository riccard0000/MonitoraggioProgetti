/* Codice progetto.
 *
 * Il codice identifica l'evolutiva, lo assegna un'altra struttura e quindi e' testo
 * libero: non si genera e il formato non si controlla. Deve solo essere univoco.
 * Il confronto ignora spazi ai bordi, spazi multipli e maiuscole/minuscole.
 */
(function (radice) {
  'use strict';

  function normalizza(valore) {
    return String(valore == null ? '' : valore).trim().replace(/\s+/g, ' ');
  }

  // Forma usata per confrontare due codici o come chiave in una mappa.
  function chiave(valore) {
    return normalizza(valore).toUpperCase();
  }

  function uguali(a, b) {
    const ka = chiave(a);
    return ka !== '' && ka === chiave(b);
  }

  const api = { normalizza, chiave, uguali };

  radice.MP = radice.MP || {};
  radice.MP.codice = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
