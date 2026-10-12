/* Archivio: uno o piu' team, ognuno in una propria cartella.
 *
 * I permessi li decide SharePoint, cartella per cartella: i referenti scrivono nella cartella
 * del loro team, il responsabile le legge tutte. L'app non puo' (e non deve) far rispettare la
 * riservatezza: legge quello che il browser riesce ad aprire e non scrive dove non si puo'.
 *
 *   Dati/                 <- cartella scelta dall'utente
 *     TeamA/  progetti/  backup/  config.json
 *     TeamB/  progetti/  backup/  config.json
 *
 *  - se la cartella scelta contiene `progetti/` (o e' vuota) e' un team singolo, come prima;
 *  - altrimenti ogni sottocartella e' un team, anche vuota (un team nuovo compare subito);
 *  - config.json e backup/ stanno dentro ogni team: fuori dai team non c'e' nessun dato di
 *    progetto che possa far trapelare altri team;
 *  - il nome del team e' il nome della cartella e non si salva nei file;
 *  - le cartelle dei team non le crea mai l'app (erediterebbero i permessi sbagliati).
 *
 * Sola lettura: l'utente puo' scegliere la «sola consultazione» (nessuna scrittura, per nessun
 * team); in piu', se una scrittura viene rifiutata dalla cartella pur avendo il permesso, quel
 * team passa in sola lettura.
 *
 * Con un solo team il parametro `team` e' facoltativo e l'interfaccia e' quella di una cartella
 * singola (vedi docs/architettura.md).
 */
(function (radice) {
  'use strict';

  const dep = (nome) => (typeof require === 'function' ? require('./' + nome + '.js') : radice.MP[nome]);
  const dom = (nome) => (typeof require === 'function' ? require('../domain/' + nome + '.js') : radice.MP[nome]);
  const Codice = dom('codice');
  const Modello = dom('modello');
  const { SolaLettura } = dep('errori');
  const Cartella = dep('cartella');

  const erroreDiPermesso = (e) => !!e && (e.name === 'NotAllowedError' || e.name === 'NoModificationAllowedError');

  async function esisteSottocartella(dir, nome) {
    try {
      await dir.getDirectoryHandle(nome);
      return true;
    } catch (e) {
      if (e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')) return false;
      throw e;
    }
  }

  const perNome = (a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' });

  const nuovaSquadra = (s) => ({
    nome: s.nome,
    adapter: s.adapter || null,
    handle: s.handle || null,
    errore: s.errore || null,
    erroreConfig: null,
    soloLettura: !!s.soloLettura,
    motivo: s.soloLettura ? 'impostata' : null
  });

  // squadre: [{ nome, adapter, handle?, soloLettura?, errore? }]. `adapter` e' un adapter di
  // cartella singola (cartella.js o memoria.js); `handle` serve solo a controllare il permesso.
  // opzioni: { nome, consultazione, permesso: async (team) => boolean,
  //            aggiorna: async ([{ nome, daRiprovare }]) => ({ aggiungi: [squadra], rimuovi: [nome] }) }
  // `aggiorna` (facoltativa) e' chiamata a ogni `elenca()` per vedere se sono comparsi o spariti team.
  function creaArchivio(squadre, opzioni) {
    const opt = opzioni || {};
    let consultazione = !!opt.consultazione;
    const elenco = squadre.map(nuovaSquadra);

    async function aggiornaSquadre() {
      if (!opt.aggiorna) return;
      try {
        const r = await opt.aggiorna(elenco.map((s) => ({ nome: s.nome, daRiprovare: !s.adapter })));
        (r.rimuovi || []).forEach((nome) => {
          const i = elenco.findIndex((s) => s.nome === nome);
          if (i >= 0) elenco.splice(i, 1);
        });
        (r.aggiungi || []).forEach((s) => elenco.push(nuovaSquadra(s)));
        elenco.sort(perNome);
      } catch (e) {
        // La cartella radice non si legge: si continua con i team gia' noti.
      }
    }

    function squadra(nome) {
      if (nome == null || nome === '') {
        if (elenco.length === 1) return elenco[0];
        throw new Error('Indica il team del progetto');
      }
      const s = elenco.find((x) => x.nome === nome);
      if (!s) throw new Error('Team sconosciuto: ' + nome);
      return s;
    }

    const scrivibile = (s) => !consultazione && !s.soloLettura && !s.errore && !!s.adapter;

    function stato(s) {
      return {
        nome: s.nome,
        ok: !s.errore,
        errore: s.errore,
        erroreConfig: s.erroreConfig,
        nuova: !!s.adapter && s.adapter.nuova === true,
        scrivibile: scrivibile(s),
        soloLettura: !scrivibile(s),
        motivo: consultazione ? 'consultazione' : s.motivo
      };
    }

    async function permessoConcesso(s) {
      if (opt.permesso) return opt.permesso(s.nome);
      if (s.handle && typeof s.handle.queryPermission === 'function') {
        try { return (await s.handle.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch (e) { return false; }
      }
      return true;
    }

    // Esegue una scrittura sul team, rifiutandola se non e' ammessa. Se la cartella la rifiuta
    // pur avendo il permesso, il team passa in sola lettura.
    async function scrivi(nome, operazione) {
      const s = squadra(nome);
      if (consultazione) throw new SolaLettura(s.nome, 'consultazione');
      if (s.errore || !s.adapter) throw new Error('Il team «' + s.nome + '» non è accessibile: ' + (s.errore || 'cartella non aperta'));
      if (s.soloLettura) throw new SolaLettura(s.nome, s.motivo || 'impostata');
      try {
        return await operazione(s.adapter);
      } catch (e) {
        if (erroreDiPermesso(e) && (await permessoConcesso(s))) {
          s.soloLettura = true;
          s.motivo = 'scrittura-rifiutata';
          throw new SolaLettura(s.nome, 'scrittura-rifiutata');
        }
        throw e;
      }
    }

    const archivio = {
      tipo: 'archivio',
      nome: opt.nome || (elenco.length === 1 ? elenco[0].nome : 'archivio'),
      get multi() { return elenco.length > 1; },
      get consultazione() { return consultazione; },
      // true se ogni team e' ancora senza progetti: la struttura nasce al primo salvataggio.
      get nuova() {
        const aperti = elenco.filter((s) => s.adapter);
        return aperti.length > 0 && aperti.every((s) => s.adapter.nuova === true);
      },

      impostaConsultazione(valore) { consultazione = !!valore; },
      squadre() { return elenco.map(stato); },

      // -> { progetti: [{ progetto, rev, team }], copieConflitto: [{ ..., team }],
      //      errori: [{ file, messaggio, team }], squadre: [stato] }
      // Un team che non si riesce a leggere non blocca gli altri: compare tra gli errori.
      async elenca() {
        const out = { progetti: [], copieConflitto: [], errori: [], squadre: [] };
        await aggiornaSquadre();
        await Promise.all(elenco.map(async (s) => {
          if (!s.adapter) {
            out.errori.push({ file: s.nome, team: s.nome, messaggio: 'cartella del team non accessibile: ' + s.errore });
            return;
          }
          try {
            const r = await s.adapter.elenca();
            r.progetti.forEach((v) => out.progetti.push({ progetto: v.progetto, rev: v.rev, team: s.nome }));
            r.copieConflitto.forEach((c) => out.copieConflitto.push(Object.assign({}, c, { team: s.nome })));
            r.errori.forEach((e) => out.errori.push(Object.assign({}, e, { team: s.nome })));
            s.errore = null;
          } catch (e) {
            s.errore = e.message;
            out.errori.push({ file: s.nome, team: s.nome, messaggio: 'cartella del team non accessibile: ' + e.message });
          }
        }));
        out.progetti.sort((a, b) => {
          const ka = Codice.chiave(a.progetto.codice);
          const kb = Codice.chiave(b.progetto.codice);
          if (ka !== kb) return ka < kb ? -1 : 1;
          return a.team < b.team ? -1 : a.team > b.team ? 1 : 0;
        });
        out.squadre = elenco.map(stato);
        return out;
      },

      // opz: { team, revAtteso, codicePrecedente } -> { progetto, rev, team }
      async salva(progetto, opz) {
        const { team, ...resto } = opz || {};
        const s = squadra(team);
        const esito = await scrivi(s.nome, (adapter) => adapter.salva(progetto, resto));
        return Object.assign({}, esito, { team: s.nome });
      },

      async elimina(codice, revAtteso, team) {
        const s = squadra(team);
        return scrivi(s.nome, (adapter) => adapter.elimina(codice, revAtteso));
      },

      async leggiConfigurazione(team) {
        const s = squadra(team);
        return s.adapter ? s.adapter.leggiConfigurazione() : Modello.creaConfigurazione();
      },

      // Configurazione di tutti i team: { nomeTeam: configurazione }. Un file illeggibile non
      // blocca gli altri team: il team ottiene i valori predefiniti e l'errore e' in squadre().
      async configurazioni() {
        const out = {};
        await Promise.all(elenco.map(async (s) => {
          try {
            out[s.nome] = s.adapter ? await s.adapter.leggiConfigurazione() : Modello.creaConfigurazione();
            s.erroreConfig = null;
          } catch (e) {
            out[s.nome] = Modello.creaConfigurazione();
            s.erroreConfig = e.message;
          }
        }));
        return out;
      },

      async salvaConfigurazione(cfg, team) {
        const s = squadra(team);
        return scrivi(s.nome, (adapter) => adapter.salvaConfigurazione(cfg));
      },

      async risolviCopia(file, scelta, team) {
        const s = squadra(team);
        return scrivi(s.nome, (adapter) => adapter.risolviCopia(file, scelta));
      }
    };
    return archivio;
  }

  // Apre la cartella scelta dall'utente riconoscendo il layout (team singolo o piu' team).
  // opzioni: quelle di creaCartella (oggi, concorrenza) piu' { consultazione }.
  async function apriArchivio(radiceHandle, opzioni) {
    const opt = opzioni || {};
    const nomeRadice = radiceHandle.name || 'cartella';
    const conNome = Object.assign({}, opt, { nome: nomeRadice });

    // Le sottocartelle che possono essere team (si saltano quelle che iniziano con . o _).
    async function cartelleDeiTeam() {
      const nomi = [];
      for await (const [nome, handle] of radiceHandle.entries()) {
        if (handle.kind === 'directory' && !/^[._]/.test(nome)) nomi.push(nome);
      }
      return nomi;
    }

    const sottocartelle = (await esisteSottocartella(radiceHandle, 'progetti')) ? [] : await cartelleDeiTeam();

    if (!sottocartelle.length) {
      const adapter = await Cartella.creaCartella(radiceHandle, opt);
      return creaArchivio([{ nome: nomeRadice, adapter, handle: radiceHandle }], conNome);
    }

    async function apriTeam(nome) {
      try {
        const handle = await radiceHandle.getDirectoryHandle(nome);
        return { nome, handle, adapter: await Cartella.creaCartella(handle, opt) };
      } catch (e) {
        return { nome, errore: e.message };
      }
    }

    const squadre = await Promise.all(sottocartelle.map(apriTeam));
    squadre.sort(perNome);

    // A ogni aggiornamento: team comparsi (cartella nuova creata dal proprietario del sito o
    // permesso concesso), spariti, o con un'apertura da riprovare.
    const aggiorna = async (noti) => {
      const attuali = await cartelleDeiTeam();
      const nomiNoti = noti.map((n) => n.nome);
      const daRiprovare = noti.filter((n) => n.daRiprovare && attuali.includes(n.nome)).map((n) => n.nome);
      const daAprire = attuali.filter((n) => !nomiNoti.includes(n)).concat(daRiprovare);
      return {
        aggiungi: await Promise.all(daAprire.map(apriTeam)),
        rimuovi: nomiNoti.filter((n) => !attuali.includes(n)).concat(daRiprovare)
      };
    };
    return creaArchivio(squadre, Object.assign({}, conNome, { aggiorna }));
  }

  const api = { creaArchivio, apriArchivio };

  radice.MP = radice.MP || {};
  radice.MP.archivio = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
