'use strict';
// Esegue gli scenari end-to-end:   npm run e2e            tutti
//                                  npm run e2e -- cartella   solo quello indicato
// Screenshot e PDF generati finiscono in e2e/risultati/.

const lib = require('./lib.js');
const scenari = require('./scenari.js');

function creaContesto() {
  const aperti = [];
  let server = null;
  const esiti = { ok: 0, ko: 0 };
  return {
    esiti,
    verifica(condizione, messaggio) {
      console.log((condizione ? '  ok  ' : '  KO  ') + messaggio);
      if (condizione) esiti.ok++; else esiti.ko++;
    },
    // Nessun errore in console (si possono ignorare i messaggi che corrispondono a `ignora`).
    nessunErrore(browser, ignora) {
      const veri = browser.errori.filter((e) => !(ignora && ignora.test(e)));
      this.verifica(veri.length === 0, 'nessun errore nella console del browser' + (veri.length ? ': ' + veri.join(' | ') : ''));
    },
    async apri(url, opzioni) {
      const b = await lib.avviaBrowser(url, opzioni);
      aperti.push(b);
      return { b, a: lib.aiuti(b) };
    },
    async http() {
      if (!server) server = await lib.avviaServer(8700 + Math.floor(Math.random() * 200));
      return server.base;
    },
    async chiudiTutto() {
      aperti.forEach((b) => b.chiudi());
      if (server) server.chiudi();
    }
  };
}

(async () => {
  const richiesti = process.argv.slice(2);
  const nomi = richiesti.length ? richiesti : Object.keys(scenari);
  const sconosciuti = nomi.filter((n) => !scenari[n]);
  if (sconosciuti.length) {
    console.error('Scenario sconosciuto: ' + sconosciuti.join(', ') + '. Disponibili: ' + Object.keys(scenari).join(', '));
    process.exit(2);
  }

  let totaleOk = 0;
  let totaleKo = 0;
  for (const nome of nomi) {
    console.log('\n' + nome);
    const t = creaContesto();
    try {
      await scenari[nome](t);
    } catch (e) {
      t.verifica(false, 'lo scenario si è interrotto: ' + e.message);
    } finally {
      await t.chiudiTutto();
    }
    totaleOk += t.esiti.ok;
    totaleKo += t.esiti.ko;
  }

  console.log('\n' + totaleOk + ' verifiche riuscite, ' + totaleKo + ' fallite');
  process.exit(totaleKo ? 1 : 0);
})();
