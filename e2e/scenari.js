'use strict';
// Scenari end-to-end: usano l'applicazione vera in un browser vero.
// Ogni scenario riceve `t` (vedi esegui.js) e dichiara le sue verifiche con t.verifica().

const fs = require('node:fs');
const path = require('node:path');
const { RADICE, urlFile, aiutiOpfs } = require('./lib.js');

const fixture = (nome) => fs.readFileSync(path.join(RADICE, 'test', 'fixtures', nome), 'utf8');

module.exports = {
  // ------------------------------------------------------------------------ avvio
  async smoke(t) {
    const { b, a } = await t.apri(urlFile('?demo'));
    await b.attendi("!!document.querySelector('#contenuto table.dati tbody tr')", 8000);

    t.verifica(await b.valuta("document.querySelectorAll('#tabella-progetti tbody tr').length") === 10, 'la tabella mostra i 10 progetti di esempio');
    const kpi = await b.valuta("[...document.querySelectorAll('.indicatore')].map(e=>e.innerText.replace(/\\n/g,': ')).join(' | ')");
    t.verifica(kpi.includes('COSTO TOTALE: 50.600,00 €') && kpi.includes('VPU DA EMETTERE: 2'), 'indicatori: costo 50.600,00 € e 2 VPU da emettere (' + kpi + ')');
    t.verifica(await b.valuta("typeof Chart") === 'function' && await b.valuta("typeof window.jspdf") === 'object', 'librerie locali caricate (Chart.js, jsPDF)');
    await b.sleep(300);
    await b.schermata('01-riepilogo', true);

    for (const [i, nome] of [[1, 'vpu'], [2, 'scadenze'], [3, 'fte']]) {
      await b.valuta(`document.querySelectorAll('.scheda')[${i}].click()`);
      await b.sleep(200);
      t.verifica(await b.valuta("document.querySelector('#contenuto').innerText.length") > 100, 'la vista «' + nome + '» si disegna');
      await b.schermata('02-' + nome, true);
    }
    t.nessunErrore(b);
  },

  // Un clic sulla legenda dei grafici e' un clic sul filtro per fase: il numero al centro,
  // gli indicatori, l'altro grafico e la tabella si ricalcolano insieme.
  async grafici(t) {
    const { b, a } = await t.apri(urlFile('?demo'));
    await b.attendi("!!document.querySelector('#tabella-progetti tbody tr')", 8000);

    const centro = (grafico) => b.valuta(`Chart.getChart(document.querySelectorAll('.grafico canvas')[${grafico}]).options.plugins.testoCentrale.testo`);
    const righe = () => b.valuta("document.querySelectorAll('#tabella-progetti tbody tr').length");
    const progettiKpi = () => b.valuta("document.querySelector('.indicatore .valore').innerText");
    const menuFasi = () => b.valuta("document.querySelector('.menu-fasi summary').textContent.trim()");
    const barrata = (grafico, fase) => b.valuta(`Chart.getChart(document.querySelectorAll('.grafico canvas')[${grafico}]).legend.legendItems.find(x=>x.text===${JSON.stringify(fase)}).hidden`);
    const stato = async () => JSON.stringify([await centro(0), await centro(1), await righe(), await progettiKpi(), await menuFasi()]);
    const clicLegenda = async (fase, grafico) => {
      const pos = await b.valuta(`(()=>{const tela=document.querySelectorAll('.grafico canvas')[${grafico || 0}];tela.scrollIntoView({block:'center'});const c=Chart.getChart(tela);const i=c.legend.legendItems.findIndex(x=>x.text===${JSON.stringify(fase)});if(i<0)return null;const h=c.legend.legendHitBoxes[i];const r=tela.getBoundingClientRect();return {x:r.left+h.left+h.width/2,y:r.top+h.top+h.height/2}})()`);
      if (!pos) throw new Error('voce di legenda non trovata: ' + fase);
      await b.clicca(pos.x, pos.y);
      await b.sleep(250); // il grafico si ridisegna subito dopo il clic
    };

    t.verifica(await stato() === JSON.stringify(['10', '50.600,00 €', 10, '10', 'Tutte le fasi ▾']), 'all\'inizio: 10 progetti, 50.600,00 €, tutte le fasi');

    // nascondere una fase: Esercizio vale 4 progetti e 20.100,00 €
    await clicLegenda('Esercizio');
    t.verifica(await stato() === JSON.stringify(['6', '30.500,00 €', 6, '6 di 10', '6 fasi ▾']),
      'nascondendo Esercizio il numero al centro scende a 6 e il costo a 30.500,00 €, come tabella e indicatori');
    t.verifica(await b.valuta("document.querySelectorAll('.menu-fasi input[type=checkbox]')[6].checked") === false
      && await b.valuta("document.querySelectorAll('.menu-fasi input[type=checkbox]')[5].checked") === true, 'il menu delle fasi segue la legenda');
    t.verifica(await barrata(0, 'Esercizio') === true && await barrata(1, 'Esercizio') === true, 'la voce resta in legenda, barrata, su entrambi i grafici');
    await b.schermata('23-grafici-legenda', true);

    // si può cliccare la legenda dell'altro grafico: i due grafici restano coerenti
    await clicLegenda('Sviluppo', 1);
    t.verifica(await stato() === JSON.stringify(['5', '22.500,00 €', 5, '5 di 10', '5 fasi ▾']) && await barrata(0, 'Sviluppo') === true,
      'un clic sulla legenda dell\'altro grafico aggiorna entrambi (5 progetti, 22.500,00 €)');

    // riattivare
    await clicLegenda('Esercizio', 1);
    t.verifica(await stato() === JSON.stringify(['9', '42.600,00 €', 9, '9 di 10', '6 fasi ▾']), 'riattivando Esercizio i numeri risalgono (9 progetti, 42.600,00 €)');
    await clicLegenda('Sviluppo');
    t.verifica(await stato() === JSON.stringify(['10', '50.600,00 €', 10, '10', 'Tutte le fasi ▾']), 'con tutte le fasi attive il filtro torna vuoto («tutte»)');

    // l'ultima fase selezionata non si può nascondere
    await b.valuta("document.querySelector('.menu-fasi summary').click()");
    await b.valuta("document.querySelectorAll('.menu-fasi input[type=checkbox]')[1].click()"); // solo Avvio
    await b.sleep(200);
    t.verifica(await centro(0) === '1' && await righe() === 1, 'dal menu: solo Avvio, un progetto');
    await clicLegenda('Avvio');
    t.verifica(await centro(0) === '1' && await menuFasi() === 'Avvio ▾' && (await b.valuta("document.getElementById('toasts').innerText")).includes('almeno una fase'),
      'l\'ultima fase selezionata non si nasconde e l\'app lo spiega');

    // insieme alla ricerca: la legenda mostra le fasi dei progetti che passano la ricerca
    await b.valuta("document.querySelector('.menu-fasi input[type=checkbox]:checked').click()"); // deseleziona Avvio: filtro vuoto
    await b.valuta("(()=>{const i=document.querySelector('input[type=search]');i.value='neri';i.dispatchEvent(new Event('input'))})()");
    await b.sleep(200);
    t.verifica(await centro(0) === '4' && await righe() === 4, 'ricerca «neri»: 4 progetti');
    await clicLegenda('Esercizio');
    t.verifica(await centro(0) === '2' && await righe() === 2, 'ricerca e legenda insieme: nascondendo Esercizio restano 2 progetti');
    t.nessunErrore(b);
  },

  async avvio(t) {
    const base = await t.http();
    const { b } = await t.apri(base + '?opfs');
    await b.attendi("!!document.querySelector('#contenuto')", 8000);
    await b.sleep(500); // lascia salvare la cartella ricordata

    await b.naviga(base);
    await b.attendi("!!document.querySelector('.avvio')", 8000);
    await b.sleep(300);
    let testo = await b.valuta("document.getElementById('radice').innerText");
    t.verifica(testo.includes('Apri la cartella dei dati') && testo.includes('Prova con dati di esempio'), 'schermata iniziale con i percorsi di apertura');
    t.verifica(testo.includes('Riapri «monitoraggio-dev»'), 'propone di riaprire l\'ultima cartella');
    await b.schermata('15-avvio');

    await b.valuta("[...document.querySelectorAll('button')].find(x=>x.textContent.startsWith('Riapri')).click()");
    await b.attendi("!!document.querySelector('#contenuto')", 8000);
    t.verifica(await b.valuta('MP.ui.stato.modalita') === 'cartella', '«Riapri» apre la cartella ricordata');

    await b.valuta("[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Cambia cartella').click()");
    await b.attendi("!!document.querySelector('.avvio')", 5000);
    t.verifica(await b.valuta('MP.ui.stato.adapter') === null, '«Cambia cartella» torna alla schermata iniziale');

    await b.valuta("[...document.querySelectorAll('button')].find(x=>x.textContent.includes('dati di esempio')).click()");
    await b.attendi("!!document.querySelector('#contenuto table.dati tbody tr')", 8000);
    t.verifica(await b.valuta('MP.ui.stato.modalita') === 'demo' && await b.valuta('MP.ui.stato.voci.length') === 10, 'dati di esempio: modalità demo con 10 progetti');
    await b.valuta("[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Esci').click()");
    await b.attendi("!!document.querySelector('.avvio')", 5000);

    await b.valuta('delete window.showDirectoryPicker; MP.ui.avvia(); true');
    await b.sleep(400);
    testo = await b.valuta("document.getElementById('radice').innerText");
    t.verifica(testo.includes('Usa Microsoft Edge o Google Chrome') && !testo.includes('Apri la cartella dei dati') && testo.includes('dati di esempio'),
      'browser senza accesso alle cartelle: messaggio chiaro e dati di esempio ancora disponibili');
    await b.schermata('16-browser-non-supportato');
    t.nessunErrore(b, /favicon/);
  },

  // --------------------------------------------------------------- uso quotidiano
  async interazioni(t) {
    const { b, a } = await t.apri(urlFile('?demo'));
    await b.attendi("!!document.querySelector('#contenuto table.dati tbody tr')", 8000);

    // dettaglio
    await b.valuta(a.righeCon('EVO-26-003') + '.click()');
    await a.dialoghi(1);
    await b.sleep(150);
    await b.schermata('03-dettaglio');
    t.verifica((await a.testoDialogo()).includes('Prova 4'), 'il dettaglio mostra anche il secondo ordine');

    // modulo: errori di validazione
    await a.clic('Modifica');
    await b.attendi("document.querySelector('dialog[open] h2').textContent.startsWith('Modifica')");
    await b.schermata('04-modulo');
    await a.campo('Importo (€)', 'abc');
    await a.campo('Codice *', '');
    await a.clic('Salva progetto');
    await b.sleep(250);
    const errori = await b.valuta("document.querySelector('dialog[open] .riepilogo-errori').innerText");
    t.verifica(errori.includes('codice è obbligatorio') && errori.includes('Importo non valido'), 'validazione: codice obbligatorio e importo non leggibile');
    t.verifica(await b.valuta("document.querySelectorAll('dialog[open] .invalido').length") >= 2, 'i campi sbagliati sono evidenziati');
    await b.schermata('05-modulo-errori');

    // codice già usato (maiuscole e spazi diversi) e importo ambiguo
    await a.campo('Codice *', ' evo-26-001 ');
    await a.campo('Importo (€)', '2.500');
    await a.clic('Salva progetto');
    await b.sleep(250);
    t.verifica((await b.valuta("document.querySelector('dialog[open] .riepilogo-errori').innerText")).includes('Esiste già un progetto con il codice'),
      'il codice è univoco anche con maiuscole e spazi diversi');
    await a.campo('Codice *', 'EVO-26-003');
    await a.clic('Salva progetto');
    await a.dialoghi(2);
    t.verifica((await a.testoDialogo(1)).includes('può significare mille o uno'), 'un importo ambiguo (2.500) chiede conferma');
    await b.schermata('06-conferma-ambiguo');
    await a.clic('Sì, è corretto');
    await a.dialoghi(0);
    t.verifica(await a.stato("MP.ui.voce('EVO-26-003').rev") === 2 && await a.stato("MP.ui.voce('EVO-26-003').progetto.ordini[0].importo") === 2500, 'salvato: revisione 2, importo 2.500');

    // nuovo progetto
    await a.clic('+ Nuovo progetto');
    await a.dialoghi(1);
    await a.campo('Codice *', 'EVO-26-050');
    await a.campo('Applicativo', 'NUOVA APP');
    await a.campo('Fase', 'Sviluppo');
    await a.clic('+ Aggiungi ordine');
    await b.valuta("(()=>{const i=document.querySelector('dialog[open] .riga-ordine').querySelectorAll('input');i[0].value='Ordine X';i[0].dispatchEvent(new Event('input'));i[1].value='1.250,50';i[1].dispatchEvent(new Event('input'))})()");
    await a.clic('+ Aggiungi attività');
    await b.valuta("document.querySelector('dialog[open] .riga-attivita').querySelectorAll('input')[0].value='Prima attività'");
    await b.sleep(120);
    await b.schermata('07-nuovo');
    t.verifica((await b.valuta("document.querySelector('dialog[open] .costo-totale').innerText")).includes('1.250,50'), 'il costo totale è la somma degli ordini');
    await a.clic('Salva progetto');
    await a.dialoghi(0);
    t.verifica(await a.stato('S.voci.length') === 11 && await a.stato("MP.ui.voce('evo-26-050').rev") === 1, 'nuovo progetto salvato con revisione 1');

    // modifiche non salvate
    await b.valuta("(()=>{MP.ui.apriModulo('EVO-26-050');return true})()");
    await a.dialoghi(1);
    await a.campo('Note', 'modifica non salvata');
    await a.clic('Annulla');
    await a.dialoghi(2);
    t.verifica((await a.testoDialogo(1)).includes('modifiche non salvate'), 'chiudendo con modifiche non salvate chiede conferma');
    await a.clic('Chiudi senza salvare');
    await a.dialoghi(0);
    t.verifica(await a.stato("MP.ui.voce('EVO-26-050').progetto.note") === '', 'le modifiche scartate non sono state salvate');

    // import con conflitto
    await a.intercettaSelettoreFile();
    await a.scegliFile('legacy.csv', fixture('legacy-conflitto-codice.csv'));
    await a.dialoghi(1);
    await b.sleep(200);
    await b.schermata('08-import-anteprima');
    const anteprima = await a.testoDialogo();
    t.verifica(anteprima.includes('Conflitti') && anteprima.includes('Prova 4'), 'anteprima import: il conflitto sul riferimento ordine è mostrato');
    const importa = "[...document.querySelectorAll('dialog[open] button')].find(x=>x.textContent.startsWith('Importa '))";
    t.verifica(await b.valuta(importa + '.disabled') === true, 'l\'import è bloccato finché non si riconoscono i conflitti');
    await b.valuta("document.querySelector('dialog[open] input[type=checkbox]').click()");
    t.verifica(await b.valuta(importa + '.disabled') === false, 'l\'import si abilita dopo aver riconosciuto i conflitti');
    await a.clic('Importa 3 progetti');
    await a.dialoghi(0);
    t.verifica(await a.stato("MP.ui.voce('EVO-26-003').progetto.ordini.length") === 1, 'EVO-26-003 sostituito dal file (un solo ordine)');

    // impostazioni
    await a.clic('⚙ Impostazioni');
    await a.dialoghi(1);
    await a.campo('FTE per progetto (tra 0 e 1)', '0,35');
    await a.campo('Destinatari delle email di richiesta VPU', 'uno@esempio.it\ndue@esempio.it, tre@esempio.it');
    await b.schermata('09-impostazioni');
    await a.clic('Salva');
    await a.dialoghi(0);
    t.verifica(await a.stato('MP.ui.config().fteProgetto') === 0.35 && await a.stato('MP.ui.config().destinatariVpu.length') === 3, 'impostazioni salvate: FTE 0,35 e 3 destinatari');

    // elimina
    const prima = await a.stato('S.voci.length');
    await b.valuta(a.righeCon('EVO-26-050') + ".querySelector('button.pericolo').click()");
    await a.dialoghi(1);
    await a.clic('Elimina');
    await a.dialoghi(0);
    await b.attendi('MP.ui.stato.voci.length === ' + (prima - 1), 3000).catch(() => {});
    t.verifica(await a.stato('S.voci.length') === prima - 1 && await a.stato("MP.ui.voce('EVO-26-050')") === null, 'progetto eliminato');

    // ricerca e filtro per fase
    await b.valuta("(()=>{const i=document.querySelector('input[type=search]');i.value='\"ordine 4400123\"';i.dispatchEvent(new Event('input'))})()");
    t.verifica(await b.valuta("document.querySelectorAll('#tabella-progetti tbody tr').length") === 1, 'la ricerca per frase esatta trova un solo progetto');
    await b.valuta("(()=>{const i=document.querySelector('input[type=search]');i.value='';i.dispatchEvent(new Event('input'))})()");
    await b.valuta("document.querySelector('.menu-fasi summary').click()");
    await b.valuta("document.querySelectorAll('.menu-fasi input[type=checkbox]')[6].click()");
    await b.sleep(150);
    t.verifica((await b.valuta("document.querySelector('.menu-fasi summary').textContent")).includes('Esercizio'), 'il filtro per fase si applica');
    await b.schermata('10-filtro-fase');
    t.nessunErrore(b);
  },

  async esportazioni(t) {
    const { b, a } = await t.apri(urlFile('?demo'));
    await b.attendi("!!document.querySelector('#contenuto table.dati tbody tr')", 8000);
    await a.intercettaFile();

    await a.clic('PDF riepilogo');
    let pdf = await a.prossimoFile();
    t.verifica(pdf.slice(0, 5).toString() === '%PDF-' && pdf.length < 400000, 'PDF riepilogo valido e leggero (' + pdf.length + ' byte)');
    fs.mkdirSync(path.join(__dirname, 'risultati'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'risultati', 'riepilogo.pdf'), pdf);

    await b.valuta(a.righeCon('EVO-26-004') + '.click()');
    await a.dialoghi(1);
    await a.clic('PDF');
    pdf = await a.prossimoFile();
    t.verifica(pdf.slice(0, 5).toString() === '%PDF-', 'PDF della scheda progetto');
    fs.writeFileSync(path.join(__dirname, 'risultati', 'scheda.pdf'), pdf);
    await a.clic('Chiudi');

    await b.valuta("document.querySelectorAll('.scheda')[2].click()");
    await a.clic('PDF');
    pdf = await a.prossimoFile();
    t.verifica(pdf.slice(0, 5).toString() === '%PDF-', 'PDF delle scadenze');
    fs.writeFileSync(path.join(__dirname, 'risultati', 'scadenze.pdf'), pdf);

    await b.valuta("document.querySelectorAll('.scheda')[1].click()");
    await a.clic('PDF');
    pdf = await a.prossimoFile();
    t.verifica(pdf.slice(0, 5).toString() === '%PDF-', 'PDF dei VPU da emettere');
    fs.writeFileSync(path.join(__dirname, 'risultati', 'vpu.pdf'), pdf);

    await b.valuta("document.querySelectorAll('.scheda')[0].click()");
    await a.clic('Esporta CSV');
    const csv = await a.prossimoFile();
    t.verifica(csv.slice(0, 3).toString('hex') === 'efbbbf', 'CSV in UTF-8 con BOM (si apre bene in Excel)');
    const testo = csv.toString('utf8').replace(/^﻿/, '');
    t.verifica(testo.startsWith('"Codice";"Applicativo"') && testo.includes('Prova 4'), 'CSV nel formato esteso, con entrambi gli ordini di EVO-26-003');

    const esito = await b.valuta(`(()=>{const r=MP.importCsv.importa(${JSON.stringify(testo)});const a=MP.importCsv.anteprima(MP.ui.progetti(),r.progetti);return {n:r.progetti.length,inv:a.invariati.length,agg:a.aggiornati.length,confl:r.conflitti.length,avv:r.avvisi.length,err:r.errori.length}})()`);
    t.verifica(esito.n === 10 && esito.inv === 10 && esito.agg === 0 && esito.confl === 0 && esito.avv === 0 && esito.err === 0,
      'il CSV esportato si reimporta senza differenze (' + JSON.stringify(esito) + ')');
    t.nessunErrore(b);
  },

  // ------------------------------------------------------------ cartella condivisa
  // Usa la cartella privata del browser (OPFS), che ha la stessa API della cartella condivisa.
  async cartella(t) {
    const base = await t.http();
    const { b, a } = await t.apri(base + '?opfs');
    const { pronta, elenca, leggiJson, scrivi } = aiutiOpfs(b);

    // cartella nuova
    await pronta();
    t.verifica(await a.stato('S.modalita') === 'cartella' && await a.stato('S.adapter.nuova') === true, 'una cartella vuota è riconosciuta come nuova');
    t.verifica((await b.valuta("document.getElementById('banner').innerText")).includes('Cartella nuova'), 'banner «Cartella nuova»');
    await b.schermata('11-cartella-nuova');

    // import: i file nascono nella cartella
    await a.intercettaSelettoreFile();
    await a.scegliFile('legacy.csv', fixture('legacy-conflitto-codice.csv'));
    await a.dialoghi(1);
    await b.valuta("document.querySelector('dialog[open] input[type=checkbox]').click()");
    await a.clic('Importa 3 progetti');
    await a.dialoghi(0);
    await b.sleep(250);
    t.verifica(JSON.stringify(await elenca(['progetti'])) === JSON.stringify(['EVO-26-001.json', 'EVO-26-002.json', 'EVO-26-003.json']), 'un file per progetto in progetti/');
    const f1 = await leggiJson(['progetti', 'EVO-26-001.json']);
    t.verifica(f1.schemaVersion === 1 && f1.rev === 1 && f1.progetto.ordini[0].importo === 10000, 'il file contiene schema, revisione 1 e importo numerico');

    // persistenza
    await b.naviga(base + '?opfs');
    await pronta();
    await b.attendi('MP.ui.stato.voci.length===3', 5000);
    t.verifica(await a.stato('S.adapter.nuova') === false, 'dopo il ricaricamento i 3 progetti sono ancora lì');

    // impostazioni persistenti
    await a.clic('⚙ Impostazioni');
    await a.dialoghi(1);
    await a.campo('FTE per progetto (tra 0 e 1)', '0,3');
    await a.clic('Salva');
    await a.dialoghi(0);
    t.verifica((await leggiJson(['config.json'])).fteProgetto === 0.3, 'config.json scritto con FTE 0,3');
    await b.naviga(base + '?opfs');
    await pronta();
    await b.attendi('MP.ui.stato.voci.length===3', 5000);
    t.verifica(await a.stato('MP.ui.config().fteProgetto') === 0.3, 'l\'impostazione si ritrova dopo il ricaricamento');

    // conflitto di versione con un collega
    await b.valuta("(()=>{MP.ui.apriModulo('EVO-26-001');return true})()");
    await a.dialoghi(1);
    await a.campo('Note', 'la mia nota');
    const doc = await leggiJson(['progetti', 'EVO-26-001.json']);
    doc.rev = 2; doc.progetto.note = 'nota del collega';
    await scrivi(['progetti', 'EVO-26-001.json'], doc);
    await a.clic('Salva progetto');
    await a.dialoghi(2);
    const conflitto = await a.testoDialogo(1);
    t.verifica(conflitto.includes('modificato da un altro utente') && conflitto.includes('Note'), 'conflitto di versione: avviso e campo cambiato');
    await b.schermata('12-conflitto-versione');
    await a.clic('Sovrascrivi con le mie');
    await a.dialoghi(0);
    await b.sleep(250);
    const f2 = await leggiJson(['progetti', 'EVO-26-001.json']);
    t.verifica(f2.rev === 3 && f2.progetto.note === 'la mia nota', 'sovrascritto: revisione 3 con la mia nota');
    const giorno = await b.valuta('MP.ui.oggiIso()');
    t.verifica((await leggiJson(['backup', giorno, 'EVO-26-001.json'])).progetto.note === 'nota del collega', 'il backup conserva la versione del collega');

    // copia di conflitto di OneDrive
    const d2 = await leggiJson(['progetti', 'EVO-26-002.json']);
    d2.progetto.note = 'versione del collega (copia)';
    d2.progetto.applicativo = 'SITO ACME NUOVO';
    await scrivi(['progetti', 'EVO-26-002-PC-COLLEGA.json'], d2);
    await a.clic('↻ Aggiorna');
    await b.attendi("document.getElementById('banner').innerText.includes('copia di conflitto')", 5000);
    t.verifica(await a.stato('S.copieConflitto.length') === 1 && await a.stato('S.voci.length') === 3, 'la copia di conflitto è segnalata e non conta come progetto');
    await a.clic('Risolvi…');
    await a.dialoghi(1);
    await b.sleep(120);
    await b.schermata('13-copie-conflitto');
    await a.clic('Usa la copia al posto dell\'originale');
    await a.dialoghi(0);
    await b.sleep(350);
    t.verifica(await a.stato('S.copieConflitto.length') === 0, 'copia risolta: il banner sparisce');
    t.verifica(await a.stato("MP.ui.voce('EVO-26-002').progetto.applicativo") === 'SITO ACME NUOVO' && await a.stato("MP.ui.voce('EVO-26-002').rev") === 2, 'la copia è diventata la versione corrente (revisione 2)');
    t.verifica(!(await elenca(['progetti'])).includes('EVO-26-002-PC-COLLEGA.json'), 'il file della copia è sparito da progetti/');

    // file rovinato
    await b.valuta("__scrivi(['progetti','rotto.json'], '{ non e json')");
    await a.clic('↻ Aggiorna');
    await b.attendi("document.getElementById('banner').innerText.includes('non leggibil')", 5000);
    t.verifica((await b.valuta("document.getElementById('banner').innerText")).includes('rotto.json') && await a.stato('S.voci.length') === 3, 'un file rovinato è segnalato e gli altri progetti restano');
    await b.schermata('14-file-rovinato');
    await b.valuta("(async()=>{const d=await __dir(['progetti']);await d.removeEntry('rotto.json')})()");

    // eliminazione con backup
    await a.clic('↻ Aggiorna');
    await b.valuta(a.righeCon('EVO-26-003') + ".querySelector('button.pericolo').click()");
    await a.dialoghi(1);
    await a.clic('Elimina');
    await a.dialoghi(0);
    await b.attendi('MP.ui.stato.voci.length===2', 4000);
    t.verifica(!(await elenca(['progetti'])).includes('EVO-26-003.json'), 'eliminazione: il file sparisce da progetti/');
    t.verifica((await elenca(['backup', giorno])).includes('EVO-26-003.eliminato.json'), 'eliminazione: l\'ultima versione resta nel backup');
    t.nessunErrore(b, /favicon/);
  },

  // ------------------------------------------------------------------- più team
  // Una cartella con una sottocartella per team, come nella libreria SharePoint con i permessi
  // per cartella. Le situazioni di permesso (sola lettura, cartella non accessibile) si simulano
  // facendo rifiutare le operazioni dal browser, perché l'OPFS non ha permessi.
  async team(t) {
    const base = await t.http();
    const { b, a } = await t.apri(base + '?opfs');
    const o = aiutiOpfs(b);
    const Modello = require('../src/domain/modello.js');
    const doc = (p) => ({ schemaVersion: 1, rev: 1, progetto: Modello.creaProgetto(p) });
    const ordine = (riferimento, importo, vpu) => ({ riferimento, importo, offerta: 'SI', vpu });

    // Si preparano i team sul disco e si riapre l'app.
    await o.pronta();
    const seme = {
      Energia: [
        { codice: 'E-1', applicativo: 'SERVIZIO TERMICO', projectManager: 'Verdi', fase: 'Esercizio', inizio: '2024-03-01', fine: '2025-01-31', descrizione: 'Servizio termico', ordini: [ordine('Ordine E1', 10000, 'NO')] },
        { codice: 'E-2', applicativo: 'PROGRAMMA P', projectManager: 'Neri', fase: 'Sviluppo', inizio: '2025-03-01', descrizione: 'ERP', ordini: [ordine('Ordine E2', 2000, 'NO')],
          attivita: [{ descrizione: 'Sviluppo', inizio: '2025-03-01', fine: '2025-06-30', stato: 'In corso', note: '' }] }
      ],
      Portali: [{ codice: 'P-1', applicativo: 'SITO ACME', projectManager: 'Bianchi', fase: 'Collaudo', inizio: '2026-01-10', descrizione: 'Accessibilità', ordini: [ordine('Ordine P1', 5000, 'NO')] }],
      ERP: [{ codice: 'R-1', applicativo: 'ERP', projectManager: 'Bianchi', fase: 'Analisi', inizio: '2026-02-01', descrizione: 'Ciclo passivo', ordini: [ordine('Ordine R1', 3000, 'NO')] }]
    };
    for (const [team, progetti] of Object.entries(seme)) {
      for (const p of progetti) await o.scrivi([team, 'progetti', p.codice + '.json'], doc(p));
    }
    await o.creaCartella(['Nuovo']); // un team appena creato dal proprietario del sito: vuoto
    await b.naviga(base + '?opfs');
    await o.pronta();
    await b.attendi('MP.ui.stato.squadre.length===4', 6000);

    // layout e vista d'insieme
    t.verifica(JSON.stringify(await a.stato('S.squadre.map(s=>s.nome)')) === JSON.stringify(['Energia', 'ERP', 'Nuovo', 'Portali']),
      'ogni sottocartella è un team, anche quella vuota');
    t.verifica(await a.stato('S.voci.length') === 4, 'i progetti di tutti i team si vedono insieme');
    t.verifica((await b.valuta("document.querySelector('.cartella-attiva').innerText")).includes('4 team'), 'l\'intestazione indica il numero di team');
    t.verifica((await b.valuta("[...document.querySelectorAll('#tabella-progetti thead th')].map(x=>x.innerText.trim())")).includes('Team'), 'la tabella ha la colonna Team');
    t.verifica(await b.valuta("document.querySelectorAll('.riquadro-team tbody tr').length") === 4, 'il riquadro per team ha una riga per team');
    await b.schermata('17-team-riepilogo', true);

    // filtro per team dal riquadro
    await b.valuta("[...document.querySelectorAll('.riquadro-team tbody tr')].find(r=>r.textContent.includes('Portali')).click()");
    t.verifica(await b.valuta("document.querySelectorAll('#tabella-progetti tbody tr').length") === 1
      && (await b.valuta("document.querySelector('#tabella-progetti tbody').innerText")).includes('P-1'), 'un clic sul team filtra i suoi progetti');
    await b.valuta("[...document.querySelectorAll('.riquadro-team tbody tr')].find(r=>r.textContent.includes('Portali')).click()");
    t.verifica(await b.valuta("document.querySelectorAll('#tabella-progetti tbody tr').length") === 4, 'un secondo clic toglie il filtro');

    // sola consultazione (il responsabile)
    await b.valuta("document.querySelector('.interruttore input').click()");
    await b.sleep(150);
    const nuovo = "[...document.querySelectorAll('#barra button')].find(x=>x.textContent.includes('Nuovo progetto'))";
    t.verifica((await b.valuta("document.getElementById('banner').innerText")).includes('Sola consultazione'), 'sola consultazione: avviso in alto');
    t.verifica(await b.valuta(nuovo + '.disabled') === true, 'sola consultazione: «Nuovo progetto» è disattivato');
    t.verifica(await b.valuta("document.querySelectorAll('#tabella-progetti button.icona').length") === 0
      && await b.valuta("document.querySelectorAll('#tabella-progetti tbody tr .tenue[title*=\"Sola lettura\"]').length") === 4, 'sola consultazione: nessun comando di modifica sulle righe');
    await b.valuta("(()=>{MP.ui.apriModulo('E-1');return true})()");
    t.verifica(await b.valuta("document.querySelectorAll('dialog[open]').length") === 0, 'sola consultazione: il modulo di modifica non si apre');
    t.verifica(await b.valuta("MP.ui.stato.adapter.salva(MP.ui.progetti()[0], {team:'Energia', revAtteso:1}).then(()=>'scritto', e=>e.name)") === 'SolaLettura',
      'sola consultazione: anche chiamando il salvataggio direttamente la scrittura è rifiutata');
    await b.schermata('18-sola-consultazione');
    await b.naviga(base + '?opfs');
    await o.pronta();
    await b.attendi('MP.ui.stato.squadre.length===4', 6000);
    t.verifica(await b.valuta("document.querySelector('.interruttore input').checked") === true && await b.valuta(nuovo + '.disabled') === true,
      'la sola consultazione si ricorda su questo PC');
    await b.valuta("document.querySelector('.interruttore input').click()");
    await b.sleep(120);
    t.verifica(await b.valuta(nuovo + '.disabled') === false, 'togliendola si può modificare di nuovo');

    // modifica nel proprio team
    await b.valuta("(()=>{MP.ui.apriModulo('E-1');return true})()");
    await a.dialoghi(1);
    t.verifica(await b.valuta("document.querySelector('dialog[open] select[disabled]')?.value") === 'Energia', 'modificando, il team si vede ma non si cambia');
    await a.campo('Note', 'nota del referente');
    await a.clic('Salva progetto');
    await a.dialoghi(0);
    await b.sleep(200);
    t.verifica((await o.leggiJson(['Energia', 'progetti', 'E-1.json'])).rev === 2 && (await o.leggiJson(['Portali', 'progetti', 'P-1.json'])).rev === 1,
      'il salvataggio tocca solo la cartella del suo team');

    // nuovo progetto in un team ancora vuoto
    t.verifica(JSON.stringify(await o.elenca(['Nuovo'])) === '[]', 'il team nuovo è una cartella vuota');
    await a.clic('+ Nuovo progetto');
    await a.dialoghi(1);
    await a.campo('Team', 'Nuovo');
    await a.campo('Codice *', 'N-1');
    await a.clic('Salva progetto');
    await a.dialoghi(2);
    t.verifica((await a.testoDialogo(1)).includes('non ha ancora progetti'), 'la prima scrittura in un team vuoto chiede conferma');
    await b.schermata('19-team-vuoto');
    await a.clic('Crea e salva');
    await a.dialoghi(0);
    await b.sleep(200);
    t.verifica((await o.elenca(['Nuovo', 'progetti'])).includes('N-1.json'), 'il progetto nasce dentro la cartella del team, che non è stata creata dall\'app');

    // scrittura rifiutata dalla cartella: il team passa in sola lettura
    await b.valuta(`(()=>{const orig=FileSystemFileHandle.prototype.createWritable;window.__origCW=orig;FileSystemFileHandle.prototype.createWritable=function(...x){if(this.name==='R-1.json')return Promise.reject(new DOMException('rifiutato','NotAllowedError'));return orig.apply(this,x)};return true})()`);
    await b.valuta("(()=>{MP.ui.apriModulo('R-1');return true})()");
    await a.dialoghi(1);
    await a.campo('Note', 'prova');
    await a.clic('Salva progetto');
    await b.attendi("document.getElementById('banner').innerText.includes('In sola lettura')", 5000);
    t.verifica((await b.valuta("document.getElementById('banner').innerText")).includes('ERP'), 'scrittura rifiutata: il team è segnalato in sola lettura');
    t.verifica(await a.stato("S.squadre.find(s=>s.nome==='ERP').motivo") === 'scrittura-rifiutata' && await a.stato("S.squadre.find(s=>s.nome==='Energia').scrivibile") === true,
      'solo quel team passa in sola lettura, gli altri restano modificabili');
    await b.schermata('20-team-sola-lettura');
    await a.clic('Annulla');
    await a.dialoghi(2);
    await a.clic('Chiudi senza salvare');
    await a.dialoghi(0);
    t.verifica(await b.valuta(`(()=>{const r=[...document.querySelectorAll('#tabella-progetti tbody tr')].find(x=>x.textContent.includes('R-1'));return !r.querySelector('button.icona')&&r.textContent.includes('🔒')})()`),
      'le righe del team in sola lettura non hanno comandi di modifica');
    await b.valuta('FileSystemFileHandle.prototype.createWritable=window.__origCW; true');

    // un team nuovo compare con «Aggiorna»
    await o.creaCartella(['Logistica']);
    await a.clic('↻ Aggiorna');
    await b.attendi("MP.ui.stato.squadre.some(s=>s.nome==='Logistica')", 5000);
    t.verifica(await a.stato('S.squadre.length') === 5, 'un team creato nel frattempo compare con «Aggiorna»');

    // una cartella di team non accessibile non blocca gli altri
    await b.valuta(`(()=>{window.__origGDH=FileSystemDirectoryHandle.prototype.getDirectoryHandle;FileSystemDirectoryHandle.prototype.getDirectoryHandle=function(...x){if(this.name==='Portali')return Promise.reject(new DOMException('negato','NotAllowedError'));return window.__origGDH.apply(this,x)};return true})()`);
    await a.clic('↻ Aggiorna');
    await b.attendi("document.getElementById('banner').innerText.includes('non leggibil')", 5000);
    t.verifica((await b.valuta("document.getElementById('banner').innerText")).includes('Portali') && await a.stato("S.voci.some(v=>v.team==='Energia')") === true
      && await a.stato("S.voci.some(v=>v.team==='Portali')") === false, 'un team non accessibile è segnalato e gli altri si vedono');
    await b.schermata('21-team-non-accessibile');
    await b.valuta('FileSystemDirectoryHandle.prototype.getDirectoryHandle=window.__origGDH; true');
    await a.clic('↻ Aggiorna');
    await b.attendi("MP.ui.stato.voci.some(v=>v.team==='Portali')", 5000);
    t.verifica(!(await b.valuta("document.getElementById('banner').innerText")).includes('non leggibil'), 'tornato accessibile, il team ricompare');

    // import nel team scelto
    await a.intercettaSelettoreFile();
    await a.scegliFile('legacy.csv', fixture('legacy-conflitto-codice.csv'));
    await a.dialoghi(1);
    await b.sleep(150);
    const opzioniImport = await b.valuta("[...document.querySelectorAll('dialog[open] #imp-team option')].map(x=>x.textContent)");
    t.verifica(opzioniImport.includes('Energia') && !opzioniImport.includes('ERP'), 'l\'import offre solo i team in cui si può scrivere (' + opzioniImport.join(', ') + ')');
    await a.campo('Importa nel team', 'Energia');
    await b.valuta("document.querySelector('dialog[open] input[type=checkbox]').click()");
    await a.clic('Importa 3 progetti');
    await a.dialoghi(0);
    await b.sleep(250);
    const inEnergia = await o.elenca(['Energia', 'progetti']);
    t.verifica(['EVO-26-001.json', 'EVO-26-002.json', 'EVO-26-003.json'].every((f) => inEnergia.includes(f))
      && !(await o.elenca(['Portali', 'progetti'])).includes('EVO-26-001.json'), 'l\'import scrive solo nel team scelto');

    // esportazioni con la colonna Team
    await a.intercettaFile();
    await a.clic('Esporta CSV');
    const csv = (await a.prossimoFile()).toString('utf8').replace(/^﻿/, '');
    t.verifica(csv.split('\r\n')[0].endsWith('"Team"') && csv.includes('"Energia"') && csv.includes('"Portali"'), 'il CSV esportato ha la colonna Team');
    await a.clic('PDF riepilogo');
    t.verifica((await a.prossimoFile()).slice(0, 5).toString() === '%PDF-', 'il PDF del riepilogo si crea anche con più team');

    // impostazioni per team
    await a.clic('⚙ Impostazioni');
    await a.dialoghi(1);
    await a.campo('Team', 'Energia');
    await a.campo('FTE per progetto (tra 0 e 1)', '0,4');
    await a.clic('Salva');
    await a.dialoghi(0);
    t.verifica((await o.leggiJson(['Energia', 'config.json'])).fteProgetto === 0.4 && !(await o.elenca(['Portali'])).includes('config.json'), 'le impostazioni si salvano nella cartella del team');
    await a.clic('⚙ Impostazioni');
    await a.dialoghi(1);
    await a.campo('Team', 'ERP');
    t.verifica(await b.valuta("document.getElementById('imp-fte').disabled") === true, 'le impostazioni di un team in sola lettura si vedono ma non si modificano');
    await a.clic('Annulla');
    await a.dialoghi(0);

    // FTE per team
    await b.valuta("document.querySelectorAll('.scheda')[3].click()");
    await b.sleep(150);
    t.verifica((await b.valuta("document.getElementById('contenuto').innerText")).includes('Energia 0,40'), 'l\'analisi FTE usa il valore di ogni team');
    await b.schermata('22-fte-team', true);
    t.nessunErrore(b, /favicon/);
  }
};
