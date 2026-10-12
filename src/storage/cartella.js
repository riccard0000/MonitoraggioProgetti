/* Adapter su cartella condivisa (File System Access API).
 *
 * Layout nella cartella scelta dall'utente:
 *
 *   progetti/<CODICE>.json     un file per progetto: { schemaVersion, rev, progetto }
 *   backup/<aaaa-mm-gg>/...    la versione di inizio giornata di ogni progetto modificato
 *   config.json                impostazioni dell'archivio
 *
 * Il nome del file deriva dal codice (maiuscolo, caratteri non sicuri codificati): Windows e
 * OneDrive non distinguono maiuscole e minuscole, quindi il file system stesso impedisce due
 * progetti con lo stesso codice. Vedi docs/architettura.md.
 *
 * Se due persone salvano lo stesso progetto entro il tempo di sincronizzazione, OneDrive crea
 * una «copia di conflitto» con un altro nome file: `elenca` le rileva e `risolviCopia` le chiude.
 */
(function (radice) {
  'use strict';

  const dep = (nome) => (typeof require === 'function' ? require('./' + nome + '.js') : radice.MP[nome]);
  const dom = (nome) => (typeof require === 'function' ? require('../domain/' + nome + '.js') : radice.MP[nome]);
  const Codice = dom('codice');
  const Data = dom('date');
  const Modello = dom('modello');
  const Regole = dep('regole');
  const { SCHEMA_VERSION } = dep('errori');

  const DIR_PROGETTI = 'progetti';
  const DIR_BACKUP = 'backup';
  const FILE_CONFIG = 'config.json';

  // Lettere maiuscole, cifre, '-' e '_' restano; tutto il resto diventa %XX (UTF-8).
  function codifica(chiave) {
    let out = '';
    const enc = new TextEncoder();
    for (const ch of chiave) {
      if (/[A-Z0-9_-]/.test(ch)) {
        out += ch;
      } else {
        enc.encode(ch).forEach((byte) => { out += '%' + byte.toString(16).toUpperCase().padStart(2, '0'); });
      }
    }
    return out;
  }

  function nomeFile(codice) {
    return codifica(Codice.chiave(codice)) + '.json';
  }

  function oggiLocale() {
    const d = new Date();
    return Data.iso(d.getFullYear(), d.getMonth(), d.getDate());
  }

  const eNonTrovato = (e) => !!e && e.name === 'NotFoundError';

  async function sottocartella(padre, nome, crea) {
    try {
      return await padre.getDirectoryHandle(nome, { create: !!crea });
    } catch (e) {
      if (eNonTrovato(e) && !crea) return null;
      throw e;
    }
  }

  async function leggiTesto(dir, nome) {
    try {
      const fh = await dir.getFileHandle(nome);
      return await (await fh.getFile()).text();
    } catch (e) {
      if (eNonTrovato(e)) return null;
      throw e;
    }
  }

  async function scriviTesto(dir, nome, testo) {
    const fh = await dir.getFileHandle(nome, { create: true });
    const w = await fh.createWritable();
    await w.write(testo);
    await w.close();
  }

  async function rimuovi(dir, nome) {
    try {
      await dir.removeEntry(nome);
    } catch (e) {
      if (!eNonTrovato(e)) throw e;
    }
  }

  // Esegue `fn` su tutte le voci, al massimo `limite` alla volta (i file OneDrive non ancora
  // scaricati rendono lente le letture una dopo l'altra).
  async function inParallelo(voci, limite, fn) {
    const risultati = new Array(voci.length);
    let prossimo = 0;
    async function lavora() {
      while (prossimo < voci.length) {
        const i = prossimo++;
        risultati[i] = await fn(voci[i]);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limite, voci.length) }, lavora));
    return risultati;
  }

  // Legge il contenuto di un file di progetto. Lancia un errore con un messaggio comprensibile.
  function leggiRecord(testo) {
    const dati = JSON.parse(testo);
    if (!dati || typeof dati !== 'object' || !dati.progetto || typeof dati.progetto !== 'object') {
      throw new Error('formato non riconosciuto');
    }
    if (typeof dati.schemaVersion === 'number' && dati.schemaVersion > SCHEMA_VERSION) {
      throw new Error('creato da una versione più recente dell\'app (schema ' + dati.schemaVersion + ')');
    }
    if (!Number.isInteger(dati.rev) || dati.rev < 1) throw new Error('revisione mancante');
    return { rev: dati.rev, progetto: Modello.creaProgetto(dati.progetto) };
  }

  const serializza = (progetto, rev) => JSON.stringify({ schemaVersion: SCHEMA_VERSION, rev, progetto }, null, 2);

  // `radiceHandle`: FileSystemDirectoryHandle scelto dall'utente.
  // opzioni.oggi: funzione che restituisce `aaaa-mm-gg` (per i test); opzioni.concorrenza.
  async function creaCartella(radiceHandle, opzioni) {
    const opt = opzioni || {};
    const oggi = opt.oggi || oggiLocale;
    const concorrenza = Math.max(1, opt.concorrenza || 8);

    const esistente = await sottocartella(radiceHandle, DIR_PROGETTI, false);
    const adapter = {
      tipo: 'cartella',
      nome: radiceHandle.name || 'cartella',
      // true se la cartella non contiene ancora progetti: sara' inizializzata al primo salvataggio.
      nuova: !esistente
    };

    const dirProgetti = (crea) => sottocartella(radiceHandle, DIR_PROGETTI, crea);

    // Stato attuale di un progetto sul disco: { rev, progetto, testo } oppure null.
    async function leggiAttuale(dir, nome) {
      const testo = await leggiTesto(dir, nome);
      if (testo === null) return null;
      try {
        return Object.assign(leggiRecord(testo), { testo });
      } catch (e) {
        throw new Error('Il file ' + nome + ' non è leggibile (' + e.message + '). ' +
          'Ripristinalo dalla cartella backup prima di salvare.');
      }
    }

    // Conserva la versione di inizio giornata: una sola copia al giorno per progetto.
    async function backup(nome, testo, forzato) {
      const dirBackup = await sottocartella(radiceHandle, DIR_BACKUP, true);
      const dirGiorno = await sottocartella(dirBackup, oggi(), true);
      if (forzato || (await leggiTesto(dirGiorno, nome)) === null) await scriviTesto(dirGiorno, nome, testo);
    }

    adapter.elenca = async function () {
      const risultato = { progetti: [], copieConflitto: [], errori: [] };
      const dir = await dirProgetti(false);
      if (!dir) return risultato;

      const file = [];
      for await (const [nome, handle] of dir.entries()) {
        if (handle.kind === 'file' && nome.toLowerCase().endsWith('.json')) file.push(nome);
      }

      await inParallelo(file, concorrenza, async (nome) => {
        try {
          const fh = await dir.getFileHandle(nome);
          const f = await fh.getFile();
          const record = leggiRecord(await f.text());
          if (nome.toLowerCase() === nomeFile(record.progetto.codice).toLowerCase()) {
            risultato.progetti.push(record);
          } else {
            risultato.copieConflitto.push({
              file: nome, codice: record.progetto.codice, rev: record.rev,
              progetto: record.progetto, modificato: f.lastModified
            });
          }
        } catch (e) {
          risultato.errori.push({ file: nome, messaggio: e.message });
        }
      });

      const perCodice = (a, b) => (Codice.chiave(a.progetto.codice) < Codice.chiave(b.progetto.codice) ? -1 : 1);
      risultato.progetti.sort(perCodice);
      risultato.copieConflitto.sort((a, b) => (a.file < b.file ? -1 : 1));
      risultato.errori.sort((a, b) => (a.file < b.file ? -1 : 1));
      return risultato;
    };

    adapter.salva = async function (progetto, opz) {
      const o = opz || {};
      const chiaveNuova = Codice.chiave(progetto.codice);
      if (!chiaveNuova) throw new Error('Il codice è obbligatorio');
      const chiaveVecchia = o.codicePrecedente ? Codice.chiave(o.codicePrecedente) : chiaveNuova;
      const nomeNuovo = nomeFile(progetto.codice);
      const nomeVecchio = chiaveVecchia === chiaveNuova ? nomeNuovo : nomeFile(o.codicePrecedente);

      const dir = await dirProgetti(true);
      const attualeNuovo = await leggiAttuale(dir, nomeNuovo);
      const attualeVecchio = nomeVecchio === nomeNuovo ? attualeNuovo : await leggiAttuale(dir, nomeVecchio);

      const esito = Regole.decidiSalvataggio({
        codice: progetto.codice, chiaveNuova, chiaveVecchia, attualeNuovo, attualeVecchio,
        revAtteso: o.revAtteso == null ? null : o.revAtteso
      });

      if (attualeVecchio) await backup(nomeVecchio, attualeVecchio.testo, false);
      const salvato = Modello.creaProgetto(JSON.parse(JSON.stringify(progetto)));
      await scriviTesto(dir, nomeNuovo, serializza(salvato, esito.rev));
      if (esito.rinomina) await rimuovi(dir, nomeVecchio);
      adapter.nuova = false;
      return { progetto: salvato, rev: esito.rev };
    };

    adapter.elimina = async function (codice, revAtteso) {
      const dir = await dirProgetti(false);
      if (!dir) return;
      const nome = nomeFile(codice);
      const attuale = await leggiAttuale(dir, nome);
      const daEliminare = Regole.decidiEliminazione({ codice, attuale, revAtteso });
      if (!daEliminare) return;
      await backup(nome.replace(/\.json$/, '') + '.eliminato.json', attuale.testo, true);
      await rimuovi(dir, nome);
    };

    adapter.leggiConfigurazione = async function () {
      const testo = await leggiTesto(radiceHandle, FILE_CONFIG);
      if (testo === null) return Modello.creaConfigurazione();
      let dati;
      try {
        dati = JSON.parse(testo);
      } catch (e) {
        throw new Error('Il file ' + FILE_CONFIG + ' non è leggibile (' + e.message + ')');
      }
      if (typeof dati.schemaVersion === 'number' && dati.schemaVersion > SCHEMA_VERSION) {
        throw new Error('Il file ' + FILE_CONFIG + ' è stato creato da una versione più recente dell\'app');
      }
      return Modello.creaConfigurazione(dati);
    };

    adapter.salvaConfigurazione = async function (cfg) {
      const nuova = Modello.creaConfigurazione(cfg);
      nuova.schemaVersion = SCHEMA_VERSION;
      const errori = Modello.validaConfigurazione(nuova);
      if (errori.length) throw new Error(errori[0].messaggio);
      await scriviTesto(radiceHandle, FILE_CONFIG, JSON.stringify(nuova, null, 2));
      return nuova;
    };

    // Chiude una copia di conflitto di OneDrive.
    //   'elimina': si tiene l'originale, la copia va nel backup e sparisce;
    //   'usa':     la copia diventa la versione corrente del progetto (l'originale va nel backup).
    adapter.risolviCopia = async function (file, scelta) {
      if (scelta !== 'elimina' && scelta !== 'usa') throw new Error('Scelta non valida: ' + scelta);
      const dir = await dirProgetti(false);
      if (!dir) return;
      const testo = await leggiTesto(dir, file);
      if (testo === null) return; // gia' risolta da qualcun altro

      if (scelta === 'usa') {
        const copia = leggiRecord(testo);
        const nome = nomeFile(copia.progetto.codice);
        const primario = await leggiAttuale(dir, nome);
        if (primario) await backup(nome, primario.testo, false);
        await scriviTesto(dir, nome, serializza(copia.progetto, (primario ? primario.rev : 0) + 1));
      }
      await backup(file.replace(/\.json$/, '') + '.copia.json', testo, true);
      await rimuovi(dir, file);
    };

    return adapter;
  }

  const api = { creaCartella, nomeFile };

  radice.MP = radice.MP || {};
  radice.MP.cartella = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
