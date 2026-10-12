'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Esporta = require('../../src/domain/esportaCsv.js');
const Import = require('../../src/domain/importCsv.js');
const Csv = require('../../src/domain/csv.js');
const Modello = require('../../src/domain/modello.js');

const fixture = (nome) => fs.readFileSync(path.join(__dirname, '..', 'fixtures', nome), 'utf8');

const progettiDiProva = () => [
  Modello.creaProgetto({
    codice: 'EVO-26-010', applicativo: 'SERVIZIO TERMICO 3.0', projectManager: 'Verdi', fase: 'Sviluppo',
    inizio: '2026-01-15', fine: '2026-09-30', sito: 'https://esempio.it/x', promemoria: 'SI',
    descrizione: 'Evolutiva con "virgolette"; punto e virgola',
    note: 'Prima riga\nseconda riga',
    ordini: [
      { riferimento: 'Ordine A', importo: 10000, offerta: 'SI', vpu: 'SI' },
      { riferimento: 'Ordine B', importo: 2500.5, offerta: 'SI', vpu: 'NO' }
    ],
    attivita: [
      { descrizione: 'Analisi', inizio: '2026-01-15', fine: '2026-02-15', stato: 'Completata', note: 'ok' },
      { descrizione: 'Sviluppo', inizio: '2026-02-16', fine: '2026-06-30', stato: 'In corso', note: '' },
      { descrizione: 'Collaudo', inizio: '2026-07-01', fine: '', stato: 'Da avviare', note: 'da pianificare' }
    ]
  }),
  Modello.creaProgetto({ codice: 'EVO-26-011', fase: 'Ideazione' }),
  Modello.creaProgetto({
    codice: 'EET-24-001', applicativo: 'SITO ACME', fase: 'Esercizio', inizio: '2024-04-19', fine: '2024-10-21',
    ordini: [{ riferimento: 'Fornitore 1234/L1', importo: 2000.9, offerta: 'SI', vpu: 'SI' }]
  })
];

test('esporta: intestazione, righe per ordine/attività, date e importi in italiano', () => {
  const righe = Csv.leggi(Esporta.esporta(progettiDiProva()));
  assert.deepEqual(righe[0], Esporta.INTESTAZIONI);
  // 3 righe per il primo progetto (3 attività, 2 ordini), 1 per ciascuno degli altri due.
  assert.equal(righe.length, 1 + 3 + 1 + 1);

  const c = (nome) => Esporta.INTESTAZIONI.indexOf(nome);
  assert.equal(righe[1][c('Periodo Inizio')], '15/01/2026');
  assert.equal(righe[1][c('Ordine Importo')], '10.000,00');
  assert.equal(righe[2][c('Ordine Importo')], '2.500,50');
  assert.equal(righe[3][c('Ordine Riferimento')], '', 'la terza riga non ha un ordine');
  assert.equal(righe[3][c('Attività Descrizione')], 'Collaudo');
  assert.equal(righe[1][c('Descrizione')], 'Evolutiva con "virgolette"; punto e virgola');
});

test('round-trip: esporta e reimporta restituisce gli stessi progetti, senza avvisi', () => {
  const originali = progettiDiProva();
  const r = Import.importa(Esporta.esporta(originali));

  assert.equal(r.formato, 'esteso');
  assert.deepEqual(r.conflitti, []);
  assert.deepEqual(r.avvisi, []);
  assert.deepEqual(r.errori, []);
  assert.deepEqual(r.progetti, originali);
});

test('round-trip: anche i progetti importati dal CSV precedente sopravvivono', () => {
  const vecchi = Import.importa(fixture('legacy-conflitto-codice.csv')).progetti;
  const di_nuovo = Import.importa(Esporta.esporta(vecchi));
  assert.deepEqual(di_nuovo.progetti, vecchi);
  assert.deepEqual(di_nuovo.conflitti, []);
});

test('import esteso: più ordini restano distinti, lo stesso ordine ripetuto è uno solo', () => {
  const csv = [
    'Codice;Fase;Ordine Riferimento;Ordine Importo;Ordine Offerta;Ordine VPU;Attività Descrizione',
    'X-1;Avvio;O1;1.000,00;SI;NO;a',
    'X-1;Avvio;O1;1.000,00;SI;NO;b',
    'X-1;Avvio;O2;500;NO;NO;c'
  ].join('\n');
  const r = Import.importa(csv);

  assert.equal(r.formato, 'esteso');
  assert.deepEqual(r.progetti[0].ordini.map((o) => o.riferimento + ':' + o.importo), ['O1:1000', 'O2:500']);
  assert.equal(r.progetti[0].attivita.length, 3);
  assert.deepEqual(r.conflitti, []);
});

test('import esteso: lo stesso ordine con importi diversi è un conflitto', () => {
  const csv = [
    'Codice;Fase;Ordine Riferimento;Ordine Importo',
    'X-1;Avvio;O1;1000',
    'X-1;Avvio;O1;1500'
  ].join('\n');
  const r = Import.importa(csv);

  assert.equal(r.progetti[0].ordini.length, 1);
  assert.equal(r.progetti[0].ordini[0].importo, 1000);
  assert.deepEqual(r.conflitti, [{ codice: 'X-1', campo: 'ordine O1: importo', valori: ['1000', '1500'], tenuto: '1000' }]);
});

test('esporta: la colonna Team è facoltativa, informativa e ignorata dall\'import', () => {
  const originali = progettiDiProva();
  assert.ok(!Esporta.esporta(originali).split('\r\n')[0].includes('Team'), 'senza opzione non c\'è');

  const team = (p) => (p.codice === 'EVO-26-010' ? 'Team Energia' : 'Team Portali');
  const csv = Esporta.esporta(originali, { team });
  const righe = Csv.leggi(csv);
  const colonna = righe[0].indexOf('Team');
  assert.equal(colonna, Esporta.INTESTAZIONI.length, 'la colonna è l\'ultima');
  assert.equal(righe[1][colonna], 'Team Energia');
  assert.equal(righe[righe.length - 1][colonna], 'Team Portali');

  const r = Import.importa(csv);
  assert.deepEqual(r.progetti, originali);
  assert.deepEqual(r.avvisi, []);
});

test('import: il formato è riconosciuto dalle intestazioni', () => {
  assert.equal(Import.importa(fixture('legacy-semplice.csv')).formato, 'piatto');
  assert.equal(Import.importa('Codice;Ordine Riferimento\nX;O1\n').formato, 'esteso');
});
