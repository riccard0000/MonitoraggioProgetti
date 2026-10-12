'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Elenco = require('../../src/domain/elenco.js');
const Modello = require('../../src/domain/modello.js');

const p = (parziale) => Modello.creaProgetto(parziale);

const archivio = () => [
  p({ codice: 'EVO-26-10', applicativo: 'SITO ACME', projectManager: 'Neri', fase: 'Sviluppo', inizio: '2026-03-01',
      descrizione: 'Accessibilità portali', ordini: [{ riferimento: 'Prova 2', importo: 1000, offerta: 'SI', vpu: 'NO' }] }),
  p({ codice: 'EVO-26-2', applicativo: 'SERVIZIO TERMICO', projectManager: 'Verdi', fase: 'Esercizio', inizio: '2025-02-19',
      descrizione: 'Servizio termico 3.0', note: 'urgente',
      ordini: [{ riferimento: 'Prova 1', importo: 10000, offerta: 'SI', vpu: 'SI' }, { riferimento: 'Prova 1 bis', importo: 500, offerta: 'NO', vpu: 'NO' }],
      attivita: [{ descrizione: 'Rilascio intranet', stato: 'Completata' }] }),
  p({ codice: 'EVO-26-3', applicativo: 'PROGRAMMA P', projectManager: 'Neri', fase: 'Ideazione' })
];

const codici = (lista) => lista.map((x) => x.codice);

test('filtra: la ricerca trova testo in progetto, ordini e attività', () => {
  const a = archivio();
  assert.deepEqual(codici(Elenco.filtra(a, { testo: 'neri' })), ['EVO-26-10', 'EVO-26-3']);
  assert.deepEqual(codici(Elenco.filtra(a, { testo: 'intranet' })), ['EVO-26-2']);
  assert.deepEqual(codici(Elenco.filtra(a, { testo: 'URGENTE' })), ['EVO-26-2']);
});

test('filtra: più parole devono comparire tutte, in qualunque ordine', () => {
  const a = archivio();
  assert.deepEqual(codici(Elenco.filtra(a, { testo: 'termico verdi' })), ['EVO-26-2']);
  assert.deepEqual(codici(Elenco.filtra(a, { testo: 'verdi neri' })), []);
});

test('filtra: una frase tra virgolette si cerca così com\'è', () => {
  const a = archivio();
  // Senza virgolette "prova" e "1" valgono come parole separate e "1" compare anche in EVO-26-10.
  assert.deepEqual(codici(Elenco.filtra(a, { testo: 'prova 1' })), ['EVO-26-10', 'EVO-26-2']);
  assert.deepEqual(codici(Elenco.filtra(a, { testo: '"prova 1"' })), ['EVO-26-2']);
  assert.deepEqual(codici(Elenco.filtra(a, { testo: 'neri "prova 2"' })), ['EVO-26-10']);
  assert.equal(Elenco.filtra(a, { testo: '""' }).length, 3, 'virgolette vuote: nessun filtro');
});

test('filtra: si cerca anche per costo, in entrambe le forme', () => {
  const a = archivio();
  assert.deepEqual(codici(Elenco.filtra(a, { testo: '10500' })), ['EVO-26-2']);
  assert.deepEqual(codici(Elenco.filtra(a, { testo: '10.500,00' })), ['EVO-26-2']);
});

test('filtra: le fasi selezionate restringono, nessuna fase vale tutte', () => {
  const a = archivio();
  assert.equal(Elenco.filtra(a, { fasi: [] }).length, 3);
  assert.equal(Elenco.filtra(a, {}).length, 3);
  assert.deepEqual(codici(Elenco.filtra(a, { fasi: ['Esercizio', 'Ideazione'] })), ['EVO-26-2', 'EVO-26-3']);
  assert.deepEqual(codici(Elenco.filtra(a, { fasi: ['Esercizio'], testo: 'neri' })), []);
});

test('ordina: i codici con numeri si ordinano in modo naturale e la direzione si inverte', () => {
  const a = archivio();
  assert.deepEqual(codici(Elenco.ordina(a, 'codice', 1)), ['EVO-26-2', 'EVO-26-3', 'EVO-26-10']);
  assert.deepEqual(codici(Elenco.ordina(a, 'codice', -1)), ['EVO-26-10', 'EVO-26-3', 'EVO-26-2']);
});

test('ordina: costo numerico, fase nell\'ordine del ciclo di vita, periodo per data', () => {
  const a = archivio();
  assert.deepEqual(codici(Elenco.ordina(a, 'costo', 1)), ['EVO-26-3', 'EVO-26-10', 'EVO-26-2']);
  assert.deepEqual(codici(Elenco.ordina(a, 'fase', 1)), ['EVO-26-3', 'EVO-26-10', 'EVO-26-2']);
  assert.deepEqual(codici(Elenco.ordina(a, 'periodo', 1)), ['EVO-26-3', 'EVO-26-2', 'EVO-26-10']);
});

test('ordina: non modifica l\'elenco di partenza e senza campo lo lascia com\'è', () => {
  const a = archivio();
  const prima = codici(a);
  Elenco.ordina(a, 'costo', -1);
  assert.deepEqual(codici(a), prima);
  assert.deepEqual(codici(Elenco.ordina(a, null)), prima);
});

test('sintesiOrdini: SI, NO, PARZIALE o trattino se non ci sono ordini', () => {
  const [sito, conto, pnrr] = archivio();
  assert.equal(Elenco.sintesiOrdini(sito, 'offerta'), 'SI');
  assert.equal(Elenco.sintesiOrdini(sito, 'vpu'), 'NO');
  assert.equal(Elenco.sintesiOrdini(conto, 'vpu'), 'PARZIALE');
  assert.equal(Elenco.sintesiOrdini(pnrr, 'vpu'), '-');
});

test('conteggi e totali per fase', () => {
  const a = archivio();
  const conteggi = Elenco.conteggiPerFase(a);
  assert.deepEqual(Object.keys(conteggi), Modello.FASI);
  assert.equal(conteggi.Esercizio, 1);
  assert.equal(conteggi.Collaudo, 0);

  const costi = Elenco.costiPerFase(a);
  assert.equal(costi.Esercizio, 10500);
  assert.equal(costi.Sviluppo, 1000);
  assert.equal(costi.Ideazione, 0);

  assert.deepEqual(Elenco.totali(a), { progetti: 3, ordini: 3, attivita: 1, costo: 11500 });
});
