/* Regole di versione, uguali per ogni adapter.
 *
 * Ogni progetto ha una revisione (`rev`): 1 alla creazione, +1 a ogni salvataggio.
 * Chi salva dichiara la revisione che aveva letto (`revAtteso`); se nel frattempo e' cambiata,
 * il salvataggio viene rifiutato con un ConflittoDiVersione e decide l'utente.
 * Le funzioni non fanno I/O: ricevono lo stato attuale e dicono cosa fare o sollevano il conflitto.
 *
 * `attuale*` e' { rev, progetto } oppure null se non esiste.
 */
(function (radice) {
  'use strict';

  const dep = (nome) => (typeof require === 'function' ? require('./' + nome + '.js') : radice.MP[nome]);
  const { ConflittoDiVersione } = dep('errori');

  function conflitto(motivo, codice, attuale) {
    return new ConflittoDiVersione(motivo, {
      codice,
      revAttuale: attuale ? attuale.rev : null,
      attuale: attuale ? attuale.progetto : null
    });
  }

  // Nuovo progetto: revAtteso nullo. Modifica: revAtteso = revisione letta.
  // Rinomina del codice: chiaveVecchia diversa da chiaveNuova.
  // -> { rev: revisione da scrivere, rinomina: boolean }
  function decidiSalvataggio(p) {
    const { codice, chiaveNuova, chiaveVecchia, attualeNuovo, attualeVecchio, revAtteso } = p;

    if (chiaveNuova === chiaveVecchia) {
      if (revAtteso == null) {
        if (attualeNuovo) throw conflitto('codice-esistente', codice, attualeNuovo);
        return { rev: 1, rinomina: false };
      }
      if (!attualeNuovo) throw conflitto('eliminato', codice, null);
      if (attualeNuovo.rev !== revAtteso) throw conflitto('rev-diversa', codice, attualeNuovo);
      return { rev: attualeNuovo.rev + 1, rinomina: false };
    }

    if (revAtteso == null) throw new Error('Per cambiare il codice serve la revisione di partenza');
    if (!attualeVecchio) throw conflitto('eliminato', codice, null);
    if (attualeVecchio.rev !== revAtteso) throw conflitto('rev-diversa', codice, attualeVecchio);
    if (attualeNuovo) throw conflitto('codice-esistente', codice, attualeNuovo);
    return { rev: attualeVecchio.rev + 1, rinomina: true };
  }

  // -> true se c'e' qualcosa da eliminare, false se il progetto non esiste piu' (nessun errore).
  function decidiEliminazione(p) {
    const { codice, attuale, revAtteso } = p;
    if (!attuale) return false;
    if (attuale.rev !== revAtteso) throw conflitto('rev-diversa', codice, attuale);
    return true;
  }

  const api = { decidiSalvataggio, decidiEliminazione };

  radice.MP = radice.MP || {};
  radice.MP.regole = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
