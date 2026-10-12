/* Lettore CSV.
 *
 * Gestisce BOM, separatore configurabile (default `;`), campi tra virgolette con
 * separatori, virgolette doppie e a capo dentro il campo, righe CRLF.
 * Restituisce le righe come array di stringhe, senza toglierne gli spazi.
 * Le righe completamente vuote vengono scartate.
 */
(function (radice) {
  'use strict';

  function leggi(testo, separatore) {
    const sep = separatore || ';';
    const s = String(testo == null ? '' : testo).replace(/^﻿/, '');
    const righe = [];
    let riga = [];
    let campo = '';
    let tra = false;

    function chiudiRiga() {
      riga.push(campo);
      campo = '';
      if (!(riga.length === 1 && riga[0] === '')) righe.push(riga);
      riga = [];
    }

    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (tra) {
        if (c === '"') {
          if (s[i + 1] === '"') { campo += '"'; i++; } else { tra = false; }
        } else {
          campo += c;
        }
      } else if (c === '"' && campo === '') {
        tra = true;
      } else if (c === sep) {
        riga.push(campo);
        campo = '';
      } else if (c === '\r' && s[i + 1] === '\n') {
        // gestito al "\n" successivo
      } else if (c === '\n' || c === '\r') {
        chiudiRiga();
      } else {
        campo += c;
      }
    }
    if (campo !== '' || riga.length) chiudiRiga();
    return righe;
  }

  const api = { leggi };

  radice.MP = radice.MP || {};
  radice.MP.csv = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
