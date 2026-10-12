/* Modulo di inserimento e modifica di un progetto, con i suoi ordini e le sue attivita'. */
(function (radice) {
  'use strict';

  const MP = radice.MP;
  const UI = MP.ui;
  const { h, sostituisci, euro } = UI;
  const Modello = MP.modello;
  const Importi = MP.importi;
  const Codice = MP.codice;

  const ETICHETTE = {
    codice: 'Codice', applicativo: 'Applicativo', projectManager: 'Project manager', fase: 'Fase',
    inizio: 'Data inizio', fine: 'Data fine', sito: 'Sito', descrizione: 'Descrizione', note: 'Note',
    promemoria: 'Promemoria', ordini: 'Ordini', attivita: 'Attività'
  };

  let contatore = 0;

  const selezione = (valori, scelto, attributi) => h('select', attributi,
    valori.map((v) => h('option', { value: v, selected: v === scelto }, v)));

  // Campo di primo livello: etichetta, controllo e posto per il messaggio d'errore.
  function campo(etichetta, controllo, messaggio, largo) {
    const id = 'f' + (++contatore);
    controllo.id = id;
    return h('div', { class: 'campo' + (largo ? ' largo' : '') },
      h('label', { for: id }, etichetta), controllo, messaggio);
  }

  // Campo dentro una riga di ordine o attivita'.
  function campoRiga(etichetta, controllo) {
    const id = 'f' + (++contatore);
    controllo.id = id;
    return h('div', { class: 'campo' }, h('label', { for: id }, etichetta), controllo);
  }

  function prefissoErrore(percorso) {
    let m = /^ordini\[(\d+)\]/.exec(percorso);
    if (m) return 'Ordine ' + (Number(m[1]) + 1) + ': ';
    m = /^attivita\[(\d+)\]/.exec(percorso);
    return m ? 'Attività ' + (Number(m[1]) + 1) + ': ' : '';
  }

  // `team` serve solo per aprire il progetto giusto se due team avessero lo stesso codice.
  async function apriModulo(codiceIniziale, teamIniziale) {
    const S = UI.stato;
    const voce = codiceIniziale ? UI.voce(codiceIniziale, teamIniziale) : null;
    if (codiceIniziale && !voce) {
      UI.toast('Progetto non trovato: potrebbe essere stato eliminato.', 'errore');
      return null;
    }
    // Dove non si puo' scrivere non si apre il modulo (nemmeno da tastiera).
    const scrivibili = UI.squadreScrivibili();
    if (voce ? !UI.scrivibile(voce.team) : !scrivibili.length) {
      UI.toast(S.consultazione ? 'In sola consultazione non si può modificare.' : 'Non hai il permesso di modificare qui.', 'avviso');
      return null;
    }
    const multi = UI.multi();
    const partenza = voce ? JSON.parse(JSON.stringify(voce.progetto)) : Modello.creaProgetto({});
    let revAtteso = voce ? voce.rev : null;
    let codicePrecedente = voce ? voce.progetto.codice : null;
    let daRiaprire = null;

    const campi = {};
    const messaggi = {};
    const righeOrdini = [];
    const righeAttivita = [];

    const generico = (nome, etichetta, controllo, largo) => {
      campi[nome] = controllo;
      messaggi[nome] = h('span', { class: 'errore-campo' });
      return campo(etichetta, controllo, messaggi[nome], largo);
    };

    const riepilogoErrori = h('div', { class: 'riepilogo-errori', role: 'alert', hidden: true });

    // Il team lo si sceglie solo alla creazione (tra quelli in cui si puo' scrivere): spostare un
    // progetto da un team all'altro non e' previsto.
    const campoTeam = multi
      ? generico('team', 'Team', voce
        ? h('select', { disabled: true }, h('option', { value: voce.team, selected: true }, voce.team))
        : selezione(scrivibili.map((s) => s.nome), (scrivibili.find((s) => s.nome === S.filtri.team) || scrivibili[0]).nome))
      : null;

    const griglia = h('div', { class: 'griglia-campi' },
      campoTeam,
      generico('codice', 'Codice *', h('input', { type: 'text', value: partenza.codice, autocomplete: 'off', required: true })),
      generico('applicativo', 'Applicativo', h('input', { type: 'text', value: partenza.applicativo, autocomplete: 'off' })),
      generico('projectManager', 'Project manager', h('input', { type: 'text', value: partenza.projectManager, autocomplete: 'off' })),
      generico('fase', 'Fase', selezione(Modello.FASI, partenza.fase)),
      generico('inizio', 'Data inizio', h('input', { type: 'date', value: partenza.inizio })),
      generico('fine', 'Data fine', h('input', { type: 'date', value: partenza.fine })),
      generico('promemoria', 'Promemoria', selezione(Modello.SI_NO, partenza.promemoria)),
      generico('sito', 'Sito di progetto', h('input', { type: 'text', value: partenza.sito, autocomplete: 'off', placeholder: 'https://…' })),
      generico('descrizione', 'Descrizione', h('textarea', { rows: 3 }, partenza.descrizione), true),
      generico('note', 'Note', h('textarea', { rows: 3 }, partenza.note), true));

    // ------------------------------------------------------------------ ordini
    const elencoOrdini = h('div');
    const totale = h('div', { class: 'costo-totale' });
    const vuotoOrdini = h('p', { class: 'vuoto-form' },
      'Nessun ordine: il costo del progetto è zero finché non ne aggiungi uno (di norma uno solo, a volte un secondo a capienza esaurita).');

    function aggiornaTotale() {
      let somma = 0;
      righeOrdini.forEach((r) => { const l = Importi.leggi(r.importo.value); if (l.valido) somma += l.valore; });
      totale.textContent = 'Costo totale: ' + euro(Importi.arrotonda(somma));
      totale.hidden = righeOrdini.length === 0;
      vuotoOrdini.hidden = righeOrdini.length > 0;
    }

    function aggiungiOrdine(o) {
      const r = {};
      r.riferimento = h('input', { type: 'text', value: o.riferimento, autocomplete: 'off', placeholder: 'Es. Ordine 4400123' });
      r.importo = h('input', {
        type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0,00',
        value: o.riferimento || o.importo ? Importi.formatoEuro(o.importo) : '', oninput: aggiornaTotale
      });
      r.offerta = selezione(Modello.SI_NO, o.offerta);
      r.vpu = selezione(Modello.SI_NO, o.vpu);
      r.el = h('div', { class: 'riga-form riga-ordine' },
        campoRiga('Riferimento ordine', r.riferimento), campoRiga('Importo (€)', r.importo),
        campoRiga('Offerta', r.offerta), campoRiga('VPU', r.vpu),
        h('button', { type: 'button', class: 'icona pericolo', title: 'Rimuovi ordine', 'aria-label': 'Rimuovi ordine', onclick: () => {
          righeOrdini.splice(righeOrdini.indexOf(r), 1);
          r.el.remove();
          aggiornaTotale();
        } }, '🗑️'));
      righeOrdini.push(r);
      elencoOrdini.appendChild(r.el);
      aggiornaTotale();
      return r;
    }

    // --------------------------------------------------------------- attivita'
    const elencoAttivita = h('div');
    const vuotoAttivita = h('p', { class: 'vuoto-form' }, 'Nessuna attività.');
    let crescente = true;

    function aggiornaVuotoAttivita() { vuotoAttivita.hidden = righeAttivita.length > 0; }

    function aggiungiAttivita(a) {
      const r = {};
      r.descrizione = h('input', { type: 'text', value: a.descrizione, autocomplete: 'off' });
      r.inizio = h('input', { type: 'date', value: a.inizio });
      r.fine = h('input', { type: 'date', value: a.fine });
      r.stato = selezione(Modello.STATI_ATTIVITA, a.stato);
      r.note = h('input', { type: 'text', value: a.note, autocomplete: 'off', placeholder: 'Facoltative' });
      r.el = h('div', { class: 'riga-form riga-attivita' },
        campoRiga('Descrizione', r.descrizione), campoRiga('Inizio', r.inizio), campoRiga('Fine', r.fine),
        campoRiga('Stato', r.stato),
        h('button', { type: 'button', class: 'icona pericolo', title: 'Rimuovi attività', 'aria-label': 'Rimuovi attività', onclick: async () => {
          if (!(await UI.conferma('Rimuovere l\'attività?', { titolo: 'Rimuovi attività', conferma: 'Rimuovi', pericolo: true }))) return;
          righeAttivita.splice(righeAttivita.indexOf(r), 1);
          r.el.remove();
          aggiornaVuotoAttivita();
        } }, '🗑️'),
        h('div', { class: 'nota' }, campoRiga('Note', r.note)));
      const segna = () => r.el.classList.toggle('completata', r.stato.value === 'Completata');
      r.stato.addEventListener('change', segna);
      segna();
      righeAttivita.push(r);
      elencoAttivita.appendChild(r.el);
      aggiornaVuotoAttivita();
      return r;
    }

    function ordinaAttivita() {
      const verso = crescente ? 1 : -1;
      righeAttivita.sort((a, b) => {
        const x = a.inizio.value || '9999-12-31';
        const y = b.inizio.value || '9999-12-31';
        return (x < y ? -1 : x > y ? 1 : 0) * verso;
      });
      righeAttivita.forEach((r) => elencoAttivita.appendChild(r.el));
      crescente = !crescente;
      bottoneOrdina.textContent = 'Ordina per inizio ' + (crescente ? '↑' : '↓');
    }
    const bottoneOrdina = h('button', { type: 'button', class: 'btn btn-secondario btn-piccolo', onclick: ordinaAttivita }, 'Ordina per inizio ↑');

    partenza.ordini.forEach(aggiungiOrdine);
    partenza.attivita.slice().sort((a, b) => ((a.inizio || '9999') < (b.inizio || '9999') ? -1 : 1)).forEach(aggiungiAttivita);
    aggiornaTotale();
    aggiornaVuotoAttivita();

    const contenuto = h('form', { novalidate: true, onsubmit: (e) => e.preventDefault() },
      riepilogoErrori,
      griglia,
      h('div', { class: 'sezione-form' },
        h('div', { class: 'intesta' }, h('h3', {}, 'Ordini'),
          h('button', { type: 'button', class: 'btn btn-secondario btn-piccolo', onclick: () => aggiungiOrdine(Modello.creaOrdine({})).riferimento.focus() }, '+ Aggiungi ordine')),
        elencoOrdini, vuotoOrdini, totale),
      h('div', { class: 'sezione-form' },
        h('div', { class: 'intesta' }, h('h3', {}, 'Attività'),
          h('span', {}, bottoneOrdina, ' ',
            h('button', { type: 'button', class: 'btn btn-secondario btn-piccolo', onclick: () => aggiungiAttivita(Modello.creaAttivita({})).descrizione.focus() }, '+ Aggiungi attività'))),
        elencoAttivita, vuotoAttivita));

    // ---------------------------------------------------------- lettura e errori
    function leggi() {
      const ambigui = [];
      const progetto = Modello.creaProgetto({
        codice: Codice.normalizza(campi.codice.value),
        applicativo: campi.applicativo.value.trim(),
        projectManager: campi.projectManager.value.trim(),
        fase: campi.fase.value,
        inizio: campi.inizio.value,
        fine: campi.fine.value,
        sito: campi.sito.value.trim(),
        descrizione: campi.descrizione.value.trim(),
        note: campi.note.value.trim(),
        promemoria: campi.promemoria.value,
        ordini: righeOrdini.map((r, i) => {
          const letto = Importi.leggi(r.importo.value);
          if (letto.valido && letto.ambiguo) ambigui.push({ indice: i, testo: r.importo.value.trim(), valore: letto.valore });
          return {
            riferimento: r.riferimento.value.trim(),
            importo: letto.valido ? letto.valore : NaN,
            offerta: r.offerta.value,
            vpu: r.vpu.value
          };
        }),
        attivita: righeAttivita.map((r) => ({
          descrizione: r.descrizione.value.trim(),
          inizio: r.inizio.value,
          fine: r.fine.value,
          stato: r.stato.value,
          note: r.note.value.trim()
        }))
      });
      return { progetto, ambigui };
    }

    const firma = () => JSON.stringify(leggi().progetto, (k, v) => (typeof v === 'number' && Number.isNaN(v) ? 'NaN' : v));

    function elementoPer(percorso) {
      if (campi[percorso]) return campi[percorso];
      let m = /^ordini\[(\d+)\]\.(\w+)$/.exec(percorso);
      if (m && righeOrdini[m[1]]) return righeOrdini[m[1]][m[2]];
      m = /^attivita\[(\d+)\]\.(\w+)$/.exec(percorso);
      if (m && righeAttivita[m[1]]) return righeAttivita[m[1]][m[2]];
      return null;
    }

    function pulisciErrori() {
      contenuto.querySelectorAll('.invalido').forEach((el) => { el.classList.remove('invalido'); el.removeAttribute('aria-invalid'); });
      Object.values(messaggi).forEach((s) => { s.textContent = ''; });
      sostituisci(riepilogoErrori);
      riepilogoErrori.hidden = true;
    }

    function mostraErrori(errori) {
      pulisciErrori();
      if (!errori.length) return;
      let primo = null;
      const voci = errori.map((e) => {
        const el = elementoPer(e.percorso);
        if (el) {
          el.classList.add('invalido');
          el.setAttribute('aria-invalid', 'true');
          primo = primo || el;
        }
        if (messaggi[e.percorso]) messaggi[e.percorso].textContent = e.messaggio;
        return h('li', {}, prefissoErrore(e.percorso) + e.messaggio);
      });
      sostituisci(riepilogoErrori,
        h('strong', {}, errori.length === 1 ? 'C\'è un problema da correggere:' : 'Ci sono ' + errori.length + ' problemi da correggere:'),
        h('ul', {}, voci));
      riepilogoErrori.hidden = false;
      riepilogoErrori.scrollIntoView({ block: 'nearest' });
      if (primo) primo.focus();
    }

    // ------------------------------------------------------------- salvataggio
    // Team in cui si salva: quello del progetto esistente, oppure quello scelto nel modulo.
    const teamDiSalvataggio = () => (voce ? voce.team : (multi ? campi.team.value : undefined));

    async function tentaSalvataggio(progetto) {
      try {
        const esito = await S.adapter.salva(progetto, { revAtteso, codicePrecedente, team: teamDiSalvataggio() });
        UI.registraVoce(esito, codicePrecedente);
        UI.toast('Progetto ' + esito.progetto.codice + ' salvato', 'ok');
        UI.aggiorna();
        return true;
      } catch (e) {
        if (e && e.name === 'ConflittoDiVersione') return risolviConflitto(e, progetto);
        if (UI.gestisciErroreScrittura(e)) return false; // il modulo resta aperto, con le modifiche
        UI.toast('Salvataggio non riuscito: ' + (e && e.message), 'errore');
        return false;
      }
    }

    async function risolviConflitto(e, progetto) {
      if (e.motivo === 'codice-esistente') {
        mostraErrori([{ percorso: 'codice', messaggio: 'Esiste già un progetto con questo codice (creato da un altro utente).' }]);
        return false;
      }
      const eliminato = e.motivo === 'eliminato';
      const cambiati = e.attuale ? Modello.differenze(partenza, e.attuale).map((k) => ETICHETTE[k] || k) : [];
      const scelta = await UI.dialogo({
        titolo: eliminato ? 'Progetto eliminato da un altro utente' : 'Progetto modificato da un altro utente',
        larghezza: 'min(560px, 96vw)',
        contenuto: h('div', {},
          h('p', {}, eliminato
            ? 'Mentre lavoravi, qualcuno ha eliminato questo progetto.'
            : 'Mentre lavoravi, qualcuno ha salvato una versione diversa di questo progetto.'),
          cambiati.length ? h('p', {}, 'Campi cambiati dall\'altro utente: ', h('strong', {}, cambiati.join(', ')), '.') : null,
          h('p', { class: 'tenue' }, 'Se sovrascrivi, le sue modifiche vanno perse (restano solo nel backup della cartella).')),
        pulsanti: [
          { testo: 'Annulla', valore: 'annulla' },
          { testo: eliminato ? 'Chiudi e ricarica' : 'Ricarica la versione attuale', valore: 'ricarica' },
          { testo: eliminato ? 'Ricrea con le mie modifiche' : 'Sovrascrivi con le mie', classe: 'btn-pericolo', valore: 'sovrascrivi' }
        ]
      }).finita;

      if (scelta === 'sovrascrivi') {
        revAtteso = eliminato ? null : e.revAttuale;
        if (eliminato) codicePrecedente = null;
        return tentaSalvataggio(progetto);
      }
      if (scelta === 'ricarica') {
        daRiaprire = codicePrecedente || progetto.codice;
        d.chiudi('ricaricato');
      }
      return false;
    }

    async function salva() {
      const { progetto, ambigui } = leggi();
      // Un importo che non si e' potuto leggere ha un messaggio piu' utile di quello generico del modello.
      const importoNonLetto = (i) => Number.isNaN(progetto.ordini[i].importo);
      const errori = Modello.validaProgetto(progetto).filter((x) => {
        const m = /^ordini\[(\d+)\]\.importo$/.exec(x.percorso);
        return !(m && importoNonLetto(Number(m[1])));
      });
      progetto.ordini.forEach((o, i) => {
        if (importoNonLetto(i)) {
          errori.push({ percorso: 'ordini[' + i + '].importo', messaggio: 'Importo non valido: usa cifre e la virgola per i decimali (es. 1.250,50)' });
        }
      });
      // L'unicita' si controlla dentro il team (la cartella del team la fa rispettare comunque).
      const delTeam = S.voci.filter((v) => v.team === teamDiSalvataggio() || !multi).map((v) => v.progetto);
      if (progetto.codice && Modello.trovaDuplicato(progetto.codice, delTeam, codicePrecedente)) {
        errori.push({ percorso: 'codice', messaggio: 'Esiste già un progetto con il codice «' + progetto.codice + '»' });
      }
      mostraErrori(errori);
      if (errori.length) return false;

      // Un team ancora vuoto: l'app non crea le cartelle dei team (le crea chi ha i permessi su
      // SharePoint), ma dentro quella del team crea progetti/ e backup/: meglio chiederlo.
      if (multi && !voce) {
        const squadra = S.adapter.squadre().find((s) => s.nome === teamDiSalvataggio());
        if (squadra && squadra.nuova) {
          const ok = await UI.conferma('Il team «' + squadra.nome + '» non ha ancora progetti.\nCreo qui le cartelle progetti e backup?',
            { titolo: 'Prima scrittura nel team', conferma: 'Crea e salva', annulla: 'Annulla' });
          if (!ok) return false;
        }
      }

      for (const a of ambigui) {
        const ok = await UI.conferma('«' + a.testo + '» può significare mille o uno.\nL\'ho letto come ' + euro(a.valore) + '. È corretto?',
          { titolo: 'Controlla l\'importo', conferma: 'Sì, è corretto', annulla: 'Correggi' });
        if (!ok) { elementoPer('ordini[' + a.indice + '].importo').focus(); return false; }
      }
      return tentaSalvataggio(progetto);
    }

    const base = firma();
    const confermaChiusura = async () => firma() === base || UI.conferma(
      'Ci sono modifiche non salvate. Chiudere senza salvare?',
      { titolo: 'Modifiche non salvate', conferma: 'Chiudi senza salvare', annulla: 'Continua a modificare', pericolo: true });

    const d = UI.dialogo({
      titolo: voce ? 'Modifica ' + voce.progetto.codice : 'Nuovo progetto',
      contenuto,
      larghezza: 'min(1000px, 97vw)',
      puoChiudere: confermaChiusura,
      pulsanti: [
        { testo: 'Annulla', valore: 'annulla', azione: confermaChiusura },
        { testo: 'Salva progetto', classe: 'btn-ok', valore: 'salvato', azione: salva }
      ]
    });
    (voce ? campi.applicativo : campi.codice).focus();

    const esito = await d.finita;
    if (esito === 'ricaricato') {
      await UI.ricarica();
      if (UI.voce(daRiaprire, teamDiSalvataggio())) return apriModulo(daRiaprire, teamDiSalvataggio());
      UI.toast('Il progetto non esiste più nell\'archivio.', 'avviso');
    }
    return esito;
  }

  UI.apriModulo = apriModulo;
  UI.etichetteCampi = ETICHETTE;
})(window);
