/* Modello: Progetto (evolutiva) con Ordini e Attivita'.
 *
 *   Progetto (codice univoco) --< Ordine     (riferimento, importo, offerta, vpu)
 *                             `-< Attivita'  (descrizione, inizio, fine, stato, note)
 *
 * Le liste di valori (fasi, stati) sono definite qui e in nessun altro punto.
 * Il costo del progetto non e' un campo: e' la somma degli importi degli ordini.
 * Vedi docs/modello-dati.md.
 */
(function (radice) {
  'use strict';

  const dep = (nome) => (typeof require === 'function' ? require('./' + nome + '.js') : radice.MP[nome]);
  const Codice = dep('codice');
  const Data = dep('date');
  const Importi = dep('importi');

  const FASI = ['Ideazione', 'Avvio', 'Analisi', 'Sviluppo', 'Collaudo', 'Certificazione', 'Esercizio'];
  const STATI_ATTIVITA = ['Da avviare', 'In corso', 'Completata', 'Sospesa'];
  const SI_NO = ['SI', 'NO'];

  function senzaAccenti(testo) {
    return String(testo).normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Riporta un valore alla forma ufficiale della lista (ignora maiuscole, spazi e accenti:
  // "si" e "SI" valgono entrambi "SI"). Ritorna null se non e' in lista.
  function canonico(lista, valore) {
    if (valore == null) return null;
    const cercato = senzaAccenti(valore).trim().toUpperCase();
    for (const voce of lista) {
      if (senzaAccenti(voce).toUpperCase() === cercato) return voce;
    }
    return null;
  }

  function creaOrdine(parziale) {
    return Object.assign({ riferimento: '', importo: 0, offerta: 'NO', vpu: 'NO' }, parziale);
  }

  function creaAttivita(parziale) {
    return Object.assign({ descrizione: '', inizio: '', fine: '', stato: 'Da avviare', note: '' }, parziale);
  }

  function creaProgetto(parziale) {
    const p = Object.assign({
      codice: '', applicativo: '', projectManager: '', fase: 'Ideazione',
      inizio: '', fine: '', sito: '', descrizione: '', note: '', promemoria: 'NO'
    }, parziale);
    p.ordini = ((parziale && parziale.ordini) || []).map(creaOrdine);
    p.attivita = ((parziale && parziale.attivita) || []).map(creaAttivita);
    return p;
  }

  // Costo del progetto = somma degli importi degli ordini. Senza ordini vale 0.
  function costoProgetto(progetto) {
    const somma = (progetto.ordini || []).reduce((tot, o) => tot + (Number(o.importo) || 0), 0);
    return Importi.arrotonda(somma);
  }

  // Controlla un progetto. -> [{ percorso, messaggio }], vuoto se e' valido.
  function validaProgetto(p) {
    const errori = [];
    const err = (percorso, messaggio) => errori.push({ percorso, messaggio });

    function periodo(prefisso, inizio, fine) {
      const i = Data.leggi(inizio);
      const f = Data.leggi(fine);
      if (i.valida === false) err(prefisso + 'inizio', 'Data di inizio non valida');
      if (f.valida === false) err(prefisso + 'fine', 'Data di fine non valida');
      if (i.valida && f.valida && f.valore < i.valore) {
        err(prefisso + 'fine', 'La data di fine precede quella di inizio');
      }
    }

    if (Codice.normalizza(p.codice) === '') err('codice', 'Il codice è obbligatorio');
    if (!canonico(FASI, p.fase)) err('fase', 'Fase non valida: ' + p.fase);
    if (!canonico(SI_NO, p.promemoria)) err('promemoria', 'Il promemoria deve essere SI o NO');
    periodo('', p.inizio, p.fine);

    const visti = new Set();
    (p.ordini || []).forEach((o, i) => {
      const base = 'ordini[' + i + '].';
      const rif = Codice.chiave(o.riferimento);
      if (rif === '') err(base + 'riferimento', 'Il riferimento dell\'ordine è obbligatorio');
      else if (visti.has(rif)) err(base + 'riferimento', 'Ordine già presente nel progetto: ' + o.riferimento);
      visti.add(rif);
      if (typeof o.importo !== 'number' || !Number.isFinite(o.importo) || o.importo < 0) {
        err(base + 'importo', 'L\'importo deve essere un numero maggiore o uguale a zero');
      }
      if (!canonico(SI_NO, o.offerta)) err(base + 'offerta', 'L\'offerta deve essere SI o NO');
      if (!canonico(SI_NO, o.vpu)) err(base + 'vpu', 'Il VPU deve essere SI o NO');
    });

    (p.attivita || []).forEach((a, i) => {
      const base = 'attivita[' + i + '].';
      if (String(a.descrizione || '').trim() === '') err(base + 'descrizione', 'La descrizione dell\'attività è obbligatoria');
      if (!canonico(STATI_ATTIVITA, a.stato)) err(base + 'stato', 'Stato non valido: ' + a.stato);
      periodo(base, a.inizio, a.fine);
    });

    return errori;
  }

  // Il progetto di `elenco` con lo stesso codice, escluso `escludi` (il codice di partenza
  // quando si modifica un progetto esistente). Null se il codice e' libero.
  function trovaDuplicato(codice, elenco, escludi) {
    for (const p of elenco) {
      if (escludi != null && Codice.uguali(p.codice, escludi)) continue;
      if (Codice.uguali(p.codice, codice)) return p;
    }
    return null;
  }

  function stabile(v) {
    if (Array.isArray(v)) return '[' + v.map(stabile).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stabile(v[k])).join(',') + '}';
    }
    return JSON.stringify(v);
  }

  // Campi di primo livello che differiscono tra due progetti (ordini e attivita' contano come uno).
  function differenze(a, b) {
    const chiavi = new Set(Object.keys(a).concat(Object.keys(b)));
    return Array.from(chiavi).filter((k) => stabile(a[k]) !== stabile(b[k]));
  }

  // Impostazioni dell'archivio, salvate in config.json accanto ai progetti.
  // `fteProgetto` e' un segnaposto (0,20) finche' non si conosce il valore reale.
  function creaConfigurazione(parziale) {
    const c = Object.assign({ schemaVersion: 1, fteProgetto: 0.2, destinatariVpu: [] }, parziale);
    c.destinatariVpu = Array.isArray(c.destinatariVpu) ? c.destinatariVpu.slice() : [];
    return c;
  }

  function validaConfigurazione(c) {
    const errori = [];
    if (typeof c.fteProgetto !== 'number' || !Number.isFinite(c.fteProgetto) || c.fteProgetto < 0 || c.fteProgetto > 1) {
      errori.push({ percorso: 'fteProgetto', messaggio: 'Il valore FTE per progetto deve essere un numero tra 0 e 1' });
    }
    (c.destinatariVpu || []).forEach((indirizzo, i) => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(indirizzo)) {
        errori.push({ percorso: 'destinatariVpu[' + i + ']', messaggio: 'Indirizzo email non valido: ' + indirizzo });
      }
    });
    return errori;
  }

  const api = {
    FASI, STATI_ATTIVITA, SI_NO,
    canonico, creaOrdine, creaAttivita, creaProgetto,
    costoProgetto, validaProgetto, trovaDuplicato,
    differenze, creaConfigurazione, validaConfigurazione
  };

  radice.MP = radice.MP || {};
  radice.MP.modello = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
