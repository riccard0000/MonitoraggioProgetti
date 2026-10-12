'use strict';
// Prove di contratto: valgono per qualunque adapter di salvataggio. Ogni adapter le esegue
// con `eseguiContratto(nome, async () => adapter)`; cosi' la semantica (revisioni, conflitti,
// codice univoco) resta identica tra memoria e cartella.

const test = require('node:test');
const assert = require('node:assert/strict');
const Modello = require('../../src/domain/modello.js');

const progetto = (codice, parziale) => Modello.creaProgetto(Object.assign({
  codice, applicativo: 'APP', fase: 'Avvio', descrizione: 'Descrizione di ' + codice,
  ordini: [{ riferimento: 'Ordine ' + codice, importo: 1000, offerta: 'SI', vpu: 'NO' }],
  attivita: [{ descrizione: 'Attività di ' + codice, inizio: '2026-01-10', fine: '2026-01-20', stato: 'In corso', note: '' }]
}, parziale));

const conflitto = (motivo) => (e) => e.name === 'ConflittoDiVersione' && e.motivo === motivo;

function eseguiContratto(nome, creaAdapter) {
  const t = (titolo, fn) => test(nome + ': ' + titolo, async () => fn(await creaAdapter()));

  t('un archivio nuovo è vuoto', async (a) => {
    assert.deepEqual(await a.elenca(), { progetti: [], copieConflitto: [], errori: [] });
  });

  t('un progetto nuovo ottiene la revisione 1 e si rilegge identico', async (a) => {
    const p = progetto('EVO-26-001');
    const salvato = await a.salva(p);
    assert.equal(salvato.rev, 1);

    const { progetti } = await a.elenca();
    assert.equal(progetti.length, 1);
    assert.equal(progetti[0].rev, 1);
    assert.deepEqual(progetti[0].progetto, p);
  });

  t('ogni salvataggio con la revisione giusta la incrementa', async (a) => {
    const p = progetto('EVO-26-001');
    await a.salva(p);
    const modificato = { ...p, note: 'nuova nota' };
    const dopo = await a.salva(modificato, { revAtteso: 1 });
    assert.equal(dopo.rev, 2);
    assert.equal((await a.elenca()).progetti[0].progetto.note, 'nuova nota');
  });

  t('con una revisione superata il salvataggio è rifiutato e riporta lo stato attuale', async (a) => {
    const p = progetto('EVO-26-001');
    await a.salva(p);
    await a.salva({ ...p, note: 'di un collega' }, { revAtteso: 1 });

    await assert.rejects(a.salva({ ...p, note: 'la mia' }, { revAtteso: 1 }), (e) => {
      assert.ok(conflitto('rev-diversa')(e));
      assert.equal(e.revAttuale, 2);
      assert.equal(e.attuale.note, 'di un collega');
      return true;
    });
    assert.equal((await a.elenca()).progetti[0].progetto.note, 'di un collega', 'non è stato sovrascritto');
  });

  t('il codice è univoco, ignorando maiuscole e spazi', async (a) => {
    await a.salva(progetto('EVO-26-001'));
    for (const doppio of ['EVO-26-001', 'evo-26-001', ' Evo-26-001 ']) {
      await assert.rejects(a.salva(progetto(doppio)), conflitto('codice-esistente'), doppio);
    }
    assert.equal((await a.elenca()).progetti.length, 1);
  });

  t('modificare un progetto eliminato da un collega è un conflitto', async (a) => {
    const p = progetto('EVO-26-001');
    await a.salva(p);
    await a.elimina('EVO-26-001', 1);
    await assert.rejects(a.salva(p, { revAtteso: 1 }), conflitto('eliminato'));
  });

  t('cambiare il codice sposta il progetto e fa sparire il vecchio', async (a) => {
    const p = progetto('EVO-26-001');
    await a.salva(p);
    await a.salva(progetto('EVO-26-099'), { revAtteso: 1, codicePrecedente: 'EVO-26-001' });

    const { progetti } = await a.elenca();
    assert.deepEqual(progetti.map((x) => x.progetto.codice), ['EVO-26-099']);
    assert.equal(progetti[0].rev, 2);
  });

  t('cambiare il codice in uno già usato, o con revisione superata, non cambia nulla', async (a) => {
    await a.salva(progetto('A-1'));
    await a.salva(progetto('B-1'));

    await assert.rejects(a.salva(progetto('B-1'), { revAtteso: 1, codicePrecedente: 'A-1' }), conflitto('codice-esistente'));
    await a.salva(progetto('A-1', { note: 'x' }), { revAtteso: 1 });
    await assert.rejects(a.salva(progetto('A-2'), { revAtteso: 1, codicePrecedente: 'A-1' }), conflitto('rev-diversa'));

    assert.deepEqual((await a.elenca()).progetti.map((x) => x.progetto.codice), ['A-1', 'B-1']);
  });

  t('cambiare solo le maiuscole del codice aggiorna lo stesso progetto', async (a) => {
    await a.salva(progetto('evo-26-001'));
    await a.salva(progetto('EVO-26-001'), { revAtteso: 1, codicePrecedente: 'evo-26-001' });

    const { progetti } = await a.elenca();
    assert.equal(progetti.length, 1);
    assert.equal(progetti[0].progetto.codice, 'EVO-26-001');
    assert.equal(progetti[0].rev, 2);
  });

  t('eliminare richiede la revisione giusta; se è già sparito non è un errore', async (a) => {
    await a.salva(progetto('A-1'));
    await assert.rejects(a.elimina('A-1', 7), conflitto('rev-diversa'));
    assert.equal((await a.elenca()).progetti.length, 1);

    await a.elimina('A-1', 1);
    assert.equal((await a.elenca()).progetti.length, 0);
    await a.elimina('A-1', 1);
  });

  t('i progetti sono indipendenti e l\'elenco è in ordine di codice', async (a) => {
    await a.salva(progetto('B-2'));
    await a.salva(progetto('A-1'));
    await a.salva(progetto('A-1', { note: 'cambiato' }), { revAtteso: 1 });

    const { progetti } = await a.elenca();
    assert.deepEqual(progetti.map((x) => [x.progetto.codice, x.rev]), [['A-1', 2], ['B-2', 1]]);
  });

  t('cambiare l\'oggetto dopo il salvataggio non altera l\'archivio', async (a) => {
    const p = progetto('A-1');
    const { progetto: restituito } = await a.salva(p);
    p.note = 'modificato fuori';
    p.ordini[0].importo = 999999;
    restituito.note = 'modificato anche questo';

    const letto = (await a.elenca()).progetti[0].progetto;
    assert.equal(letto.note, '');
    assert.equal(letto.ordini[0].importo, 1000);
  });

  t('la configurazione ha dei valori di default e si salva', async (a) => {
    assert.deepEqual(await a.leggiConfigurazione(), Modello.creaConfigurazione());
    await a.salvaConfigurazione({ fteProgetto: 0.3, destinatariVpu: ['vpu@esempio.it'] });
    const c = await a.leggiConfigurazione();
    assert.equal(c.fteProgetto, 0.3);
    assert.deepEqual(c.destinatariVpu, ['vpu@esempio.it']);
  });

  t('una configurazione non valida è rifiutata e non sostituisce la precedente', async (a) => {
    await a.salvaConfigurazione({ fteProgetto: 0.3 });
    await assert.rejects(a.salvaConfigurazione({ fteProgetto: 5 }), /FTE/);
    assert.equal((await a.leggiConfigurazione()).fteProgetto, 0.3);
  });
}

module.exports = { eseguiContratto, progetto };
