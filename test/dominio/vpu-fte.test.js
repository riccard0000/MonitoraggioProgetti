'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Vpu = require('../../src/domain/vpu.js');
const Fte = require('../../src/domain/fte.js');
const Modello = require('../../src/domain/modello.js');

const OGGI = '2026-10-12';
const vicino = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' != ' + b);
const progetto = (parziale) => Modello.creaProgetto(parziale);

// ---------------------------------------------------------------------- VPU

test('VPU: elenca gli ordini con VPU a NO dei progetti finiti da almeno un giorno', () => {
  const progetti = [
    progetto({ codice: 'A-1', fine: '2026-02-23', ordini: [
      { riferimento: 'O1', importo: 1000, vpu: 'NO' }, { riferimento: 'O2', importo: 500, vpu: 'SI' }] }),
    progetto({ codice: 'B-1', fine: OGGI, ordini: [{ riferimento: 'B1', vpu: 'NO' }] }),
    progetto({ codice: 'C-1', fine: '2026-10-11', ordini: [{ riferimento: 'C1', vpu: 'no' }] }),
    progetto({ codice: 'D-1', ordini: [{ riferimento: 'D1', vpu: 'NO' }] }),
    progetto({ codice: 'E-1', fine: '2025-12-31' }),
    progetto({ codice: 'F-1', fine: '2026-02-23', ordini: [{ riferimento: 'F1', vpu: 'NO' }] })
  ];

  const r = Vpu.daEmettere(progetti, OGGI);
  assert.deepEqual(r.map((x) => x.codice + '/' + x.riferimento), ['A-1/O1', 'F-1/F1', 'C-1/C1']);
  assert.equal(r[0].importo, 1000);

  const giorni = (Date.UTC(2026, 9, 12) - Date.UTC(2026, 1, 23)) / 86400000;
  assert.equal(r[0].giorniDallaFine, giorni);
  assert.equal(r[2].giorniDallaFine, 1);
});

test('VPU: ogni ordine dello stesso progetto è una riga distinta', () => {
  const p = progetto({ codice: 'A-1', fine: '2026-01-10', ordini: [
    { riferimento: 'O1', vpu: 'NO' }, { riferimento: 'O2', vpu: 'NO' }] });
  assert.equal(Vpu.daEmettere([p], OGGI).length, 2);
});

test('VPU: richiede una data odierna valida', () => {
  assert.throws(() => Vpu.daEmettere([], 'ieri'), /data odierna non valida/);
});

test('VPU: la bozza dell\'email usa riferimento e importo dell\'ordine', () => {
  const p = progetto({ codice: 'EVO-26-001', applicativo: 'SERVIZIO TERMICO', descrizione: 'Nuova attivazione' });
  const ordine = { riferimento: 'Prova 1', importo: 10000, offerta: 'SI', vpu: 'NO' };
  const b = Vpu.bozzaEmail(p, ordine, ['a@esempio.it', 'b@esempio.it']);

  assert.equal(b.a, 'a@esempio.it,b@esempio.it');
  assert.equal(b.oggetto, 'Invio VPU - EVO-26-001 SERVIZIO TERMICO');
  assert.match(b.corpo, /lettera d'ordine Prova 1 - Nuova attivazione/);
  assert.match(b.corpo, /evolutiva EVO-26-001\./);
  assert.match(b.corpo, /L'importo dell'ordine è di 10\.000,00 €\./);
  assert.match(b.corpo, /rilasciata in esercizio il _+\./, 'la data di rilascio resta da compilare');
});

test('VPU: il collegamento mailto codifica oggetto e testo', () => {
  const p = progetto({ codice: 'X-1', applicativo: 'A&B' });
  const link = Vpu.mailto(Vpu.bozzaEmail(p, { riferimento: 'O 1', importo: 5 }, ['a@esempio.it']));

  assert.ok(link.startsWith('mailto:a@esempio.it?subject='));
  assert.ok(link.includes('subject=Invio%20VPU%20-%20X-1%20A%26B'));
  assert.ok(link.includes('&body=Buongiorno%2C%0D%0A'));
  assert.ok(!link.includes(' '), 'nessuno spazio non codificato');
});

// ---------------------------------------------------------------------- FTE

test('FTE: un mese parziale pesa in proporzione ai giorni attivi', () => {
  const p = progetto({ codice: 'P-1', inizio: '2026-01-16', fine: '2026-01-31' });
  const gennaio = Fte.mese([p], 2026, 0, { oggi: OGGI });
  assert.equal(gennaio.progettiAttivi, 1);
  assert.equal(gennaio.dettaglio[0].giorniAttivi, 16);
  vicino(gennaio.fte, 0.2 * 16 / 31);
  assert.equal(Fte.mese([p], 2026, 1, { oggi: OGGI }).progettiAttivi, 0);
});

test('FTE: un mese intero vale quanto il valore per progetto', () => {
  const p = progetto({ codice: 'P-2', inizio: '2025-11-10', fine: '2026-02-15' });
  vicino(Fte.mese([p], 2026, 0, { oggi: OGGI }).fte, 0.2);
  vicino(Fte.mese([p], 2026, 1, { oggi: OGGI }).fte, 0.2 * 15 / 28);
});

test('FTE: senza data di fine il progetto resta attivo fino al 31/12 dell\'anno corrente', () => {
  const p = progetto({ codice: 'P-3', inizio: '2026-09-01' });
  vicino(Fte.mese([p], 2026, 8, { oggi: OGGI }).fte, 0.2);
  vicino(Fte.mese([p], 2026, 11, { oggi: OGGI }).fte, 0.2);
  assert.equal(Fte.mese([p], 2027, 0, { oggi: OGGI }).progettiAttivi, 0);
});

test('FTE: nessun filtro sull\'anno, funziona anche per i progetti del 2024', () => {
  const p = progetto({ codice: 'P-4', inizio: '2024-04-19', fine: '2024-10-21' });
  vicino(Fte.mese([p], 2024, 9, { oggi: OGGI }).fte, 0.2 * 21 / 31);
});

test('FTE: gli ordini non moltiplicano il carico del progetto', () => {
  const uno = progetto({ codice: 'P-5', inizio: '2026-01-01', fine: '2026-12-31', ordini: [{ riferimento: 'A', importo: 1 }] });
  const tre = progetto({ codice: 'P-5', inizio: '2026-01-01', fine: '2026-12-31',
    ordini: [{ riferimento: 'A' }, { riferimento: 'B' }, { riferimento: 'C' }] });
  vicino(Fte.mese([tre], 2026, 5, { oggi: OGGI }).fte, Fte.mese([uno], 2026, 5, { oggi: OGGI }).fte);
});

test('FTE: il valore per progetto è un parametro', () => {
  const p = progetto({ codice: 'P-6', inizio: '2026-01-01', fine: '2026-12-31' });
  vicino(Fte.mese([p], 2026, 3, { oggi: OGGI, fteProgetto: 0.5 }).fte, 0.5);
});

test('FTE: progetti senza inizio o con date invertite vengono saltati', () => {
  const senzaInizio = progetto({ codice: 'P-7' });
  const invertito = progetto({ codice: 'P-8', inizio: '2026-05-10', fine: '2026-05-01' });
  assert.equal(Fte.mese([senzaInizio, invertito], 2026, 4, { oggi: OGGI }).progettiAttivi, 0);
});

test('FTE: l\'anno ha dodici mesi, somma e media', () => {
  const p = progetto({ codice: 'P-9', inizio: '2026-01-01', fine: '2026-12-31' });
  const a = Fte.anno([p], 2026, { oggi: OGGI });
  assert.equal(a.mesi.length, 12);
  vicino(a.sommaMesi, 12 * 0.2);
  vicino(a.mediaMensile, 0.2);
});

test('FTE: richiede la data odierna', () => {
  assert.throws(() => Fte.mese([], 2026, 0), /serve la data odierna/);
});
