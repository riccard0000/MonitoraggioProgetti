# Verifica dell'ambiente (fase 0)

Serve a decidere dove salvare i dati ([architettura.md](architettura.md), «Percorsi possibili») prima di scrivere l'app. La pagina è in `verifica/` (tre file: `index.html`, `verifica.js`, `app.js`), non ha dipendenze e non invia nulla in rete.

## Cosa controlla

| Sezione | Che cosa | Come |
|---|---|---|
| 1. Ambiente | Browser, da dove gira la pagina, API per le cartelle, IndexedDB, localStorage, lingua e fuso | Automatico |
| 2. Rete | CDN delle librerie, accesso Microsoft, Graph, ed eventualmente il tuo Dataverse e il tuo sito SharePoint | Automatico, senza scaricare né eseguire nulla |
| 3. Cartella condivisa | Scrittura, rilettura, sovrascrittura, elenco, sottocartelle, maiuscole/minuscole, tempi su molti file, rimozione dei file di prova, permesso che sopravvive al ricaricamento | Scegli una cartella |
| 4. Altri utenti | Dopo quanti secondi arriva una modifica di un collega e se OneDrive crea copie di conflitto | Serve una seconda persona |
| 5. Questionario | Cose che la pagina non può sapere: HTML su SharePoint, Dataverse, Entra, code apps, numero di scrittori | A mano |

## Come eseguirla

**Sul PC di sviluppo.** Apri `verifica/index.html` con Edge. Al punto 3 scegli `sandbox/CartellaCondivisa`. Il resto dei punti per cui serve l'azienda resta «non eseguito».

**In azienda.** Copia la cartella `verifica/` e ripeti la prova in tre posizioni, scaricando ogni volta il report con un nome diverso:

1. su disco locale;
2. dentro una cartella di OneDrive o di una libreria SharePoint **sincronizzata**;
3. caricata in una libreria SharePoint e aperta dal browser (serve per sapere se gli HTML si aprono o vengono scaricati).

Al punto 3 della pagina scegli una **sottocartella dedicata** nella posizione che useresti per i dati: Edge rifiuta Desktop, Documenti e la radice del disco. Per la sezione 4 un collega apre la stessa pagina dalla stessa cartella sincronizzata:

1. tu avvii il monitoraggio;
2. il collega preme «Simula un salvataggio»;
3. leggi dopo quanti secondi compare la modifica.

Per provare la perdita di un salvataggio premete insieme «Simula un salvataggio» più volte: se il numero finale (rev) è inferiore ai clic fatti, un salvataggio è andato perso.

## Cosa mandare

Il report in `.md` (o incollato) per ciascuna posizione. Contiene browser, lingua, fuso orario e i risultati; non contiene percorsi, URL né il nome dell'organizzazione. Rivedilo comunque prima di condividerlo.

## Come leggere i risultati

| Se vedi | Significa |
|---|---|
| `showDirectoryPicker` KO, o contesto non sicuro | Percorso A non praticabile da quella posizione |
| Punto 3 tutto OK sulla cartella sincronizzata, 300 file in meno di 3 s | Percorso A realistico |
| 300 file oltre 10 s | Un file per progetto è troppo lento: un unico file, o percorso B |
| Permesso «prompt» dopo il ricaricamento | Un clic di conferma a ogni apertura: accettabile, va solo previsto |
| Modifica del collega che arriva in pochi secondi, nessuna copia di conflitto | La concorrenza con controllo di versione è gestibile |
| Copie di conflitto, o rev finale inferiore ai clic | Il rischio di sovrascrittura è reale: serve il controllo di versione ottimistico, o percorso B |
| HTML da SharePoint «viene scaricato» | L'app si apre da cartella sincronizzata o da share, non dal sito |
| Dataverse e Entra «sì», oppure code apps «sì» | Percorso B praticabile |

## Limiti

- Le soglie (3 s e 10 s) sono indicative.
- La prima lettura di file OneDrive non ancora scaricati (Files On-Demand) può essere più lenta di quanto misurato.
- La pagina non chiama le API di Dataverse (richiedono un accesso autenticato): per quello c'è il questionario.
- Su `sandbox/` (disco locale) i tempi sono ottimistici e non dicono nulla sulla sincronizzazione: i numeri che contano sono quelli presi in azienda.

## Già verificato sul PC di sviluppo

- Edge 155 apre la pagina da `file://` dentro OneDrive: contesto sicuro, `showDirectoryPicker` e IndexedDB disponibili.
- La logica delle sezioni 1, 3 e 4 è provata con 12 test automatici su cartelle simulate e con l'API reale di Edge su una cartella del browser (tutti i passi riusciti, nessun file residuo).
- Non ancora provato: il selettore nativo di cartelle, che richiede una persona.
