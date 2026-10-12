'use strict';
// Scenari end-to-end: usano l'applicazione vera in un browser vero.
// Ogni scenario riceve `t` (vedi esegui.js) e dichiara le sue verifiche con t.verifica().

const fs = require('node:fs');
const path = require('node:path');
const { RADICE } = require('./lib.js');
const { urlFile } = require('./lib.js');

const fixture = (nome) => fs.readFileSync(path.join(RADICE, 'test', 'fixtures', nome), 'utf8');

module.exports = {
  // ------------------------------------------------------------------------ avvio
  async smoke(t) {
    const { b, a } = await t.apri(urlFile('?demo'));
    await b.attendi("!!document.querySelector('#contenuto table.dati tbody tr')", 8000);

    t.verifica(await b.valuta("document.querySelectorAll('#contenuto table.dati tbody tr').length") === 10, 'la tabella mostra i 10 progetti di esempio');
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
    t.verifica(await a.stato('S.config.fteProgetto') === 0.35 && await a.stato('S.config.destinatariVpu.length') === 3, 'impostazioni salvate: FTE 0,35 e 3 destinatari');

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
    t.verifica(await b.valuta("document.querySelectorAll('#contenuto tbody tr').length") === 1, 'la ricerca per frase esatta trova un solo progetto');
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
    const AIUTI = `
      window.__opfs = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('monitoraggio-dev', {create:true});
      window.__dir = async (p) => { let d = await __opfs(); for (const x of p) d = await d.getDirectoryHandle(x); return d; };
      window.__elenca = async (p) => { try { const d = await __dir(p); const n=[]; for await (const [nome] of d.entries()) n.push(nome); return n.sort(); } catch (e) { return null; } };
      window.__leggi = async (p) => { const d = await __dir(p.slice(0,-1)); return await (await (await d.getFileHandle(p[p.length-1])).getFile()).text(); };
      window.__scrivi = async (p, x) => { let d = await __opfs(); for (const n of p.slice(0,-1)) d = await d.getDirectoryHandle(n, {create:true}); const w = await (await d.getFileHandle(p[p.length-1], {create:true})).createWritable(); await w.write(x); await w.close(); };
      true`;
    const pronta = async () => { await b.attendi("!!document.querySelector('#contenuto')", 8000); await b.valuta(AIUTI); };
    const elenca = (p) => b.valuta('__elenca(' + JSON.stringify(p) + ')');
    const leggiJson = async (p) => JSON.parse(await b.valuta('__leggi(' + JSON.stringify(p) + ')'));
    const scrivi = (p, oggetto) => b.valuta('__scrivi(' + JSON.stringify(p) + ',' + JSON.stringify(JSON.stringify(oggetto)) + ')');

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
    t.verifica(await a.stato('S.config.fteProgetto') === 0.3, 'l\'impostazione si ritrova dopo il ricaricamento');

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
  }
};
