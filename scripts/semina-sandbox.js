'use strict';
// Crea in sandbox/CartellaCondivisa una cartella per ogni team con i progetti di esempio, come
// sarebbe la libreria SharePoint con un team per cartella. Serve a provare l'app in locale:
//
//   npm run sandbox            poi, nell'app, «Apri la cartella dei dati» e scegli la sandbox
//
// Si possono simulare i permessi: su Windows `attrib +R "sandbox\CartellaCondivisa\ERP\progetti\*.json"`
// rende di sola lettura i file di un team (la scrittura viene rifiutata e l'app lo segnala).
// Lo script non cancella nulla: riscrive solo i file con lo stesso nome.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const radice = path.resolve(__dirname, '..');
const destinazione = path.resolve(process.argv[2] || path.join(radice, 'sandbox', 'CartellaCondivisa'));
const { nomeFile } = require(path.join(radice, 'src', 'storage', 'cartella.js'));
const Modello = require(path.join(radice, 'src', 'domain', 'modello.js'));
const Data = require(path.join(radice, 'src', 'domain', 'date.js'));

// demo.js e' pensato per il browser: lo si esegue in un contesto con `window` finto.
const contesto = vm.createContext({ window: { MP: { ui: {}, modello: Modello, date: Data } } });
vm.runInContext(fs.readFileSync(path.join(radice, 'src', 'ui', 'demo.js'), 'utf8'), contesto);

const oggi = new Date();
const oggiIso = Data.iso(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
const squadre = contesto.window.MP.ui.squadreDemo(oggiIso);

let file = 0;
for (const squadra of squadre) {
  const cartellaProgetti = path.join(destinazione, squadra.nome, 'progetti');
  fs.mkdirSync(cartellaProgetti, { recursive: true });
  for (const progetto of squadra.progetti) {
    const contenuto = { schemaVersion: 1, rev: 1, progetto };
    fs.writeFileSync(path.join(cartellaProgetti, nomeFile(progetto.codice)), JSON.stringify(contenuto, null, 2));
    file++;
  }
  const config = Modello.creaConfigurazione(squadra.config);
  fs.writeFileSync(path.join(destinazione, squadra.nome, 'config.json'), JSON.stringify(config, null, 2));
  file++;
}

// Un team appena creato dal proprietario del sito: cartella vuota.
fs.mkdirSync(path.join(destinazione, 'Team Nuovo'), { recursive: true });

console.log('Creati ' + file + ' file in ' + destinazione);
console.log('Team: ' + squadre.map((s) => s.nome).concat(['Team Nuovo (vuoto)']).join(', '));
console.log('Nell\'app: «Apri la cartella dei dati» e scegli questa cartella.');
