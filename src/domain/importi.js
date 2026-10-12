/* Importi in euro.
 *
 * Nel dato un importo e' sempre un numero. Qui si legge il testo digitato o importato.
 * L'app attuale toglieva sempre i punti: "2000.9" diventava 20009 e "10000.25" 1000025.
 *
 * Regole:
 *  - con '.' e ',' insieme l'ultimo e' il decimale ("1.234,56", "1,234.56");
 *  - solo ',' e' il decimale ("2000,9");
 *  - piu' punti sono migliaia ("1.234.567");
 *  - un solo '.' e' decimale ("2000.9", "10000.25"), tranne con esattamente tre cifre
 *    dopo ("1.000"): ambiguo, si legge come migliaia e si segnala `ambiguo`.
 */
(function (radice) {
  'use strict';

  function arrotonda(n) {
    return Math.round(n * 100) / 100;
  }

  // -> { valido, valore, vuoto?, ambiguo? }
  function leggi(input) {
    if (typeof input === 'number') {
      return Number.isFinite(input) ? { valido: true, valore: arrotonda(input) } : { valido: false };
    }
    if (input == null) return { valido: true, valore: 0, vuoto: true };

    let s = String(input).replace(/€|eur/gi, '').replace(/\s+/g, '');
    if (s === '') return { valido: true, valore: 0, vuoto: true };

    let segno = 1;
    if (s[0] === '-') { segno = -1; s = s.slice(1); } else if (s[0] === '+') { s = s.slice(1); }
    if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return { valido: false };

    const punti = (s.match(/\./g) || []).length;
    const virgole = (s.match(/,/g) || []).length;
    let ambiguo = false;
    let normale;

    if (punti && virgole) {
      const decimale = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
      const migliaia = decimale === '.' ? ',' : '.';
      const quanti = decimale === '.' ? punti : virgole;
      if (quanti > 1) return { valido: false };
      normale = s.split(migliaia).join('').replace(decimale, '.');
    } else if (virgole) {
      if (virgole > 1) return { valido: false };
      normale = s.replace(',', '.');
    } else if (punti > 1) {
      normale = s.split('.').join('');
    } else if (punti === 1) {
      const dopo = s.length - s.indexOf('.') - 1;
      if (dopo === 3) {
        ambiguo = true;
        normale = s.replace('.', '');
      } else {
        normale = s;
      }
    } else {
      normale = s;
    }

    const valore = Number(normale);
    if (!Number.isFinite(valore)) return { valido: false };
    return { valido: true, valore: arrotonda(segno * valore), ambiguo };
  }

  // Sempre con il punto per le migliaia e due decimali: 10.000,00.
  function formatoEuro(numero) {
    const centesimi = Math.round(Math.abs(Number(numero) || 0) * 100);
    const intero = String(Math.floor(centesimi / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const decimali = String(centesimi % 100).padStart(2, '0');
    return (numero < 0 && centesimi > 0 ? '-' : '') + intero + ',' + decimali;
  }

  const api = { leggi, formatoEuro, arrotonda };

  radice.MP = radice.MP || {};
  radice.MP.importi = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
