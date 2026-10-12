'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Codice = require('../../src/domain/codice.js');
const Data = require('../../src/domain/date.js');
const Importi = require('../../src/domain/importi.js');
const Csv = require('../../src/domain/csv.js');

// ------------------------------------------------------------------- codice

test('codice: normalizza toglie spazi ai bordi e doppi', () => {
  assert.equal(Codice.normalizza('  EVO-26-001 '), 'EVO-26-001');
  assert.equal(Codice.normalizza('EVO   26'), 'EVO 26');
  assert.equal(Codice.normalizza(null), '');
});

test('codice: il confronto ignora maiuscole e spazi, un codice vuoto non è mai uguale', () => {
  assert.equal(Codice.chiave('evo-26-001'), 'EVO-26-001');
  assert.equal(Codice.uguali('EVO-26-001 ', ' evo-26-001'), true);
  assert.equal(Codice.uguali('EVO-26-001', 'EVO-26-002'), false);
  assert.equal(Codice.uguali('', ''), false);
});

// --------------------------------------------------------------------- date

test('date: legge aaaa-mm-gg e gg/mm/aaaa e restituisce sempre aaaa-mm-gg', () => {
  assert.deepEqual(Data.leggi('2026-02-28'), { valida: true, valore: '2026-02-28' });
  assert.deepEqual(Data.leggi('19/02/2025'), { valida: true, valore: '2025-02-19' });
  assert.deepEqual(Data.leggi('1/3/2026'), { valida: true, valore: '2026-03-01' });
  assert.deepEqual(Data.leggi('2024-02-29'), { valida: true, valore: '2024-02-29' });
});

test('date: rifiuta date impossibili o in altri formati, distingue il vuoto', () => {
  for (const x of ['31/02/2026', '2026-13-01', '2026-02-29', 'ieri', '19-02-2025', '19/02/25']) {
    assert.equal(Data.leggi(x).valida, false, x);
  }
  assert.deepEqual(Data.leggi(''), { vuota: true });
  assert.deepEqual(Data.leggi('  '), { vuota: true });
  assert.deepEqual(Data.leggi(null), { vuota: true });
});

test('date: formato italiano e calcoli senza scarti per l\'ora legale', () => {
  assert.equal(Data.formatoIT('2026-04-21'), '21/04/2026');
  assert.equal(Data.formatoIT(''), '');
  assert.equal(Data.formatoIT('non-una-data'), '');
  // L'ora legale cambia il 29/03/2026 e il 25/10/2026.
  assert.equal(Data.giorniTra('2026-03-28', '2026-03-30'), 2);
  assert.equal(Data.giorniTra('2026-10-24', '2026-10-26'), 2);
  assert.equal(Data.giorniTra('2026-10-12', '2026-10-11'), -1);
  assert.equal(Data.giorniNelMese(2024, 1), 29);
  assert.equal(Data.giorniNelMese(2026, 1), 28);
  assert.equal(Data.giorniNelMese(2026, 11), 31);
  assert.equal(Data.iso(2026, 0, 5), '2026-01-05');
});

// ------------------------------------------------------------------ importi

test('importi: legge i formati italiani e anglosassoni', () => {
  const casi = [
    ['2000,9', 2000.9], ['2.000,90', 2000.9], ['10.000,00', 10000], ['1000', 1000],
    ['1.234,56', 1234.56], ['1,234.56', 1234.56], ['1.234.567', 1234567],
    ['€ 1.500,50', 1500.5], ['0,5', 0.5], ['-100,5', -100.5]
  ];
  for (const [testo, atteso] of casi) {
    const r = Importi.leggi(testo);
    assert.equal(r.valido, true, testo);
    assert.equal(r.valore, atteso, testo);
    assert.equal(r.ambiguo, false, testo);
  }
});

test('importi: regressione dell\'app attuale, il punto decimale non moltiplica l\'importo', () => {
  assert.equal(Importi.leggi('2000.9').valore, 2000.9);       // prima: 20009
  assert.equal(Importi.leggi('10000.25').valore, 10000.25);   // prima: 1000025
});

test('importi: un punto con tre cifre dopo è ambiguo e si legge come migliaia', () => {
  assert.deepEqual(Importi.leggi('1.000'), { valido: true, valore: 1000, ambiguo: true });
  assert.equal(Importi.leggi('2.500').ambiguo, true);
  assert.equal(Importi.leggi('12.5').ambiguo, false);
});

test('importi: vuoto, numeri e testi non validi', () => {
  for (const x of ['', '   ', null, undefined]) {
    assert.deepEqual(Importi.leggi(x), { valido: true, valore: 0, vuoto: true });
  }
  assert.equal(Importi.leggi(2000.904).valore, 2000.9);
  assert.equal(Importi.leggi(NaN).valido, false);
  for (const x of ['abc', '1,2,3', '1.2,3,4', '--5', '12a']) {
    assert.equal(Importi.leggi(x).valido, false, x);
  }
});

test('importi: formato euro con punto per le migliaia e due decimali', () => {
  assert.equal(Importi.formatoEuro(10000), '10.000,00');
  assert.equal(Importi.formatoEuro(2000.9), '2.000,90');
  assert.equal(Importi.formatoEuro(1000), '1.000,00');
  assert.equal(Importi.formatoEuro(0), '0,00');
  assert.equal(Importi.formatoEuro(1234567.891), '1.234.567,89');
  assert.equal(Importi.formatoEuro(-5), '-5,00');
  assert.equal(Importi.formatoEuro(-0.001), '0,00');
  assert.equal(Importi.arrotonda(0.1 + 0.2), 0.3);
});

// ---------------------------------------------------------------------- csv

test('csv: righe e campi semplici, con BOM e CRLF', () => {
  assert.deepEqual(Csv.leggi('a;b\n1;2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(Csv.leggi('﻿a;b\r\n1;2\r\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(Csv.leggi('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
});

test('csv: campi tra virgolette con separatore, virgolette doppie e a capo', () => {
  assert.deepEqual(Csv.leggi('a;"x;y"\n'), [['a', 'x;y']]);
  assert.deepEqual(Csv.leggi('"ha detto ""ciao"""'), [['ha detto "ciao"']]);
  assert.deepEqual(Csv.leggi('a;"riga1\nriga2";c\n'), [['a', 'riga1\nriga2', 'c']]);
});

test('csv: campi vuoti e spazi si conservano, le righe vuote si scartano', () => {
  assert.deepEqual(Csv.leggi('a;;c'), [['a', '', 'c']]);
  assert.deepEqual(Csv.leggi('a;b;'), [['a', 'b', '']]);
  assert.deepEqual(Csv.leggi(' a ;b'), [[' a ', 'b']]);
  assert.deepEqual(Csv.leggi('a\n\n\nb'), [['a'], ['b']]);
  assert.deepEqual(Csv.leggi(''), []);
});
