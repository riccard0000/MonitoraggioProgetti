# Monitoraggio Progetti

Strumento personale, condiviso con pochi colleghi, per seguire le evolutive software: progetti, ordini, attività, VPU e carico FTE.
Non usa server né database: i dati stanno in una cartella condivisa (libreria SharePoint sincronizzata con OneDrive) e l'app gira in Edge o Chrome.

**Stato:** versione funzionante. Progetti con più ordini (VPU e offerta per ordine, costo come somma), attività, scadenze, analisi FTE, import/export CSV, report PDF, lavoro in più persone con controllo dei conflitti e backup, e **più team con visibilità per cartella**: ogni team ha la sua cartella SharePoint con i suoi permessi, il responsabile le vede tutte in sola consultazione.

## Come si usa

1. Apri `index.html` con **Edge o Chrome** (doppio clic: non serve nessun server).
2. **Apri la cartella dei dati** e scegli la cartella condivisa, oppure **Prova con dati di esempio** per vedere l'app senza scrivere nulla.

Installazione per i colleghi, uso quotidiano, backup e passaggio dalla vecchia app: [docs/guida-uso.md](docs/guida-uso.md).

## Struttura

| Cartella | Contenuto |
|---|---|
| `index.html` | L'applicazione |
| `src/domain/` | Regole di business come funzioni pure: codice univoco, date, importi, modello, import/export CSV, ricerca, scadenze, VPU, FTE |
| `src/storage/` | Salvataggio: regole di revisione, adapter in memoria e su cartella, archivio con più team |
| `scripts/` | `semina-sandbox.js`: crea team di esempio nella cartella sandbox |
| `src/reports/` | Report PDF, con un solo kit condiviso |
| `src/ui/` | Schermate, stile e dati di esempio |
| `vendor/` | Chart.js, jsPDF e autotable in locale, con versione fissata (nessun CDN) |
| `docs/` | Guida all'uso, modello dati, architettura, verifica dell'ambiente |
| `test/` | Test Node; `fixtures/` contiene i CSV reali usati come dati di prova |
| `e2e/` | Test end-to-end nel browser |
| `verifica/` | Pagina che controlla cosa permette l'ambiente di lavoro (cartelle, rete) |
| `sandbox/CartellaCondivisa/` | Cartella che simula quella condivisa aziendale, per provare a mano |
| `Documenti di partenza/` | App precedente (un solo file HTML) e CSV di esempio. Solo riferimento. |

Il file `progetti_12-10-2026_09-41.csv` nella radice è l'originale; la copia usata dai test è in `test/fixtures/legacy-conflitto-codice.csv`.

## Comandi

```
npm test          # test del dominio e del salvataggio (Node 18+, nessuna dipendenza da installare)
npm run e2e       # test dell'app nel browser (Node 22+, Edge o Chrome installato)
npm run e2e -- team       # un solo scenario: smoke, avvio, interazioni, esportazioni, cartella, team
npm run sandbox           # crea tre team di esempio (più uno vuoto) in sandbox/CartellaCondivisa
```

Prove a mano senza cartella condivisa: `index.html?demo` apre i dati di esempio (tre team); per la cartella sandbox esegui `npm run sandbox`, poi «Apri la cartella dei dati» e scegli `sandbox/CartellaCondivisa`.

## Documentazione

- [docs/guida-uso.md](docs/guida-uso.md): installazione, più team e permessi, uso quotidiano, lavoro in più persone, backup, migrazione
- [docs/modello-dati.md](docs/modello-dati.md): entità, regole sul codice univoco, formati CSV, decisioni e questioni aperte
- [docs/architettura.md](docs/architettura.md): decisione sul percorso dati, strati, interfaccia di salvataggio, rischi accettati, test
- [docs/verifica-ambiente.md](docs/verifica-ambiente.md): la pagina di verifica dell'ambiente e i suoi risultati
