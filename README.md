# Monitoraggio Progetti

Strumento personale, condiviso con pochi colleghi, per seguire le evolutive software: progetti, ordini, attività, VPU e carico FTE.
Non usa server né database: solo risorse Microsoft 365 (cartelle condivise, OneDrive, SharePoint, eventualmente Dataverse).

**Stato:** fase 0, verifica dell'ambiente. L'app attuale (un solo file HTML) resta in `Documenti di partenza/` come riferimento; la nuova versione non è ancora scritta.

## Struttura

| Cartella | Contenuto | Stato |
|---|---|---|
| `Documenti di partenza/` | App attuale (`Progetti_78_fte.html`) e CSV di esempio. Solo riferimento. | esistente |
| `docs/` | Modello dati, architettura, guida alla verifica | scritta |
| `verifica/` | Pagina di verifica dell'ambiente (fase 0) | pronta |
| `src/domain/` | Regole di business come funzioni pure (codice univoco, costi, VPU, FTE, import) | da fare |
| `src/storage/` | Interfaccia di salvataggio e adapter (cartella condivisa, Dataverse) | da fare |
| `src/ui/` | Pagine e componenti | da fare |
| `src/reports/` | PDF e report, con un solo kit condiviso | da fare |
| `vendor/` | Librerie JS in locale con versione fissata (Chart.js, jsPDF, SheetJS) | da fare |
| `test/` | Test Node; `fixtures/` contiene i CSV reali usati come dati di prova | in uso |
| `sandbox/CartellaCondivisa/` | Cartella che simula quella condivisa aziendale | vuota |

Il file `progetti_12-10-2026_09-41.csv` nella radice è l'originale; la copia usata dai test è in `test/fixtures/legacy-conflitto-codice.csv`.

## Comandi

```
npm test          # test automatici (Node 18+, nessuna dipendenza da installare)
```

Verifica ambiente: aprire `verifica/index.html` con Edge. Istruzioni in [docs/verifica-ambiente.md](docs/verifica-ambiente.md).

## Documentazione

- [docs/modello-dati.md](docs/modello-dati.md): entità, regole sul codice univoco, decisioni prese e questioni aperte
- [docs/architettura.md](docs/architettura.md): strati, interfaccia di salvataggio, percorsi possibili per i dati
- [docs/verifica-ambiente.md](docs/verifica-ambiente.md): come eseguire la fase 0 e leggere i risultati
