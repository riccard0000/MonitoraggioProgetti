# Architettura

## Vincoli

- Nessun server e nessun database: solo risorse Microsoft 365.
- L'app è personale, usata da pochi colleghi (3-5) che **scrivono e consultano**. Non è un'applicazione aziendale distribuita.
- Il PC di sviluppo non vede le risorse aziendali: tutto ciò che serve deve essere emulabile in locale.
- Le pagine girano anche aperte da `file://`, dove i moduli ES (`import`/`export`) non si caricano. Quindi script classici, senza build.

## Decisione (12/10/2026)

I dati stanno in una **cartella condivisa** (una libreria SharePoint sincronizzata con OneDrive). L'app è una pagina HTML aperta da Edge o Chrome, che legge e scrive la cartella con la File System Access API.

**Esclusi:** Dataverse, Power Apps (anche le «code apps»), liste SharePoint, Graph.

- Non si può registrare un'app in Microsoft Entra, quindi una nostra pagina non può autenticarsi su quei servizi.
- Power Apps non si emula sul PC di sviluppo e obbligherebbe a riscrivere l'interfaccia.
- La cartella è l'unico percorso che si sviluppa e si prova interamente offline.

**Browser supportati: Edge e Chrome.** Firefox e Safari non hanno la File System Access API: la pagina lo dice chiaramente e resta disponibile solo la modalità con dati di esempio.

**Ipotesi dell'utente, non verificata:** i file della libreria SharePoint sono raggiungibili dal browser e si sincronizzano. Il progetto non dipende dal fatto che SharePoint mostri gli HTML: ogni collega apre la pagina dalla propria copia sincronizzata (`file://`).

## Visibilità per team

Più team possono usare la stessa app, con ogni progetto visibile solo al suo team e un responsabile che li vede tutti.

**Chi fa rispettare la riservatezza.** L'app è una pagina che legge file: chiunque possa leggere la cartella legge tutto. La riservatezza la fanno quindi i **permessi delle cartelle in SharePoint** (una cartella per team: Modifica ai referenti, Lettura al responsabile), impostati dal proprietario del sito. OneDrive sincronizza solo ciò a cui l'utente ha accesso, quindi i team altrui non arrivano sul suo PC (da verificare in azienda). L'app si limita a leggere ciò che trova e a non scrivere dove non si può.

**Layout** (riconosciuto da `apriArchivio`, `src/storage/archivio.js`):

```
Dati/
  TeamA/   progetti/   backup/   config.json
  TeamB/   progetti/   backup/   config.json
```

- Se la cartella scelta contiene `progetti/` (o è vuota) è **un team singolo**, come prima: chi apre direttamente la cartella del proprio team non vede differenze.
- Altrimenti **ogni sottocartella è un team**, anche vuota (le cartelle che iniziano per `.` o `_` si saltano). Un team nuovo, creato dal proprietario del sito con i suoi permessi, compare con «Aggiorna».
- `backup/` e `config.json` stanno **dentro ogni team**: fuori dai team non c'è nessun dato di progetto che possa far trapelare altri team.
- Il team è il **nome della cartella**, non si salva nei file. L'app **non crea mai cartelle di team** (erediterebbero i permessi sbagliati); alla prima scrittura in un team vuoto chiede conferma di creare `progetti/` al suo interno.

**Sola lettura**, in due livelli:

1. **Sola consultazione**, scelta dall'utente (interruttore in alto, ricordato su quel PC): l'archivio rifiuta ogni scrittura con `SolaLettura` e l'interfaccia toglie i comandi di modifica. È la garanzia principale per il responsabile, perché non si sa come OneDrive tratti una scrittura locale in una cartella a cui si ha solo il permesso di lettura.
2. **Rilevamento automatico**: se una scrittura viene rifiutata (`NotAllowedError`, `NoModificationAllowedError`) mentre il permesso sulla cartella risulta concesso, quel team passa in sola lettura fino alla riapertura. Se invece il permesso è scaduto l'errore arriva così com'è e l'utente riapre la cartella.

**Cosa NON fa:** non nasconde i progetti di un team a chi ha accesso alla sua cartella; non sposta progetti tra team; non gestisce utenti o ruoli. Se il peso dei permessi per cartella diventasse ingestibile, l'alternativa è un servizio con permessi per record, che qui non c'è (vedi «Decisione»).

## Strati

```
  src/ui        pagine e componenti       (usa domain, storage e reports; mai i file direttamente)
  src/reports   PDF                       (un solo kit condiviso)
  src/storage   interfaccia + adapter     (dove e come si salvano i dati)
  src/domain    regole di business        (funzioni pure, nessun DOM, nessun file)
```

Regola di dipendenza: `ui` conosce tutti gli altri; `reports` e `storage` conoscono `domain`; `domain` non conosce nessuno. Così le regole si provano in Node con `npm test`, senza browser.

### `src/domain`

| File | Contenuto |
|---|---|
| `codice.js` | Normalizzazione e confronto del codice progetto |
| `date.js` | Lettura e calcoli sulle date, in UTC |
| `importi.js` | Lettura del testo in euro e formato `10.000,00` |
| `csv.js` | Lettore CSV |
| `modello.js` | Progetto, ordini, attività; fasi e stati; validazione; costo; duplicati; configurazione |
| `importCsv.js` | Import del CSV (formato piatto ed esteso) con conflitti, anteprima e applicazione per codice |
| `esportaCsv.js` | Export nel formato esteso |
| `elenco.js` | Ricerca, filtro per fase, ordinamento, sintesi e totali |
| `scadenze.js` | Classificazione delle attività: scadute, in corso, da avviare |
| `vpu.js` | VPU da emettere, per ordine; bozza dell'email |
| `fte.js` | Carico FTE mensile e annuale |

### `src/storage`

| File | Contenuto |
|---|---|
| `errori.js` | `ConflittoDiVersione`, `SolaLettura` e versione dello schema |
| `regole.js` | Regole di revisione comuni a ogni adapter (nuovo, modifica, cambio codice, eliminazione) |
| `memoria.js` | Adapter in memoria per un team: test e modalità «dati di esempio» |
| `cartella.js` | Adapter su una cartella di team (File System Access API) |
| `archivio.js` | Uno o più team: riconosce il layout, instrada le operazioni al team giusto, gestisce sola consultazione e sola lettura, team non accessibili e team che compaiono o spariscono |

### `src/reports` e `src/ui`

| File | Contenuto |
|---|---|
| `reports/pdfKit.js` | Intestazione, indicatori, blocchi di testo, tabelle e piè di pagina condivisi |
| `reports/report.js` | Scheda progetto, riepilogo, scadenze, VPU da emettere |
| `ui/dom.js` | Costruzione sicura della pagina (`h`), dialoghi, notifiche |
| `ui/riepilogo.js`, `dettaglio.js`, `modulo.js`, `importazione.js`, `viste.js`, `impostazioni.js` | Le schermate |
| `ui/app.js` | Avvio, apertura della cartella, schede, avvisi, copie di conflitto |
| `ui/demo.js` | Dati di esempio con date relative a oggi |

## Interfaccia di salvataggio

Operazioni per progetto, con controllo di versione ottimistico (`rev`):

```
elenca()                              -> { progetti: [{ progetto, rev, team }], copieConflitto, errori, squadre }
salva(progetto, { team, revAtteso, codicePrecedente })
                                      -> { progetto, rev, team }  oppure ConflittoDiVersione / SolaLettura
elimina(codice, revAtteso, team)
leggiConfigurazione(team) / configurazioni() / salvaConfigurazione(cfg, team)
risolviCopia(file, 'elimina' | 'usa', team)   (solo adapter su cartella)
squadre() / impostaConsultazione(bool)        (solo archivio)
```

`team` è facoltativo se l'archivio ha un solo team. Il salvataggio fallisce se nel frattempo un collega ha modificato lo stesso progetto: l'utente decide, nessuno viene sovrascritto in silenzio. Le regole stanno in `regole.js` e valgono per ogni adapter; `test/storage/contratto.js` le verifica su memoria, cartella e archivio con le stesse prove. Un team che non si riesce a leggere compare tra gli `errori` senza bloccare gli altri.

**Layout nella cartella.** Un file per progetto: `progetti/<CODICE>.json` con ordini e attività annidati, più `config.json` e `backup/`. Il nome del file deriva dal codice, quindi il file system garantisce l'unicità: Windows e OneDrive non distinguono maiuscole e minuscole, il che coincide con la regola sul codice. I caratteri non ammessi nei nomi file vengono codificati. `rev` è un contatore dentro il file, confrontato prima di ogni scrittura. Ogni file ha `schemaVersion`, così una versione vecchia dell'app non rovina dati scritti da una nuova.

**Backup.** Prima di sostituire un progetto si conserva la versione di inizio giornata in `backup/<aaaa-mm-gg>/` (una per progetto al giorno). Un progetto eliminato lascia `<CODICE>.eliminato.json`, una copia di conflitto scartata `<file>.copia.json`.

## Rischi accettati

- **Copie di conflitto di OneDrive.** Il controllo di `rev` non basta se due persone salvano lo stesso progetto entro il tempo di sincronizzazione: OneDrive crea una copia con il nome del PC accanto al file. L'adapter le rileva (nome del file diverso da quello atteso per il codice) e l'app le mostra con un confronto, offrendo di tenere l'originale o di usare la copia. Un file per progetto limita il problema a chi tocca lo stesso progetto.
- **Primo caricamento lento.** Con Files On-Demand la prima lettura di molti file piccoli può essere lenta. L'adapter legge fino a 8 file alla volta. Da misurare sulla cartella vera con la pagina in `verifica/`.
- **Permesso sulla cartella.** Dopo la chiusura del browser Edge e Chrome possono chiedere di nuovo il permesso: l'app propone «Riapri» e un clic di conferma.
- **Ripristino dai backup a mano.** Il ripristino non ha ancora una funzione nell'app: vedi [guida-uso.md](guida-uso.md).
- **Scrittura locale in sola lettura.** Se OneDrive consentisse di scrivere in locale in una cartella con solo il permesso di lettura, il rilevamento automatico non scatterebbe e l'upload verrebbe rifiutato dal server: per questo il responsabile attiva la «sola consultazione». Da verificare con il suo account.
- **Cartella sbagliata.** Scegliendo per sbaglio una cartella con tante sottocartelle estranee, ognuna sembrerebbe un team (vuoto): la conferma alla prima scrittura limita il danno.
- **Codici uguali in team diversi.** Non previsti; il responsabile vede un avviso, e i lookup per codice avvengono per team dove serve.

## Test

| Comando | Cosa prova |
|---|---|
| `npm test` | Dominio, salvataggio (memoria e cartella simulata) e pagina di verifica, in Node, senza browser |
| `npm run e2e` | L'app vera in Edge o Chrome senza interfaccia grafica: schermate, moduli, import, PDF, CSV e, con la cartella privata del browser (OPFS, stessa API della cartella condivisa), salvataggio, conflitti e backup. Screenshot e PDF in `e2e/risultati/`. Richiede Edge o Chrome (`BROWSER_PATH` per indicare il percorso) |

I permessi non si possono provare nell'OPFS: lo scenario `team` li simula facendo rifiutare al browser le scritture o l'apertura di una cartella. In locale `npm run sandbox` crea tre team di esempio più uno vuoto in `sandbox/CartellaCondivisa`; su Windows `attrib +R` sui file di un team simula la sola lettura.

Non coperto dai test: il selettore nativo di cartelle (serve una persona), la sincronizzazione reale di OneDrive tra due PC e il comportamento dei permessi per cartella di SharePoint.

## Convenzioni

- Script classici in più file, ciascuno in una funzione immediata che si registra su `window.MP` e, se c'è `module`, anche su `module.exports` per i test Node. Le dipendenze tra moduli si risolvono con `require` in Node e con `window.MP` nel browser. L'ordine di caricamento è quello di `index.html`.
- Librerie in `vendor/`, con versione fissata, mai da CDN: la rete aziendale potrebbe bloccarle (vedi `vendor/LEGGIMI.md`).
- Tutto ciò che viene da dati (descrizioni, note, CSV importati) entra nella pagina come testo con `h()`, mai come HTML. Il collegamento al sito di progetto è creato solo per indirizzi http/https.
- Date `aaaa-mm-gg` nel dato, `gg/mm/aaaa` a schermo; importi come numeri; `oggi` passato dal chiamante alle funzioni di dominio, mai letto dall'orologio dentro.
- Ogni elenco di valori (fasi, stati) è definito in **un solo punto**: `modello.js`.
- Prima il dominio con i test, poi l'interfaccia.
- Parametri di sviluppo nell'indirizzo: `index.html?demo` apre i dati di esempio; `index.html?opfs` usa una cartella privata del browser (richiede `http://`, non `file://`).
