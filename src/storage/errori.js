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

  // Non si puo' scrivere: l'utente ha scelto la sola consultazione, il team e' stato impostato in
  // sola lettura, oppure la cartella ha rifiutato la scrittura (permessi di SharePoint).
  //   motivo: 'consultazione' | 'impostata' | 'scrittura-rifiutata'
  class SolaLettura extends Error {
    constructor(team, motivo) {
      const messaggi = {
        consultazione: 'Sola consultazione: in questa modalità non si può modificare nulla.',
        impostata: 'Il team «' + team + '» è in sola lettura.',
        'scrittura-rifiutata': 'Il team «' + team + '» è in sola lettura: la cartella ha rifiutato la scrittura (permessi di SharePoint).'
      };
      super(messaggi[motivo] || 'Sola lettura.');
      this.name = 'SolaLettura';
      this.team = team;
      this.motivo = motivo;
    }
  }

  const api = { SCHEMA_VERSION, ConflittoDiVersione, SolaLettura };

  radice.MP = radice.MP || {};
  radice.MP.errori = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
