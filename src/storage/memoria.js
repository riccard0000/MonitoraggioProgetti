/* Adapter in memoria: per i test e per la modalita' «dati di prova» dell'app.
 * Stessa interfaccia dell'adapter su cartella (vedi docs/architettura.md); i dati si perdono
 * alla chiusura della pagina.
 */
(function (radice) {
  'use strict';

  const dep = (nome) => (typeof require === 'function' ? require('./' + nome + '.js') : radice.MP[nome]);
  const Codice = typeof require === 'function' ? require('../domain/codice.js') : radice.MP.codice;
  const Modello = typeof require === 'function' ? require('../domain/modello.js') : radice.MP.modello;
  const Regole = dep('regole');

  const copia = (x) => JSON.parse(JSON.stringify(x));

  // opzioni.progetti: [{ progetto, rev }] iniziali; opzioni.config: configurazione iniziale.
  function creaMemoria(opzioni) {
    const opt = opzioni || {};
    const archivio = new Map(); // chiave del codice -> { progetto, rev }
    let config = Modello.creaConfigurazione(opt.config);

    (opt.progetti || []).forEach((voce) => {
      archivio.set(Codice.chiave(voce.progetto.codice), { progetto: Modello.creaProgetto(copia(voce.progetto)), rev: voce.rev || 1 });
    });

    const attuale = (chiave) => archivio.get(chiave) || null;

    return {
      tipo: 'memoria',
      nome: 'Dati di prova (in memoria)',

      async elenca() {
        const progetti = Array.from(archivio.entries())
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([, v]) => ({ progetto: copia(v.progetto), rev: v.rev }));
        return { progetti, copieConflitto: [], errori: [] };
      },

      // opz.revAtteso: revisione letta (null per un progetto nuovo);
      // opz.codicePrecedente: il codice di partenza, se lo si sta cambiando.
      async salva(progetto, opz) {
        const o = opz || {};
        const chiaveNuova = Codice.chiave(progetto.codice);
        if (!chiaveNuova) throw new Error('Il codice è obbligatorio');
        const chiaveVecchia = o.codicePrecedente ? Codice.chiave(o.codicePrecedente) : chiaveNuova;

        const esito = Regole.decidiSalvataggio({
          codice: progetto.codice,
          chiaveNuova,
          chiaveVecchia,
          attualeNuovo: attuale(chiaveNuova),
          attualeVecchio: attuale(chiaveVecchia),
          revAtteso: o.revAtteso == null ? null : o.revAtteso
        });

        const salvato = Modello.creaProgetto(copia(progetto));
        if (esito.rinomina) archivio.delete(chiaveVecchia);
        archivio.set(chiaveNuova, { progetto: salvato, rev: esito.rev });
        return { progetto: copia(salvato), rev: esito.rev };
      },

      async elimina(codice, revAtteso) {
        const chiave = Codice.chiave(codice);
        const daEliminare = Regole.decidiEliminazione({ codice, attuale: attuale(chiave), revAtteso });
        if (daEliminare) archivio.delete(chiave);
      },

      async leggiConfigurazione() {
        return Modello.creaConfigurazione(copia(config));
      },

      async salvaConfigurazione(cfg) {
        const nuova = Modello.creaConfigurazione(cfg);
        const errori = Modello.validaConfigurazione(nuova);
        if (errori.length) throw new Error(errori[0].messaggio);
        config = copia(nuova);
        return Modello.creaConfigurazione(copia(config));
      },

      async risolviCopia() {
        throw new Error('Questo archivio non ha copie di conflitto');
      }
    };
  }

  const api = { creaMemoria };

  radice.MP = radice.MP || {};
  radice.MP.memoria = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
