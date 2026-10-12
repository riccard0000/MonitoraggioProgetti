/* Errori e costanti del livello di salvataggio. */
(function (radice) {
  'use strict';

  const SCHEMA_VERSION = 1;

  const MESSAGGI = {
    'rev-diversa': 'Il progetto è stato modificato da un altro utente.',
    'codice-esistente': 'Esiste già un progetto con questo codice.',
    'eliminato': 'Il progetto è stato eliminato da un altro utente.'
  };

  // Il salvataggio non e' andato a buon fine perche' i dati sono cambiati nel frattempo.
  //   motivo: 'rev-diversa' | 'codice-esistente' | 'eliminato'
  //   codice: il codice coinvolto
  //   revAttuale, attuale: revisione e progetto oggi presenti (se esistono)
  class ConflittoDiVersione extends Error {
    constructor(motivo, dettagli) {
      super(MESSAGGI[motivo] || motivo);
      this.name = 'ConflittoDiVersione';
      this.motivo = motivo;
      Object.assign(this, dettagli);
    }
  }

  const api = { SCHEMA_VERSION, ConflittoDiVersione };

  radice.MP = radice.MP || {};
  radice.MP.errori = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
