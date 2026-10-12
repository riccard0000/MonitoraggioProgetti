# Architettura

## Vincoli

- Nessun server e nessun database: solo risorse Microsoft 365 (cartelle condivise, OneDrive, SharePoint) e, con licenza, Power Apps e Dataverse.
- L'app è personale, usata da pochi colleghi che **scrivono e consultano**. Non è un'applicazione aziendale distribuita.
- Il PC di sviluppo non vede le risorse aziendali: tutto ciò che serve deve essere emulabile in locale.
- Le pagine girano anche aperte da `file://`, dove i moduli ES (`import`/`export`) non si caricano. Quindi script classici, senza build.

## Strati

```
  src/ui        pagine e componenti       (usa domain e storage, mai i file direttamente)
  src/reports   PDF e report              (un solo kit condiviso)
  src/domain    regole di business        (funzioni pure, nessun DOM, nessun file)
  src/storage   interfaccia + adapter     (dove e come si salvano i dati)
```

Regola di dipendenza: `ui` e `reports` conoscono `domain` e l'interfaccia di `storage`; `domain` non conosce nessuno. Così le regole (codice univoco, costo come somma degli ordini, VPU per ordine, FTE, import con conflitti) si provano in Node con `npm test`, senza browser.

## Interfaccia di salvataggio

Operazioni per progetto, con controllo di versione ottimistico (`rev`):

```
elencaProgetti()                    -> [{ codice, rev, ... }]
leggiProgetto(codice)               -> progetto con ordini e attività, più rev
salvaProgetto(progetto, revAtteso)  -> nuova rev, oppure errore ConflittoDiVersione
eliminaProgetto(codice, revAtteso)
leggiConfigurazione() / salvaConfigurazione(cfg)
```

Il salvataggio fallisce se nel frattempo un collega ha modificato lo stesso progetto: l'utente decide, nessuno viene sovrascritto in silenzio.

### Adapter

| Adapter | Uso | Quando |
|---|---|---|
| In memoria | Test automatici | Subito |
| Cartella condivisa (File System Access API) | Sviluppo su `sandbox/CartellaCondivisa`, produzione su cartella OneDrive/SharePoint sincronizzata o di rete | Percorso A |
| Dataverse (Web API) | Produzione con tabelle Progetto, Ordine, Attività | Percorso B |

**Cartella condivisa.** Un file per progetto: `progetti/<CODICE>.json` con ordini e attività annidati, più `config.json` e `backup/`. Il nome del file deriva dal codice, quindi il file system garantisce l'unicità: Windows e OneDrive non distinguono maiuscole e minuscole, il che coincide con la regola sul codice. I caratteri non ammessi nei nomi file vengono codificati. `rev` è un contatore dentro il file, confrontato prima di ogni scrittura. Ogni file ha `schemaVersion`, così una versione vecchia dell'app non rovina dati scritti da una nuova.

**Dataverse.** Tre tabelle collegate; il codice è una *chiave alternativa* sulla tabella Progetto, quindi l'unicità è garantita dal database. La versione di riga (ETag) fa da `rev`.

## Percorsi possibili

Si sceglie dopo la fase 0 ([verifica-ambiente.md](verifica-ambiente.md)).

| Risultato della verifica | Percorso |
|---|---|
| File System Access funziona su una cartella sincronizzata, tempi accettabili, nessuna copia di conflitto | **A.** Cartella condivisa, un file per progetto |
| Si possono creare tabelle Dataverse e c'è modo di ospitare l'app con accesso autenticato (registrazione in Entra o «code apps» di Power Apps) | **B.** Dataverse tramite adapter |
| Né cartelle né Dataverse utilizzabili | **C.** Export/import manuale su SharePoint (CSV/Excel a tre tabelle) |

Note sulle incognite, entrambe da verificare nell'ambiente reale:

- Le **code apps** di Power Apps permettono di pubblicare un'app web (React/Vite) collegata a Dataverse, ma non ho trovato una conferma ufficiale dello stato di rilascio.
- Fonti non ufficiali indicano che **SharePoint Online scarica i file HTML invece di mostrarli**. Se è così, l'app si apre da cartella sincronizzata e non direttamente dal sito.

I percorsi A e B possono convivere: il dominio e l'interfaccia di salvataggio non cambiano, cambia solo l'adapter.

## Convenzioni

- Script classici in più file, ciascuno in una funzione immediata che si registra su un oggetto globale (`window.MP`) e, se c'è `module`, anche su `module.exports` per i test Node. Esempio: `verifica/verifica.js`.
- Librerie in `vendor/`, con versione fissata, mai da CDN: la rete aziendale potrebbe bloccarle.
- Tutto ciò che viene da dati (descrizioni, note, CSV importati) si inserisce nella pagina con `textContent` o con escape, mai in `innerHTML` grezzo.
- Date `aaaa-mm-gg` nel dato, `gg/mm/aaaa` a schermo; importi come numeri.
- Ogni fase di una lista (fasi, stati) è definita in **un solo punto** del dominio.
- Prima il dominio con i test, poi l'interfaccia. I CSV in `test/fixtures/` sono i dati di prova.
