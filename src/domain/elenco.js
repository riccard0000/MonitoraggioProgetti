/* Elenco dei progetti: ricerca, filtro per fase, ordinamento, sintesi e totali.
 * Funzioni pure sugli oggetti progetto: servono sia alla tabella sia ai report PDF,
 * cosi' schermo e PDF mostrano gli stessi risultati.
 */
(function (radice) {
  'use strict';

  const dep = (nome) => (typeof require === 'function' ? require('./' + nome + '.js') : radice.MP[nome]);
  const Modello = dep('modello');
  const Importi = dep('importi');

  // Tutto cio' che la ricerca deve poter trovare, in minuscolo.
  function testoRicerca(p) {
    const costo = Modello.costoProgetto(p);
    const parti = [p.codice, p.applicativo, p.projectManager, p.fase, p.descrizione, p.note, p.promemoria,
      String(costo), Importi.formatoEuro(costo)];
    (p.ordini || []).forEach((o) => parti.push(o.riferimento, o.offerta, o.vpu));
    (p.attivita || []).forEach((a) => parti.push(a.descrizione, a.note, a.stato));
    return parti.filter((x) => x).join(' ').toLowerCase();
  }

  // Parole singole o frasi tra virgolette: `neri "prova 1"` -> ["neri", "prova 1"].
  function terminiDiRicerca(testo) {
    const termini = [];
    const re = /"([^"]*)"|(\S+)/g;
    let m;
    while ((m = re.exec(String(testo || '').toLowerCase())) !== null) {
      const t = (m[1] !== undefined ? m[1] : m[2]).trim();
      if (t) termini.push(t);
    }
    return termini;
  }

  // `testo`: tutti i termini devono comparire (in qualunque ordine); una frase tra virgolette
  // vale come un termine unico. `fasi`: se vuoto vale «tutte».
  function filtra(progetti, filtri) {
    const f = filtri || {};
    const parole = terminiDiRicerca(f.testo);
    const fasi = new Set(f.fasi || []);
    return progetti.filter((p) => {
      if (fasi.size && !fasi.has(p.fase)) return false;
      if (!parole.length) return true;
      const t = testoRicerca(p);
      return parole.every((w) => t.includes(w));
    });
  }

  // 'SI' se tutti gli ordini hanno il campo a SI, 'NO' se nessuno, 'PARZIALE' altrimenti,
  // '-' se il progetto non ha ordini. `campo`: 'offerta' | 'vpu'.
  function sintesiOrdini(progetto, campo) {
    const ordini = progetto.ordini || [];
    if (!ordini.length) return '-';
    const si = ordini.filter((o) => o[campo] === 'SI').length;
    if (si === ordini.length) return 'SI';
    return si === 0 ? 'NO' : 'PARZIALE';
  }

  const CHIAVI = {
    fase: (p) => Modello.FASI.indexOf(p.fase),
    periodo: (p) => p.inizio || '',
    costo: (p) => Modello.costoProgetto(p),
    ordini: (p) => ((p.ordini || [])[0] || {}).riferimento || '',
    offerta: (p) => sintesiOrdini(p, 'offerta'),
    vpu: (p) => sintesiOrdini(p, 'vpu')
  };

  // `direzione`: 1 crescente, -1 decrescente. Restituisce una copia; senza campo, l'ordine originale.
  function ordina(progetti, campo, direzione) {
    const copia = progetti.slice();
    if (!campo) return copia;
    const verso = direzione === -1 ? -1 : 1;
    const chiave = CHIAVI[campo] || ((p) => p[campo] == null ? '' : p[campo]);
    return copia.sort((a, b) => {
      const x = chiave(a);
      const y = chiave(b);
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * verso;
      return String(x).localeCompare(String(y), 'it', { numeric: true, sensitivity: 'base' }) * verso;
    });
  }

  function conteggiPerFase(progetti) {
    const out = {};
    Modello.FASI.forEach((f) => { out[f] = 0; });
    progetti.forEach((p) => { if (out[p.fase] !== undefined) out[p.fase]++; });
    return out;
  }

  function costiPerFase(progetti) {
    const out = {};
    Modello.FASI.forEach((f) => { out[f] = 0; });
    progetti.forEach((p) => {
      if (out[p.fase] !== undefined) out[p.fase] = Importi.arrotonda(out[p.fase] + Modello.costoProgetto(p));
    });
    return out;
  }

  function totali(progetti) {
    return {
      progetti: progetti.length,
      ordini: progetti.reduce((t, p) => t + (p.ordini || []).length, 0),
      attivita: progetti.reduce((t, p) => t + (p.attivita || []).length, 0),
      costo: Importi.arrotonda(progetti.reduce((t, p) => t + Modello.costoProgetto(p), 0))
    };
  }

  const api = { testoRicerca, filtra, sintesiOrdini, ordina, conteggiPerFase, costiPerFase, totali };

  radice.MP = radice.MP || {};
  radice.MP.elenco = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
