'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Import = require('../../src/domain/importCsv.js');
const Modello = require('../../src/domain/modello.js');

const fixture = (nome) => fs.readFileSync(path.join(__dirname, '..', 'fixtures', nome), 'utf8');
const costoTotale = (progetti) => progetti.reduce((t, p) => t + Modello.costoProgetto(p), 0);

// ------------------------------------------------------------ file di esempio

test('import: CSV semplice con date ISO e costi con la virgola', () => {
  const r = Import.importa(fixture('legacy-semplice.csv'));

  assert.deepEqual(r.progetti.map((p) => p.codice), ['EET-24-001', 'EET-24-002']);
  assert.deepEqual(r.conflitti, []);
  assert.deepEqual(r.avvisi, []);
  assert.deepEqual(r.errori, []);

  const [a, b] = r.progetti;
  assert.equal(a.inizio, '2024-04-19');
  assert.equal(a.fine, '2024-10-21');
  assert.equal(a.fase, 'Esercizio');
  assert.equal(a.promemoria, 'SI');
  assert.deepEqual(a.ordini, [{ riferimento: 'Fornitore 1234/L1', importo: 2000.9, offerta: 'SI', vpu: 'SI' }]);
  assert.equal(b.ordini[0].importo, 10000.25);
  assert.equal(a.attivita.length, 0);
  assert.equal(Math.round(costoTotale(r.progetti) * 100), 1200115);
});

test('import: una riga per attività diventa un solo progetto con più attività', () => {
  const r = Import.importa(fixture('legacy-conflitto-codice.csv'));
  assert.equal(r.righe, 8);
  assert.deepEqual(r.progetti.map((p) => p.codice), ['EVO-26-001', 'EVO-26-002', 'EVO-26-003']);

  const p1 = r.progetti[0];
  assert.equal(p1.inizio, '2025-02-19', 'date gg/mm/aaaa convertite');
  assert.equal(p1.fine, '2026-04-21');
  assert.deepEqual(p1.ordini, [{ riferimento: 'Prova 1', importo: 10000, offerta: 'SI', vpu: 'SI' }]);
  assert.equal(p1.attivita.length, 4);
  assert.deepEqual(p1.attivita[0], {
    descrizione: 'Rilascio in esercizio Parte 1', inizio: '2026-02-02', fine: '2026-02-02',
    stato: 'Completata', note: ''
  });
  assert.equal(p1.attivita[2].descrizione, 'Rilascio in Esercizio CR', 'spazi ai bordi tolti');
  assert.equal(p1.attivita[2].note, 'Note progetto');

  const p2 = r.progetti[1];
  assert.match(p2.note, /^Dichiarazione di accessibilità/);
  assert.equal(p2.ordini[0].importo, 1000);
  assert.equal(p2.attivita.length, 0);
});

test('import: EVO-26-003 con tre riferimenti ordine diversi è un conflitto segnalato, non perso in silenzio', () => {
  const r = Import.importa(fixture('legacy-conflitto-codice.csv'));
  const p3 = r.progetti[2];

  assert.equal(p3.attivita.length, 3);
  assert.deepEqual(p3.attivita.map((a) => a.descrizione), ['Richiesta VPU', 'Esercizio nascosto', 'Apertura Portale']);
  assert.equal(p3.ordini.length, 1, 'un solo ordine: il costo ripetuto non crea ordini né si somma');
  assert.deepEqual(p3.ordini[0], { riferimento: 'Prova 3', importo: 2000, offerta: 'SI', vpu: 'SI' });

  assert.deepEqual(r.conflitti, [{
    codice: 'EVO-26-003', campo: 'riferimento', valori: ['Prova 3', 'Prova 4', 'Prova 5'], tenuto: 'Prova 3'
  }]);
  assert.deepEqual(r.errori, []);
  assert.equal(costoTotale(r.progetti), 13000);
});

// ------------------------------------------------------------ casi particolari

test('import: file vuoto o senza colonna Codice', () => {
  assert.deepEqual(Import.importa('').progetti, []);
  assert.match(Import.importa('').avvisi[0].messaggio, /vuoto/);

  const r = Import.importa('Fase;Note\nAvvio;x\n');
  assert.deepEqual(r.progetti, []);
  assert.match(r.avvisi[0].messaggio, /Manca la colonna Codice/);
});

test('import: le righe senza codice si ignorano con un avviso', () => {
  const r = Import.importa('Codice;Fase\n;Avvio\nX-1;Avvio\n');
  assert.equal(r.progetti.length, 1);
  assert.deepEqual(r.avvisi, [{ riga: 2, messaggio: 'Riga senza codice: ignorata' }]);
});

test('import: fase mancante o sconosciuta diventa Ideazione con un avviso', () => {
  const r = Import.importa('Codice;Fase\nX-1;Boh\nX-2;\nX-3;avvio\n');
  assert.deepEqual(r.progetti.map((p) => p.fase), ['Ideazione', 'Ideazione', 'Avvio']);
  assert.equal(r.avvisi.length, 2);
  assert.match(r.avvisi[0].messaggio, /non riconosciuta «Boh»/);
  assert.match(r.avvisi[1].messaggio, /mancante/);
});

test('import: codici che differiscono per maiuscole e spazi sono lo stesso progetto', () => {
  const r = Import.importa('Codice;Fase;Attività Descrizione\nevo-1 ;Avvio;A\nEVO-1;Avvio;B\n');
  assert.equal(r.progetti.length, 1);
  assert.equal(r.progetti[0].codice, 'evo-1');
  assert.equal(r.progetti[0].attivita.length, 2);
  assert.deepEqual(r.conflitti, []);
});

test('import: un valore vuoto non è un conflitto, vale il primo non vuoto', () => {
  const r = Import.importa('Codice;Note;Attività Descrizione\nX;;a\nX;nota;b\n');
  assert.equal(r.progetti[0].note, 'nota');
  assert.deepEqual(r.conflitti, []);
});

test('import: costi ambigui o non validi generano un avviso', () => {
  const r = Import.importa('Codice;Fase;Riferimento Ordine;Costo\nX;Avvio;O1;1.000\nY;Avvio;O2;abc\nZ;Avvio;O3;2000.9\n');
  assert.equal(r.progetti[0].ordini[0].importo, 1000);
  assert.match(r.avvisi[0].messaggio, /ambiguo/);
  assert.equal(r.progetti[1].ordini[0].importo, 0);
  assert.match(r.avvisi[1].messaggio, /non valido/);
  assert.equal(r.progetti[2].ordini[0].importo, 2000.9, 'il punto decimale non moltiplica l\'importo');
  assert.equal(r.avvisi.length, 2);
});

test('import: offerta o VPU a SI senza ordine vengono segnalati e scartati', () => {
  const r = Import.importa('Codice;Fase;VPU\nX;Avvio;SI\n');
  assert.deepEqual(r.progetti[0].ordini, []);
  assert.match(r.avvisi[0].messaggio, /senza riferimento ordine/);
});

test('import: date non valide diventano vuote con un avviso', () => {
  const r = Import.importa('Codice;Fase;Periodo Inizio;Periodo Fine\nX;Avvio;31/02/2026;01/03/2026\n');
  assert.equal(r.progetti[0].inizio, '');
  assert.equal(r.progetti[0].fine, '2026-03-01');
  assert.match(r.avvisi[0].messaggio, /Periodo Inizio non valida/);
});

test('import: gli errori del modello sono riportati con il codice', () => {
  const r = Import.importa('Codice;Periodo Inizio;Periodo Fine\nX;10/05/2026;01/05/2026\n');
  assert.deepEqual(r.errori, [{ codice: 'X', percorso: 'fine', messaggio: 'La data di fine precede quella di inizio' }]);
});

// ------------------------------------------------------- anteprima e applicazione

test('anteprima: nuovi, invariati e aggiornati', () => {
  const semplice = Import.importa(fixture('legacy-semplice.csv')).progetti;
  const conflitto = Import.importa(fixture('legacy-conflitto-codice.csv')).progetti;

  assert.deepEqual(Import.anteprima(semplice, conflitto), {
    nuovi: ['EVO-26-001', 'EVO-26-002', 'EVO-26-003'], aggiornati: [], invariati: []
  });
  assert.deepEqual(Import.anteprima(conflitto, conflitto).invariati, ['EVO-26-001', 'EVO-26-002', 'EVO-26-003']);

  const modificato = structuredClone(conflitto);
  modificato[0].ordini[0].vpu = 'NO';
  const a = Import.anteprima(conflitto, modificato);
  assert.deepEqual(a.aggiornati, [{ codice: 'EVO-26-001', differenze: ['ordini'] }]);
  assert.equal(a.invariati.length, 2);
});

test('applica: aggiorna per codice, aggiunge i nuovi, non tocca gli altri né l\'originale', () => {
  const semplice = Import.importa(fixture('legacy-semplice.csv')).progetti;
  const conflitto = Import.importa(fixture('legacy-conflitto-codice.csv')).progetti;

  const unione = Import.applica(semplice, conflitto);
  assert.deepEqual(unione.map((p) => p.codice), ['EET-24-001', 'EET-24-002', 'EVO-26-001', 'EVO-26-002', 'EVO-26-003']);
  assert.equal(semplice.length, 2, 'l\'elenco di partenza non cambia');
  assert.equal(unione[0], semplice[0], 'un progetto assente dal file resta lo stesso oggetto');

  // Il file è la versione di riferimento dei progetti che contiene: li sostituisce tutti.
  const modificato = structuredClone(conflitto);
  modificato[0].ordini[0].vpu = 'NO';
  const aggiornato = Import.applica(conflitto, modificato);
  assert.equal(aggiornato.length, 3);
  assert.equal(aggiornato[0].ordini[0].vpu, 'NO');
  assert.equal(conflitto[0].ordini[0].vpu, 'SI', 'l\'elenco di partenza non cambia');
  assert.deepEqual(aggiornato[1], conflitto[1]);
});
