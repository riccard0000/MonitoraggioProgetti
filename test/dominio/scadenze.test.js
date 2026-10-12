'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Scadenze = require('../../src/domain/scadenze.js');
const Modello = require('../../src/domain/modello.js');

const OGGI = '2026-10-12';
const attivita = (descrizione, stato, inizio, fine, note) => ({ descrizione, stato, inizio: inizio || '', fine: fine || '', note: note || '' });

const archivio = () => [
  Modello.creaProgetto({ codice: 'B-1', applicativo: 'APP B', descrizione: 'Progetto B', attivita: [
    attivita('scaduta', 'In corso', '2026-09-01', '2026-10-01'),
    attivita('da avviare', 'Da avviare', '2026-10-20', '2026-11-20'),
    attivita('chiusa', 'Completata', '2026-01-01', '2026-01-31'),
    attivita('ferma', 'Sospesa', '2026-01-01', '2026-01-31')
  ] }),
  Modello.creaProgetto({ codice: 'A-1', applicativo: 'APP A', descrizione: 'Progetto A', attivita: [
    attivita('in corso', 'In corso', '2026-09-01', '2026-10-30', 'una nota'),
    attivita('in corso senza fine', 'In corso', '2026-09-01', ''),
    attivita('da avviare ma già scaduta', 'Da avviare', '2026-08-01', '2026-09-30'),
    attivita('oggi è l\'ultimo giorno', 'In corso', '2026-10-01', OGGI)
  ] })
];

test('classifica: solo attività in corso o da avviare, con tag e giorni', () => {
  const r = Scadenze.classifica(archivio(), OGGI);
  const per = (nome) => r.find((x) => x.attivita === nome);

  assert.equal(r.length, 6, 'le completate e le sospese non compaiono');
  assert.deepEqual([per('scaduta').tag, per('scaduta').giorni], ['SCADUTA', 11]);
  assert.deepEqual([per('da avviare').tag, per('da avviare').giorni], ['DA AVVIARE', 8]);
  assert.deepEqual([per('in corso').tag, per('in corso').giorni], ['IN CORSO', 18]);
  assert.deepEqual([per('in corso senza fine').tag, per('in corso senza fine').giorni], ['IN CORSO', null]);
});

test('classifica: la scadenza ha la precedenza sull\'inizio e l\'ultimo giorno non è scaduto', () => {
  const r = Scadenze.classifica(archivio(), OGGI);
  const per = (nome) => r.find((x) => x.attivita === nome);
  assert.equal(per('da avviare ma già scaduta').tag, 'SCADUTA');
  assert.equal(per('oggi è l\'ultimo giorno').tag, 'IN CORSO');
  assert.equal(per('oggi è l\'ultimo giorno').giorni, 0);
});

test('classifica: ordine scadute, in corso, da avviare; dentro il gruppo per data', () => {
  const r = Scadenze.classifica(archivio(), OGGI);
  assert.deepEqual(r.map((x) => x.attivita), [
    'da avviare ma già scaduta',    // scaduta il 30/09
    'scaduta',                      // scaduta l'01/10
    'oggi è l\'ultimo giorno',      // in corso, fine oggi
    'in corso',                     // in corso, fine 30/10
    'in corso senza fine',          // in corso, senza data: in fondo al gruppo
    'da avviare'
  ]);
});

test('classifica: riporta i dati del progetto e le note', () => {
  const r = Scadenze.classifica(archivio(), OGGI);
  const riga = r.find((x) => x.attivita === 'in corso');
  assert.equal(riga.codice, 'A-1');
  assert.equal(riga.applicativo, 'APP A');
  assert.equal(riga.progetto, 'Progetto A');
  assert.equal(riga.note, 'una nota');
});

test('riepilogo: conteggi per tag e progetti distinti', () => {
  const r = Scadenze.riepilogo(Scadenze.classifica(archivio(), OGGI));
  assert.deepEqual(r, { scadute: 2, inCorso: 3, daAvviare: 1, progetti: 2 });
});

test('classifica: richiede una data odierna valida', () => {
  assert.throws(() => Scadenze.classifica([], 'oggi'), /data odierna non valida/);
});
