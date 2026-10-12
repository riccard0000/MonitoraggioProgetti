'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { creaMemoria } = require('../../src/storage/memoria.js');
const { eseguiContratto, progetto } = require('./contratto.js');

eseguiContratto('memoria', async () => creaMemoria());

test('memoria: parte dai progetti iniziali', async () => {
  const a = creaMemoria({ progetti: [{ progetto: progetto('A-1'), rev: 3 }, { progetto: progetto('B-1') }] });
  const { progetti } = await a.elenca();
  assert.deepEqual(progetti.map((x) => [x.progetto.codice, x.rev]), [['A-1', 3], ['B-1', 1]]);
});

test('memoria: non ha copie di conflitto da risolvere', async () => {
  await assert.rejects(creaMemoria().risolviCopia('x.json', 'elimina'), /copie di conflitto/);
});
