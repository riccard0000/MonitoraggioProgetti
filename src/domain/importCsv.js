/* Import da CSV. Due formati, riconosciuti dalle intestazioni:
 *
 *  - esteso (quello che scrive `esportaCsv`): una riga per ordine o per attivita', con le
 *    colonne "Ordine Riferimento/Importo/Offerta/VPU" e "Attivita' ...". Round-trip completo,
 *    anche con piu' ordini per progetto;
 *  - piatto dell'app precedente: colonne "Riferimento Ordine", "Costo", "Offerta", "VPU" a
 *    livello di progetto, quindi *un solo* ordine per progetto.
 *
 * Regole comuni (docs/modello-dati.md):
 *  - si raggruppa per codice (senza distinguere maiuscole e spazi);
 *  - ogni colonna del progetto vale il primo valore non vuoto del gruppo;
 *  - se altre righe dello stesso codice portano un valore *diverso* e non vuoto, e' un
 *    conflitto: si tiene il primo ma lo si segnala, non si scarta in silenzio;
 *  - nel formato piatto il costo ripetuto sulle righe e' lo stesso valore e non si somma;
 *  - nulla viene scritto qui: `importa` restituisce il risultato da mostrare in anteprima.
 */
(function (radice) {
  'use strict';

  const dep = (nome) => (typeof require === 'function' ? require('./' + nome + '.js') : radice.MP[nome]);
  const Codice = dep('codice');
  const Data = dep('date');
  const Importi = dep('importi');
  const Csv = dep('csv');
  const Modello = dep('modello');

  // Intestazione normalizzata (minuscolo, senza accenti) -> campo interno.
  const ALIAS = {
    'codice': 'codice',
    'applicativo': 'applicativo',
    'project manager': 'projectManager',
    'fase': 'fase',
    'periodo inizio': 'inizio', 'data inizio': 'inizio',
    'periodo fine': 'fine', 'data fine': 'fine',
    'sito progetto': 'sito', 'sitoprogetto': 'sito', 'sito': 'sito',
    'descrizione': 'descrizione',
    'note': 'note',
    'promemoria': 'promemoria',
    // formato piatto: un ordine per progetto
    'riferimento ordine': 'riferimento', 'rif. ordine': 'riferimento', 'rif ordine': 'riferimento', 'rifordine': 'riferimento',
    'costo': 'costo',
    'offerta': 'offerta',
    'vpu': 'vpu',
    // formato esteso: ordini sulle righe
    'ordine riferimento': 'o_riferimento',
    'ordine importo': 'o_importo',
    'ordine offerta': 'o_offerta',
    'ordine vpu': 'o_vpu',
    // attivita'
    'attivita descrizione': 'a_descrizione',
    'attivita inizio': 'a_inizio',
    'attivita fine': 'a_fine',
    'attivita stato': 'a_stato',
    'attivita note': 'a_note'
  };

  function nomeIntestazione(testo) {
    return String(testo).replace(/^﻿/, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .trim().toLowerCase().replace(/\s+/g, ' ');
  }

  const confrontoTesto = (v) => v.replace(/\s+/g, ' ');
  const confrontoLista = (lista) => (v) => Modello.canonico(lista, v) || v.toUpperCase();
  const confrontoData = (v) => Data.leggi(v).valore || v;
  const confrontoCosto = (v) => { const r = Importi.leggi(v); return r.valido ? String(r.valore) : v; };

  // Costruisce il progetto di un gruppo di righe con lo stesso codice.
  function costruisci(gruppo, esteso, ris) {
    const codice = gruppo.codice;
    const avviso = (riga, messaggio) => ris.avvisi.push({ riga, codice, messaggio });
    const conflitto = (campo, valori, tenuto) => ris.conflitti.push({ codice, campo, valori, tenuto });

    // Primo valore non vuoto del campo; registra un conflitto se ce n'e' piu' di uno distinto.
    function scegli(campo, confronto) {
      const distinti = new Map();
      let primo = null;
      let riga = gruppo.righe[0].numero;
      for (const r of gruppo.righe) {
        const v = r.valori[campo];
        if (v === undefined || v === '') continue;
        const k = (confronto || confrontoTesto)(v);
        if (!distinti.has(k)) distinti.set(k, v);
        if (primo === null) { primo = v; riga = r.numero; }
      }
      if (distinti.size > 1) conflitto(campo, Array.from(distinti.values()), primo);
      return { valore: primo === null ? '' : primo, riga };
    }

    function dataDa(testo, etichetta, riga) {
      if (!testo) return '';
      const d = Data.leggi(testo);
      if (d.valida) return d.valore;
      avviso(riga, etichetta + ' non valida «' + testo + '»: lasciata vuota');
      return '';
    }

    function siNoDa(testo, etichetta, riga) {
      if (!testo) return 'NO';
      const c = Modello.canonico(Modello.SI_NO, testo);
      if (c) return c;
      avviso(riga, etichetta + ' non riconosciuto «' + testo + '»: impostato a NO');
      return 'NO';
    }

    function importoDa(testo, etichetta, riga) {
      const letto = Importi.leggi(testo);
      if (!letto.valido) {
        avviso(riga, etichetta + ' non valido «' + testo + '»: impostato a 0');
        return 0;
      }
      if (letto.ambiguo) {
        avviso(riga, etichetta + ' ambiguo «' + testo + '»: letto come ' + Importi.formatoEuro(letto.valore) +
          ' (il punto è stato preso come separatore delle migliaia)');
      }
      return letto.valore;
    }

    // Formato piatto: un solo ordine, con riferimento/costo/offerta/vpu del progetto.
    function ordiniPiatti() {
      const riferimento = scegli('riferimento');
      const costo = scegli('costo', confrontoCosto);
      const offertaScelta = scegli('offerta', confrontoLista(Modello.SI_NO));
      const vpuScelto = scegli('vpu', confrontoLista(Modello.SI_NO));
      const offerta = siNoDa(offertaScelta.valore, 'Offerta', offertaScelta.riga);
      const vpu = siNoDa(vpuScelto.valore, 'VPU', vpuScelto.riga);

      if (riferimento.valore !== '' || costo.valore !== '') {
        const importo = importoDa(costo.valore, 'Costo', costo.riga);
        return [Modello.creaOrdine({ riferimento: riferimento.valore, importo, offerta, vpu })];
      }
      if (offerta === 'SI' || vpu === 'SI') {
        avviso(gruppo.righe[0].numero, 'Offerta o VPU a SI senza riferimento ordine né costo: ignorati');
      }
      return [];
    }

    // Formato esteso: gli ordini stanno sulle righe; lo stesso ordine puo' ripetersi.
    function ordiniEsteso() {
      const visti = new Map(); // chiave del riferimento -> { ordine, grezzo }
      for (const r of gruppo.righe) {
        const v = r.valori;
        if (!(v.o_riferimento || v.o_importo || v.o_offerta || v.o_vpu)) continue;
        const k = Codice.chiave(v.o_riferimento);
        const grezzo = { importo: v.o_importo || '', offerta: v.o_offerta || '', vpu: v.o_vpu || '' };
        const precedente = visti.get(k);

        if (!precedente) {
          visti.set(k, {
            grezzo,
            ordine: Modello.creaOrdine({
              riferimento: v.o_riferimento || '',
              importo: grezzo.importo === '' ? 0 : importoDa(grezzo.importo, 'Importo ordine', r.numero),
              offerta: siNoDa(grezzo.offerta, 'Offerta', r.numero),
              vpu: siNoDa(grezzo.vpu, 'VPU', r.numero)
            })
          });
          continue;
        }
        const etichetta = 'ordine ' + (v.o_riferimento || '(senza riferimento)') + ': ';
        const confronti = [
          ['importo', confrontoCosto, 'importo'],
          ['offerta', confrontoLista(Modello.SI_NO), 'offerta'],
          ['vpu', confrontoLista(Modello.SI_NO), 'vpu']
        ];
        for (const [campo, confronto, nome] of confronti) {
          const nuovo = grezzo[campo];
          const vecchio = precedente.grezzo[campo];
          if (nuovo !== '' && vecchio !== '' && confronto(nuovo) !== confronto(vecchio)) {
            conflitto(etichetta + nome, [vecchio, nuovo], vecchio);
          }
        }
      }
      return Array.from(visti.values()).map((x) => x.ordine);
    }

    const fase = scegli('fase', confrontoLista(Modello.FASI));
    let faseOk = Modello.canonico(Modello.FASI, fase.valore);
    if (!faseOk) {
      avviso(fase.riga, fase.valore === ''
        ? 'Fase mancante: impostata a Ideazione'
        : 'Fase non riconosciuta «' + fase.valore + '»: impostata a Ideazione');
      faseOk = 'Ideazione';
    }

    const dataProgetto = (campo, etichetta) => {
      const s = scegli(campo, confrontoData);
      return s.valore === '' ? '' : dataDa(s.valore, etichetta, s.riga);
    };
    const promemoria = scegli('promemoria', confrontoLista(Modello.SI_NO));

    const ordini = esteso ? ordiniEsteso() : ordiniPiatti();

    const attivita = [];
    for (const r of gruppo.righe) {
      const v = r.valori;
      if (!(v.a_descrizione || v.a_inizio || v.a_fine || v.a_stato || v.a_note)) continue;

      let stato = Modello.canonico(Modello.STATI_ATTIVITA, v.a_stato);
      if (!stato) {
        if (v.a_stato) avviso(r.numero, 'Stato attività non riconosciuto «' + v.a_stato + '»: impostato a Da avviare');
        stato = 'Da avviare';
      }
      attivita.push(Modello.creaAttivita({
        descrizione: v.a_descrizione || '',
        inizio: dataDa(v.a_inizio, 'Attività Inizio', r.numero),
        fine: dataDa(v.a_fine, 'Attività Fine', r.numero),
        stato,
        note: v.a_note || ''
      }));
    }

    const progetto = Modello.creaProgetto({
      codice,
      applicativo: scegli('applicativo').valore,
      projectManager: scegli('projectManager').valore,
      fase: faseOk,
      inizio: dataProgetto('inizio', 'Periodo Inizio'),
      fine: dataProgetto('fine', 'Periodo Fine'),
      sito: scegli('sito').valore,
      descrizione: scegli('descrizione').valore,
      note: scegli('note').valore,
      promemoria: siNoDa(promemoria.valore, 'Promemoria', promemoria.riga),
      ordini,
      attivita
    });

    Modello.validaProgetto(progetto).forEach((e) => {
      ris.errori.push({ codice, percorso: e.percorso, messaggio: e.messaggio });
    });
    return progetto;
  }

  // -> { progetti, conflitti, avvisi, errori, righe, formato }
  //    `righe` = righe di dati lette con un codice; `avvisi`/`conflitti` dicono cosa guardare
  //    prima di accettare; `errori` sono violazioni del modello (validaProgetto).
  function importa(testo) {
    const ris = { progetti: [], conflitti: [], avvisi: [], errori: [], righe: 0, formato: null };
    const righe = Csv.leggi(testo);
    if (!righe.length) {
      ris.avvisi.push({ riga: 0, messaggio: 'Il file è vuoto' });
      return ris;
    }

    const colonne = {};
    righe[0].forEach((h, i) => {
      const campo = ALIAS[nomeIntestazione(h)];
      if (campo && colonne[campo] === undefined) colonne[campo] = i;
    });
    if (colonne.codice === undefined) {
      ris.avvisi.push({ riga: 1, messaggio: 'Manca la colonna Codice: file non riconosciuto' });
      return ris;
    }
    const esteso = colonne.o_riferimento !== undefined || colonne.o_importo !== undefined;
    ris.formato = esteso ? 'esteso' : 'piatto';

    const gruppi = new Map();
    for (let n = 1; n < righe.length; n++) {
      const valori = {};
      Object.keys(colonne).forEach((campo) => {
        const cella = righe[n][colonne[campo]];
        valori[campo] = cella == null ? '' : String(cella).trim();
      });
      const codice = Codice.normalizza(valori.codice);
      if (!codice) {
        if (Object.keys(valori).some((k) => valori[k] !== '')) {
          ris.avvisi.push({ riga: n + 1, messaggio: 'Riga senza codice: ignorata' });
        }
        continue;
      }
      const k = Codice.chiave(codice);
      if (!gruppi.has(k)) gruppi.set(k, { codice, righe: [] });
      gruppi.get(k).righe.push({ numero: n + 1, valori });
      ris.righe++;
    }

    gruppi.forEach((g) => ris.progetti.push(costruisci(g, esteso, ris)));
    return ris;
  }

  // ------------------------------------------------- anteprima e applicazione

  // Cosa cambierebbe applicando `importati` a `esistenti`, senza modificare nulla.
  // -> { nuovi: [codice], aggiornati: [{ codice, differenze: [campo] }], invariati: [codice] }
  function anteprima(esistenti, importati) {
    const perChiave = new Map(esistenti.map((p) => [Codice.chiave(p.codice), p]));
    const out = { nuovi: [], aggiornati: [], invariati: [] };
    for (const p of importati) {
      const attuale = perChiave.get(Codice.chiave(p.codice));
      if (!attuale) { out.nuovi.push(p.codice); continue; }
      const differenze = Modello.differenze(attuale, p);
      if (differenze.length) out.aggiornati.push({ codice: p.codice, differenze });
      else out.invariati.push(p.codice);
    }
    return out;
  }

  // Aggiorna per codice: i progetti presenti nel file sostituiscono quelli esistenti con lo
  // stesso codice, quelli nuovi si aggiungono, gli altri restano com'erano.
  // Restituisce un nuovo elenco, `esistenti` non viene toccato.
  function applica(esistenti, importati) {
    const perChiave = new Map(importati.map((p) => [Codice.chiave(p.codice), p]));
    const usati = new Set();
    const risultato = esistenti.map((e) => {
      const k = Codice.chiave(e.codice);
      if (!perChiave.has(k)) return e;
      usati.add(k);
      return perChiave.get(k);
    });
    importati.forEach((p) => {
      const k = Codice.chiave(p.codice);
      if (!usati.has(k)) { risultato.push(p); usati.add(k); }
    });
    return risultato;
  }

  const api = { importa, anteprima, applica };

  radice.MP = radice.MP || {};
  radice.MP.importCsv = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
