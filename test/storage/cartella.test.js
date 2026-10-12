'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { creaCartella, nomeFile } = require('../../src/storage/cartella.js');
const { creaDir, leggiPercorso, scriviPercorso, elencoPercorso } = require('../helpers/fsFinto.js');
const { eseguiContratto, progetto } = require('./contratto.js');

const OGGI = '2026-10-12';
const apri = async (radice) => creaCartella(radice || creaDir(), { oggi: () => OGGI });

// Stesse prove di contratto della memoria, qui contro file veri (finti) in una cartella.
eseguiContratto('cartella', async () => apri());

// ------------------------------------------------------------- nomi dei file

test('nomeFile: maiuscolo, caratteri non sicuri codificati', () => {
  assert.equal(nomeFile('EVO-26-001'), 'EVO-26-001.json');
  assert.equal(nomeFile('  evo-26-001 '), 'EVO-26-001.json');
  assert.equal(nomeFile('A/B:C'), 'A%2FB%3AC.json');
  assert.equal(nomeFile('EVO.26'), 'EVO%2E26.json');
  assert.equal(nomeFile('à'), '%C3%80.json');
  assert.equal(nomeFile('a b'), 'A%20B.json');
});

// ------------------------------------------------------------------- layout

test('cartella: una cartella senza progetti è nuova e si inizializza al primo salvataggio', async () => {
  const radice = creaDir({ nome: 'Dati condivisi' });
  const a = await apri(radice);

  assert.equal(a.tipo, 'cartella');
  assert.equal(a.nome, 'Dati condivisi');
  assert.equal(a.nuova, true);
  assert.equal(radice.voci.size, 0, 'aprire non scrive nulla');

  await a.salva(progetto('EVO-26-001'));
  assert.equal(a.nuova, false);
  assert.deepEqual(await elencoPercorso(radice, ['progetti']), ['EVO-26-001.json']);
});

test('cartella: il file contiene schema, revisione e progetto', async () => {
  const radice = creaDir();
  const a = await apri(radice);
  const p = progetto('EVO-26-001');
  await a.salva(p);

  const dati = JSON.parse(await leggiPercorso(radice, ['progetti', 'EVO-26-001.json']));
  assert.equal(dati.schemaVersion, 1);
  assert.equal(dati.rev, 1);
  assert.deepEqual(dati.progetto, p);
});

test('cartella: una cartella già usata non è nuova', async () => {
  const radice = creaDir();
  await (await apri(radice)).salva(progetto('A-1'));
  assert.equal((await apri(radice)).nuova, false);
});

test('cartella: due codici che differiscono solo per le maiuscole sono lo stesso file', async () => {
  const radice = creaDir();
  const a = await apri(radice);
  await a.salva(progetto('evo-1'));
  await assert.rejects(a.salva(progetto('EVO-1')), (e) => e.motivo === 'codice-esistente');
  assert.deepEqual(await elencoPercorso(radice, ['progetti']), ['EVO-1.json']);
});

// ------------------------------------------------------------------- backup

test('cartella: la prima modifica del giorno conserva la versione di partenza', async () => {
  const radice = creaDir();
  const a = await apri(radice);
  await a.salva(progetto('A-1', { note: 'v1' }));
  await a.salva(progetto('A-1', { note: 'v2' }), { revAtteso: 1 });
  await a.salva(progetto('A-1', { note: 'v3' }), { revAtteso: 2 });

  assert.deepEqual(await elencoPercorso(radice, ['backup']), [OGGI]);
  const copia = JSON.parse(await leggiPercorso(radice, ['backup', OGGI, 'A-1.json']));
  assert.equal(copia.progetto.note, 'v1', 'una sola copia al giorno: quella di inizio giornata');
  assert.equal(copia.rev, 1);
});

test('cartella: un nuovo giorno, un nuovo backup', async () => {
  const radice = creaDir();
  let giorno = '2026-10-12';
  const a = await creaCartella(radice, { oggi: () => giorno });
  await a.salva(progetto('A-1', { note: 'v1' }));
  await a.salva(progetto('A-1', { note: 'v2' }), { revAtteso: 1 });
  giorno = '2026-10-13';
  await a.salva(progetto('A-1', { note: 'v3' }), { revAtteso: 2 });

  assert.deepEqual(await elencoPercorso(radice, ['backup']), ['2026-10-12', '2026-10-13']);
  assert.equal(JSON.parse(await leggiPercorso(radice, ['backup', '2026-10-13', 'A-1.json'])).progetto.note, 'v2');
});

test('cartella: eliminare conserva l\'ultima versione nel backup', async () => {
  const radice = creaDir();
  const a = await apri(radice);
  await a.salva(progetto('A-1', { note: 'ultima' }));
  await a.elimina('A-1', 1);

  assert.deepEqual(await elencoPercorso(radice, ['progetti']), []);
  const copia = JSON.parse(await leggiPercorso(radice, ['backup', OGGI, 'A-1.eliminato.json']));
  assert.equal(copia.progetto.note, 'ultima');
});

test('cartella: cambiare il codice sposta il file e salva anche la versione precedente', async () => {
  const radice = creaDir();
  const a = await apri(radice);
  await a.salva(progetto('A-1'));
  await a.salva(progetto('A-2'), { revAtteso: 1, codicePrecedente: 'A-1' });

  assert.deepEqual(await elencoPercorso(radice, ['progetti']), ['A-2.json']);
  assert.deepEqual(await elencoPercorso(radice, ['backup', OGGI]), ['A-1.json']);
});

// ------------------------------------------------------- file non leggibili

test('cartella: un file rovinato è segnalato e gli altri progetti si caricano', async () => {
  const radice = creaDir();
  const a = await apri(radice);
  await a.salva(progetto('A-1'));
  await scriviPercorso(radice, ['progetti', 'ROVINATO.json'], '{ non è json');
  await scriviPercorso(radice, ['progetti', 'FUTURO.json'], JSON.stringify({ schemaVersion: 99, rev: 1, progetto: { codice: 'F' } }));
  await scriviPercorso(radice, ['progetti', 'note.txt'], 'ignorato');

  const r = await a.elenca();
  assert.deepEqual(r.progetti.map((x) => x.progetto.codice), ['A-1']);
  assert.deepEqual(r.errori.map((e) => e.file), ['FUTURO.json', 'ROVINATO.json']);
  assert.match(r.errori[0].messaggio, /versione più recente/);
});

test('cartella: non si salva sopra un file illeggibile', async () => {
  const radice = creaDir();
  const a = await apri(radice);
  await scriviPercorso(radice, ['progetti', 'A-1.json'], '{ non è json');

  await assert.rejects(a.salva(progetto('A-1'), { revAtteso: 1 }), /non è leggibile.*backup/s);
  assert.equal(await leggiPercorso(radice, ['progetti', 'A-1.json']), '{ non è json', 'il file non è stato toccato');
});

test('cartella: la configurazione di una versione più recente non viene riscritta', async () => {
  const radice = creaDir();
  const a = await apri(radice);
  await scriviPercorso(radice, ['config.json'], JSON.stringify({ schemaVersion: 99 }));
  await assert.rejects(a.leggiConfigurazione(), /versione più recente/);
});

// ------------------------------------------------------ copie di conflitto

// Simula quello che fa OneDrive: accanto al file compare una copia con il nome del PC.
async function creaConflitto(radice, a) {
  await a.salva(progetto('EVO-26-001', { note: 'versione originale' }));
  const originale = JSON.parse(await leggiPercorso(radice, ['progetti', 'EVO-26-001.json']));
  const copia = { ...originale, progetto: { ...originale.progetto, note: 'versione del collega' } };
  await scriviPercorso(radice, ['progetti', 'EVO-26-001-PC-COLLEGA.json'], JSON.stringify(copia));
}

test('cartella: le copie di conflitto di OneDrive non sono progetti ma vengono segnalate', async () => {
  const radice = creaDir();
  const a = await apri(radice);
  await creaConflitto(radice, a);

  const r = await a.elenca();
  assert.equal(r.progetti.length, 1);
  assert.equal(r.progetti[0].progetto.note, 'versione originale');
  assert.equal(r.copieConflitto.length, 1);
  assert.equal(r.copieConflitto[0].file, 'EVO-26-001-PC-COLLEGA.json');
  assert.equal(r.copieConflitto[0].codice, 'EVO-26-001');
  assert.equal(r.copieConflitto[0].progetto.note, 'versione del collega');
});

test('cartella: risolvere con «elimina» tiene l\'originale e archivia la copia', async () => {
  const radice = creaDir();
  const a = await apri(radice);
  await creaConflitto(radice, a);
  await a.risolviCopia('EVO-26-001-PC-COLLEGA.json', 'elimina');

  const r = await a.elenca();
  assert.deepEqual(r.copieConflitto, []);
  assert.equal(r.progetti[0].progetto.note, 'versione originale');
  assert.equal(r.progetti[0].rev, 1);
  assert.deepEqual(await elencoPercorso(radice, ['backup', OGGI]), ['EVO-26-001-PC-COLLEGA.copia.json']);
});

test('cartella: risolvere con «usa» promuove la copia e archivia l\'originale', async () => {
  const radice = creaDir();
  const a = await apri(radice);
  await creaConflitto(radice, a);
  await a.risolviCopia('EVO-26-001-PC-COLLEGA.json', 'usa');

  const r = await a.elenca();
  assert.deepEqual(r.copieConflitto, []);
  assert.equal(r.progetti[0].progetto.note, 'versione del collega');
  assert.equal(r.progetti[0].rev, 2);
  const archiviato = JSON.parse(await leggiPercorso(radice, ['backup', OGGI, 'EVO-26-001.json']));
  assert.equal(archiviato.progetto.note, 'versione originale');
});

test('cartella: risolvere una copia già sparita non è un errore; una scelta sbagliata sì', async () => {
  const a = await apri();
  await a.risolviCopia('non-esiste.json', 'elimina');
  await assert.rejects(a.risolviCopia('x.json', 'boh'), /Scelta non valida/);
});

// -------------------------------------------------------------- prestazioni

test('cartella: carica molti progetti, anche con poca concorrenza', async () => {
  const radice = creaDir();
  const a = await creaCartella(radice, { oggi: () => OGGI, concorrenza: 3 });
  for (let i = 1; i <= 40; i++) await a.salva(progetto('P-' + String(i).padStart(3, '0')));

  const r = await a.elenca();
  assert.equal(r.progetti.length, 40);
  assert.equal(r.progetti[0].progetto.codice, 'P-001');
  assert.equal(r.progetti[39].progetto.codice, 'P-040');
});
