'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../src/domain/modello.js');

const valido = () => M.creaProgetto({
  codice: 'EVO-26-001', applicativo: 'SERVIZIO TERMICO 3.0', projectManager: 'Verdi',
  fase: 'Esercizio', inizio: '2025-02-19', fine: '2026-04-21', promemoria: 'SI',
  ordini: [{ riferimento: 'Prova 1', importo: 10000, offerta: 'SI', vpu: 'SI' }],
  attivita: [{ descrizione: 'Rilascio', inizio: '2026-02-02', fine: '2026-02-02', stato: 'Completata' }]
});

const percorsi = (p) => M.validaProgetto(p).map((e) => e.percorso);

test('creaProgetto: valori di default e liste indipendenti', () => {
  const a = M.creaProgetto({ codice: 'A-1' });
  const b = M.creaProgetto({ codice: 'B-1' });
  assert.equal(a.fase, 'Ideazione');
  assert.equal(a.promemoria, 'NO');
  assert.deepEqual(a.ordini, []);
  assert.deepEqual(a.attivita, []);
  a.ordini.push(M.creaOrdine({ riferimento: 'X' }));
  assert.equal(b.ordini.length, 0, 'le liste non sono condivise tra progetti');
});

test('creaProgetto: gli elementi annidati ricevono i loro default', () => {
  const p = M.creaProgetto({ ordini: [{ riferimento: 'X' }], attivita: [{ descrizione: 'Y' }] });
  assert.deepEqual(p.ordini[0], { riferimento: 'X', importo: 0, offerta: 'NO', vpu: 'NO' });
  assert.equal(p.attivita[0].stato, 'Da avviare');
});

test('canonico: ignora maiuscole, spazi e accenti', () => {
  assert.equal(M.canonico(M.SI_NO, 'sì'), 'SI');
  assert.equal(M.canonico(M.SI_NO, ' si '), 'SI');
  assert.equal(M.canonico(M.FASI, 'esercizio'), 'Esercizio');
  assert.equal(M.canonico(M.FASI, 'boh'), null);
  assert.equal(M.canonico(M.SI_NO, null), null);
});

test('costoProgetto: somma degli importi degli ordini, zero senza ordini', () => {
  const p = M.creaProgetto({ ordini: [{ riferimento: 'A', importo: 2000 }, { riferimento: 'B', importo: 3000 }] });
  assert.equal(M.costoProgetto(p), 5000);
  const q = M.creaProgetto({ ordini: [{ riferimento: 'A', importo: 0.1 }, { riferimento: 'B', importo: 0.2 }] });
  assert.equal(M.costoProgetto(q), 0.3);
  assert.equal(M.costoProgetto(M.creaProgetto({})), 0);
});

test('validaProgetto: un progetto corretto non ha errori', () => {
  assert.deepEqual(M.validaProgetto(valido()), []);
  assert.deepEqual(M.validaProgetto(M.creaProgetto({ codice: 'X-1' })), [], 'anche senza ordini né attività');
});

test('validaProgetto: codice, fase e promemoria', () => {
  assert.deepEqual(percorsi({ ...valido(), codice: '   ' }), ['codice']);
  assert.deepEqual(percorsi({ ...valido(), fase: 'Boh' }), ['fase']);
  assert.deepEqual(percorsi({ ...valido(), promemoria: 'forse' }), ['promemoria']);
});

test('validaProgetto: date impossibili o in ordine inverso', () => {
  assert.deepEqual(percorsi({ ...valido(), inizio: '2026-02-31' }), ['inizio']);
  assert.deepEqual(percorsi({ ...valido(), inizio: '2026-05-10', fine: '2026-05-01' }), ['fine']);
});

test('validaProgetto: ordini', () => {
  const p = valido();
  p.ordini = [
    { riferimento: '', importo: 10, offerta: 'NO', vpu: 'NO' },
    { riferimento: 'Prova 1', importo: -5, offerta: 'NO', vpu: 'NO' },
    { riferimento: 'PROVA 1', importo: '100', offerta: 'NO', vpu: 'NO' },
    { riferimento: 'Prova 2', importo: 1, offerta: 'x', vpu: 'y' }
  ];
  assert.deepEqual(percorsi(p), [
    'ordini[0].riferimento',
    'ordini[1].importo',
    'ordini[2].riferimento',   // stesso ordine di "Prova 1", ignorando le maiuscole
    'ordini[2].importo',       // importo come testo
    'ordini[3].offerta',
    'ordini[3].vpu'
  ]);
});

test('validaProgetto: attività', () => {
  const p = valido();
  p.attivita = [
    { descrizione: '', inizio: '', fine: '', stato: 'In corso', note: '' },
    { descrizione: 'A', inizio: '', fine: '', stato: 'Finita', note: '' },
    { descrizione: 'B', inizio: '2026-03-10', fine: '2026-03-01', stato: 'In corso', note: '' }
  ];
  assert.deepEqual(percorsi(p), ['attivita[0].descrizione', 'attivita[1].stato', 'attivita[2].fine']);
});

test('trovaDuplicato: stesso codice ignorando maiuscole e spazi', () => {
  const elenco = [{ codice: 'EVO-26-001' }, { codice: 'EVO-26-002' }];
  assert.equal(M.trovaDuplicato(' evo-26-001 ', elenco), elenco[0]);
  assert.equal(M.trovaDuplicato('EVO-26-009', elenco), null);
});

test('differenze: indica i campi di primo livello che cambiano', () => {
  const a = valido();
  assert.deepEqual(M.differenze(a, structuredClone(a)), []);

  const b = structuredClone(a);
  b.note = 'nuova nota';
  b.ordini[0].vpu = 'NO';
  assert.deepEqual(M.differenze(a, b).sort(), ['note', 'ordini']);
});

test('configurazione: valori di default e validazione', () => {
  const c = M.creaConfigurazione();
  assert.deepEqual(c, { schemaVersion: 1, fteProgetto: 0.2, destinatariVpu: [] });
  assert.deepEqual(M.validaConfigurazione(c), []);

  const mia = M.creaConfigurazione({ fteProgetto: 0.35, destinatariVpu: ['a@esempio.it'] });
  assert.equal(mia.fteProgetto, 0.35);
  assert.notEqual(mia.destinatariVpu, M.creaConfigurazione({ destinatariVpu: mia.destinatariVpu }).destinatariVpu,
    'la lista viene copiata');

  const percorsiErrore = (cfg) => M.validaConfigurazione(cfg).map((e) => e.percorso);
  assert.deepEqual(percorsiErrore({ fteProgetto: 2, destinatariVpu: [] }), ['fteProgetto']);
  assert.deepEqual(percorsiErrore({ fteProgetto: '0,2', destinatariVpu: [] }), ['fteProgetto']);
  assert.deepEqual(percorsiErrore({ fteProgetto: 0.2, destinatariVpu: ['ok@esempio.it', 'non-una-email'] }),
    ['destinatariVpu[1]']);
});

test('trovaDuplicato: modificando un progetto, il suo codice non è un duplicato', () => {
  const elenco = [{ codice: 'EVO-26-001' }, { codice: 'EVO-26-002' }];
  assert.equal(M.trovaDuplicato('EVO-26-001', elenco, 'EVO-26-001'), null, 'codice invariato');
  assert.equal(M.trovaDuplicato('EVO-26-002', elenco, 'EVO-26-001'), elenco[1], 'rinominato in uno esistente');
});
