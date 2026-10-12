'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { creaArchivio, apriArchivio } = require('../../src/storage/archivio.js');
const { creaMemoria } = require('../../src/storage/memoria.js');
const { creaDir, leggiPercorso, scriviPercorso, elencoPercorso } = require('../helpers/fsFinto.js');
const { eseguiContratto, progetto } = require('./contratto.js');

const OGGI = '2026-10-12';
const apri = (radice, opz) => apriArchivio(radice, Object.assign({ oggi: () => OGGI }, opz));

// Una cartella radice con le sottocartelle indicate (i team).
async function radiceCon(...team) {
  const radice = creaDir({ nome: 'Dati' });
  for (const nome of team) await radice.getDirectoryHandle(nome, { create: true });
  return radice;
}

const codici = (r) => r.progetti.map((v) => v.team + '/' + v.progetto.codice);
const rifiutata = (motivo) => (e) => e.name === 'SolaLettura' && e.motivo === motivo;

// Con un solo team l'archivio si comporta come una cartella singola: stesse prove di contratto.
eseguiContratto('archivio (un team in memoria)', async () => creaArchivio([{ nome: 'Team', adapter: creaMemoria() }]));
eseguiContratto('archivio (cartella singola)', async () => apri(creaDir()));

// ------------------------------------------------------------------- layout

test('layout: una cartella vuota è un team singolo nuovo, con il nome della cartella', async () => {
  const a = await apri(creaDir({ nome: 'Dati' }));
  assert.equal(a.multi, false);
  assert.equal(a.nome, 'Dati');
  assert.equal(a.nuova, true);
  assert.deepEqual(a.squadre().map((s) => [s.nome, s.nuova, s.scrivibile]), [['Dati', true, true]]);
});

test('layout: se contiene progetti/ è un team singolo, anche se ci sono altre sottocartelle', async () => {
  const radice = await radiceCon('backup', 'Altro');
  await radice.getDirectoryHandle('progetti', { create: true });
  const a = await apri(radice);
  assert.equal(a.multi, false);
  assert.equal(a.nuova, false);
});

test('layout: senza progetti/ ogni sottocartella è un team, anche vuota; si saltano . e _', async () => {
  const radice = await radiceCon('TeamB', 'TeamA', '.sync', '_vti');
  await scriviPercorso(radice, ['nota.txt'], 'file in radice: ignorato');
  const a = await apri(radice);

  assert.equal(a.multi, true);
  assert.deepEqual(a.squadre().map((s) => s.nome), ['TeamA', 'TeamB']);
  assert.ok(a.squadre().every((s) => s.nuova && s.scrivibile));
  assert.equal(a.nuova, true);
});

test('elenca: unisce i progetti dei team indicando il team, in ordine di codice', async () => {
  const radice = await radiceCon('TeamA', 'TeamB');
  const a = await apri(radice);
  await a.salva(progetto('B-2'), { team: 'TeamB' });
  await a.salva(progetto('A-1'), { team: 'TeamA' });
  await a.salva(progetto('A-3'), { team: 'TeamA' });

  const r = await apri(radice).then((x) => x.elenca());
  assert.deepEqual(codici(r), ['TeamA/A-1', 'TeamA/A-3', 'TeamB/B-2']);
  assert.deepEqual(r.squadre.map((s) => s.ok), [true, true]);
});

// -------------------------------------------------------------- instradamento

test('salva: scrive solo nella cartella del team indicato', async () => {
  const radice = await radiceCon('TeamA', 'TeamB');
  const a = await apri(radice);
  const esito = await a.salva(progetto('B-1'), { team: 'TeamB' });

  assert.equal(esito.team, 'TeamB');
  assert.equal(esito.rev, 1);
  assert.deepEqual(await elencoPercorso(radice, ['TeamB', 'progetti']), ['B-1.json']);
  assert.deepEqual(await elencoPercorso(radice, ['TeamA']), [], 'l\'altro team non cambia');
});

test('con più team il team è obbligatorio e deve esistere', async () => {
  const a = await apri(await radiceCon('TeamA', 'TeamB'));
  await assert.rejects(a.salva(progetto('X-1')), /Indica il team/);
  await assert.rejects(a.salva(progetto('X-1'), { team: 'Inesistente' }), /Team sconosciuto/);
  await assert.rejects(a.elimina('X-1', 1), /Indica il team/);
});

test('modificare ed eliminare restano dentro il team, con le revisioni di sempre', async () => {
  const a = await apri(await radiceCon('TeamA', 'TeamB'));
  await a.salva(progetto('A-1'), { team: 'TeamA' });
  await a.salva(progetto('A-1', { note: 'v2' }), { team: 'TeamA', revAtteso: 1 });
  await assert.rejects(a.salva(progetto('A-1', { note: 'v3' }), { team: 'TeamA', revAtteso: 1 }), (e) => e.motivo === 'rev-diversa');

  await a.elimina('A-1', 2, 'TeamA');
  assert.equal((await a.elenca()).progetti.length, 0);
});

test('backup e configurazione stanno dentro il team, mai nella cartella radice', async () => {
  const radice = await radiceCon('TeamA', 'TeamB');
  const a = await apri(radice);
  await a.salva(progetto('A-1'), { team: 'TeamA' });
  await a.salva(progetto('A-1', { note: 'v2' }), { team: 'TeamA', revAtteso: 1 });
  await a.salvaConfigurazione({ fteProgetto: 0.35, destinatariVpu: ['a@esempio.it'] }, 'TeamA');

  assert.deepEqual(await elencoPercorso(radice, []), ['TeamA', 'TeamB', ], 'nella radice solo le cartelle dei team');
  assert.deepEqual(await elencoPercorso(radice, ['TeamA']).then((x) => x.sort()), ['backup', 'config.json', 'progetti']);
  assert.deepEqual(await elencoPercorso(radice, ['TeamA', 'backup', OGGI]), ['A-1.json']);
  assert.deepEqual(await elencoPercorso(radice, ['TeamB']), [], 'l\'altro team non riceve nulla');
});

test('la configurazione è per team', async () => {
  const a = await apri(await radiceCon('TeamA', 'TeamB'));
  await a.salvaConfigurazione({ fteProgetto: 0.35 }, 'TeamA');
  await a.salvaConfigurazione({ fteProgetto: 0.1, destinatariVpu: ['b@esempio.it'] }, 'TeamB');

  const c = await a.configurazioni();
  assert.equal(c.TeamA.fteProgetto, 0.35);
  assert.equal(c.TeamB.fteProgetto, 0.1);
  assert.deepEqual(c.TeamB.destinatariVpu, ['b@esempio.it']);
  assert.equal((await a.leggiConfigurazione('TeamA')).fteProgetto, 0.35);
});

// ---------------------------------------------------------- sola consultazione

test('sola consultazione: nessuna scrittura per nessun team, la lettura resta', async () => {
  const a = await apri(await radiceCon('TeamA', 'TeamB'));
  await a.salva(progetto('A-1'), { team: 'TeamA' });
  a.impostaConsultazione(true);

  assert.equal(a.consultazione, true);
  await assert.rejects(a.salva(progetto('A-1', { note: 'x' }), { team: 'TeamA', revAtteso: 1 }), rifiutata('consultazione'));
  await assert.rejects(a.salva(progetto('B-1'), { team: 'TeamB' }), rifiutata('consultazione'));
  await assert.rejects(a.elimina('A-1', 1, 'TeamA'), rifiutata('consultazione'));
  await assert.rejects(a.salvaConfigurazione({ fteProgetto: 0.5 }, 'TeamA'), rifiutata('consultazione'));
  await assert.rejects(a.risolviCopia('x.json', 'elimina', 'TeamA'), rifiutata('consultazione'));

  const r = await a.elenca();
  assert.deepEqual(codici(r), ['TeamA/A-1'], 'i dati non sono cambiati');
  assert.ok(r.squadre.every((s) => s.soloLettura && !s.scrivibile && s.motivo === 'consultazione'));

  a.impostaConsultazione(false);
  assert.equal((await a.salva(progetto('B-1'), { team: 'TeamB' })).rev, 1, 'tornando in modifica si può scrivere');
});

test('la sola consultazione si può impostare già all\'apertura', async () => {
  const a = await apri(await radiceCon('TeamA'), { consultazione: true });
  await assert.rejects(a.salva(progetto('A-1'), { team: 'TeamA' }), rifiutata('consultazione'));
});

// ------------------------------------------------------ sola lettura automatica

test('se la cartella rifiuta la scrittura, quel team passa in sola lettura e gli altri no', async () => {
  const radice = await radiceCon('TeamA', 'TeamB');
  const a = await apri(radice);
  await a.salva(progetto('A-1'), { team: 'TeamA' });

  const dirA = await radice.getDirectoryHandle('TeamA');
  dirA.condizioni.negaScrittura = 'NotAllowedError'; // come per un permesso di sola lettura

  await assert.rejects(a.salva(progetto('A-1', { note: 'x' }), { team: 'TeamA', revAtteso: 1 }), rifiutata('scrittura-rifiutata'));
  const stati = Object.fromEntries(a.squadre().map((s) => [s.nome, s]));
  assert.equal(stati.TeamA.soloLettura, true);
  assert.equal(stati.TeamA.motivo, 'scrittura-rifiutata');
  assert.equal(stati.TeamB.scrivibile, true);

  // Da quel momento il team è rifiutato subito, senza riprovare sul disco.
  dirA.condizioni.negaScrittura = null;
  await assert.rejects(a.salva(progetto('A-2'), { team: 'TeamA' }), rifiutata('scrittura-rifiutata'));
  assert.equal((await a.salva(progetto('B-1'), { team: 'TeamB' })).rev, 1);
  assert.deepEqual(codici(await a.elenca()), ['TeamA/A-1', 'TeamB/B-1'], 'la lettura funziona');
});

test('un permesso scaduto non è sola lettura: l\'errore arriva così com\'è e il team resta scrivibile', async () => {
  const radice = await radiceCon('TeamA');
  const a = await apri(radice);
  const dirA = await radice.getDirectoryHandle('TeamA');
  dirA.condizioni.negaScrittura = 'NotAllowedError';
  dirA.condizioni.permesso = 'prompt';

  await assert.rejects(a.salva(progetto('A-1'), { team: 'TeamA' }), (e) => e.name === 'NotAllowedError');
  assert.equal(a.squadre()[0].scrivibile, true);
});

// ---------------------------------------------------------- team non accessibili

test('un team non accessibile è segnalato e non blocca gli altri', async () => {
  const radice = await radiceCon('TeamA', 'TeamB');
  const prima = await apri(radice);
  await prima.salva(progetto('A-1'), { team: 'TeamA' });

  const dirB = await radice.getDirectoryHandle('TeamB');
  dirB.condizioni.negaLettura = 'NotAllowedError';
  const a = await apri(radice);

  const r = await a.elenca();
  assert.deepEqual(codici(r), ['TeamA/A-1']);
  assert.equal(r.errori.length, 1);
  assert.equal(r.errori[0].team, 'TeamB');
  assert.match(r.errori[0].messaggio, /non accessibile/);
  assert.deepEqual(r.squadre.map((s) => [s.nome, s.ok]), [['TeamA', true], ['TeamB', false]]);
  await assert.rejects(a.salva(progetto('B-1'), { team: 'TeamB' }), /non è accessibile/);
  assert.equal((await a.salva(progetto('A-2'), { team: 'TeamA' })).rev, 1);
});

test('un team che smette di rispondere ricompare appena torna leggibile', async () => {
  const radice = await radiceCon('TeamA');
  const a = await apri(radice);
  await a.salva(progetto('A-1'), { team: 'TeamA' });
  const dirA = await radice.getDirectoryHandle('TeamA');

  dirA.condizioni.negaLettura = 'NotAllowedError';
  assert.equal((await a.elenca()).squadre[0].ok, false);
  dirA.condizioni.negaLettura = null;
  const r = await a.elenca();
  assert.equal(r.squadre[0].ok, true);
  assert.deepEqual(codici(r), ['TeamA/A-1']);
});

// ----------------------------------------------------- team che compaiono o spariscono

test('un team nuovo, creato nella cartella radice, compare al primo aggiornamento', async () => {
  const radice = await radiceCon('TeamA', 'TeamB');
  const a = await apri(radice);
  assert.deepEqual((await a.elenca()).squadre.map((s) => s.nome), ['TeamA', 'TeamB']);

  await radice.getDirectoryHandle('TeamC', { create: true });
  const r = await a.elenca();
  assert.deepEqual(r.squadre.map((s) => s.nome), ['TeamA', 'TeamB', 'TeamC']);
  assert.equal((await a.salva(progetto('C-1'), { team: 'TeamC' })).team, 'TeamC');
});

test('un team che non è più nella cartella (permesso tolto) sparisce', async () => {
  const radice = await radiceCon('TeamA', 'TeamB');
  const a = await apri(radice);
  await a.salva(progetto('B-1'), { team: 'TeamB' });
  await radice.removeEntry('TeamB', { recursive: true });

  const r = await a.elenca();
  assert.deepEqual(r.squadre.map((s) => s.nome), ['TeamA']);
  assert.deepEqual(r.progetti, []);
});

test('l\'apertura di un team fallita viene riprovata all\'aggiornamento', async () => {
  const radice = await radiceCon('TeamA', 'TeamB');
  const dirB = await radice.getDirectoryHandle('TeamB');
  dirB.condizioni.negaLettura = 'NotAllowedError';
  const a = await apri(radice);
  assert.equal(a.squadre().find((s) => s.nome === 'TeamB').ok, false);

  dirB.condizioni.negaLettura = null;
  const r = await a.elenca();
  assert.deepEqual(r.squadre.map((s) => [s.nome, s.ok]), [['TeamA', true], ['TeamB', true]]);
  assert.equal((await a.salva(progetto('B-1'), { team: 'TeamB' })).rev, 1);
});

// ------------------------------------------------------------ archivio in memoria

test('un archivio in memoria con più team funziona come uno su cartella', async () => {
  const a = creaArchivio([
    { nome: 'Energia', adapter: creaMemoria({ progetti: [{ progetto: progetto('E-1') }] }) },
    { nome: 'Portali', adapter: creaMemoria({ progetti: [{ progetto: progetto('P-1') }], config: { fteProgetto: 0.4 } }), soloLettura: true }
  ]);
  assert.equal(a.multi, true);
  assert.deepEqual(codici(await a.elenca()), ['Energia/E-1', 'Portali/P-1']);
  assert.equal((await a.configurazioni()).Portali.fteProgetto, 0.4);
  await assert.rejects(a.salva(progetto('P-2'), { team: 'Portali' }), rifiutata('impostata'));
  assert.equal((await a.salva(progetto('E-2'), { team: 'Energia' })).team, 'Energia');
});
