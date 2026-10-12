# Modello dati

Fissato il 12/10/2026 dopo l'analisi dell'app attuale e dei CSV di esempio. Le sezioni «Decisioni» e «Questioni aperte» in fondo dicono cosa è certo e cosa no.

## Entità

```
Progetto (Codice univoco) ──< Ordine      0..N, di norma 1
                          └─< Attività    0..N
```

**Progetto** (l'«evolutiva»; il suo codice è la chiave)

| Campo | Tipo | Note |
|---|---|---|
| codice | testo | Assegnato da un'altra struttura: non si genera e il formato non si valida. Univoco. |
| applicativo | testo | |
| projectManager | testo | Oggi può contenere più nomi («Neri/Verdi»). Vedi questioni aperte. |
| fase | elenco | Ideazione, Avvio, Analisi, Sviluppo, Collaudo, Certificazione, Esercizio |
| inizio, fine | data | Salvate come `aaaa-mm-gg`, mostrate come `gg/mm/aaaa` |
| sito | URL | |
| descrizione, note | testo | |
| promemoria | SI/NO | A livello di progetto (da confermare) |

**Ordine**

| Campo | Tipo | Note |
|---|---|---|
| riferimento | testo | Lettera d'ordine |
| importo | numero (EUR) | Salvato come numero, mai come testo localizzato |
| offerta | SI/NO | Per ordine |
| vpu | SI/NO | Per ordine: ogni ordine ha il suo VPU |

**Attività** (appartengono al progetto, non all'ordine)

| Campo | Tipo | Note |
|---|---|---|
| descrizione | testo | |
| inizio, fine | data | Nei CSV di prova coincidono sempre (7 attività su 7): sono di fatto milestone |
| stato | elenco | Da avviare, In corso, Completata, Sospesa |
| note | testo | |

**Configurazione**: `fteProgetto` (valore segnaposto 0,20, da rendere modificabile).

## Team

Un progetto appartiene a **un solo team**; il team è il **nome della cartella** in cui sta il file (`Dati/<Team>/progetti/...`) e non fa parte dei dati del progetto: non si salva nel file, quindi non può divergere se la cartella viene rinominata o spostata. I team non condividono progetti e un progetto non si sposta da un team all'altro. La riservatezza tra team la fanno i permessi delle cartelle in SharePoint; l'app non la impone (vedi [architettura.md](architettura.md)).

- **Codice:** univoco dentro il team (lo garantisce il nome del file). Che sia univoco tra team lo assicura il processo a monte; se capitasse, il responsabile vede un avviso.
- **Configurazione** (valore FTE, destinatari VPU) per team, nel `config.json` del team.
- **Export CSV:** con più team aggiunge in fondo la colonna `Team`, solo informativa: l'import la ignora e chi importa sceglie il team di destinazione.

## Valori derivati

- **Costo del progetto** = somma degli importi dei suoi ordini. Non si digita. Senza ordini (tipico in Ideazione e Avvio) vale 0 / «n.d.».
- **FTE**: calcolato una volta per progetto (per codice), mai per ordine.
- **VPU da emettere**: elenco di *ordini*, non di progetti. L'email VPU usa riferimento e importo di quell'ordine.

## Il codice univoco

- Il confronto ignora maiuscole/minuscole e gli spazi ai bordi: `EVO-26-001 ` e `evo-26-001` sono lo stesso codice.
- Il form rifiuta un codice già esistente, sia in creazione sia in modifica.
- Il formato non è controllato (il significato dei segmenti non è noto e i codici li decide un'altra struttura).
- Il campo costo ripetuto su più righe del CSV è lo stesso valore del progetto: **non si somma**.

## Importi

Il vecchio `parseEuro` trasformava `2000.9` in `20009` e `10000.25` in `1000025`. Regola per il nuovo codice: se compaiono sia `.` sia `,`, l'ultimo è il decimale; solo `,` è decimale; solo `.` con esattamente tre cifre dopo è ambiguo e va confermato dall'utente; altrimenti `.` è decimale.

## Import da CSV

Due formati, riconosciuti dalle intestazioni:

- **Piatto** (quello dell'app precedente): una riga per attività, con le colonne del progetto ripetute, compresi Riferimento ordine, Costo, Offerta e VPU. Può descrivere **un solo ordine** per progetto.
- **Esteso** (quello che scrive «Esporta CSV»): una riga per ordine o per attività, con le colonne `Ordine Riferimento`, `Ordine Importo`, `Ordine Offerta`, `Ordine VPU`. Può descrivere più ordini per progetto: l'export si reimporta senza differenze.

Regole comuni:

1. Si raggruppa per codice normalizzato.
2. Ogni colonna del progetto vale il primo valore non vuoto del gruppo; se altre righe dello stesso codice hanno un valore diverso e non vuoto, **è un conflitto** da mostrare all'utente, non da risolvere in silenzio. Un valore vuoto non è un conflitto.
3. Nel formato piatto Riferimento ordine, Costo, Offerta e VPU producono **un** ordine (importo = Costo). Un secondo riferimento ordine su righe dello stesso codice non crea un secondo ordine da solo: è un conflitto, perché il costo è ripetuto e non si può attribuire. Nel formato esteso gli ordini sono quelli indicati nelle colonne `Ordine ...`; lo stesso ordine ripetuto con importi diversi è un conflitto.
4. L'import aggiorna per codice (upsert) e mostra un'anteprima (nuovi, aggiornati, conflitti) prima di scrivere. Non sostituisce più tutto l'archivio.
5. Date accettate in `gg/mm/aaaa` e `aaaa-mm-gg`; importi con le regole sopra.

Implementato in `src/domain/importCsv.js` (`importa`, `anteprima`, `applica`); l'esito riporta `conflitti`, `avvisi` ed `errori` separati. Caso di prova: `test/fixtures/legacy-conflitto-codice.csv`. EVO-26-003 ha 3 righe (3 attività) con riferimento ordine «Prova 3», «Prova 4», «Prova 5»: viene segnalato come conflitto sul riferimento ordine.

## Export CSV

`src/domain/esportaCsv.js` scrive il formato esteso: per ogni progetto `max(1, ordini, attività)` righe, la riga *i* con l'ordine *i* e l'attività *i*. Date `gg/mm/aaaa`, importi `10.000,00`, separatore `;`, UTF-8 con BOM (si apre bene in Excel in italiano). Colonne: Codice, Applicativo, Project Manager, Fase, Periodo Inizio, Periodo Fine, Sito Progetto, Descrizione, Note, Promemoria, Ordine Riferimento, Ordine Importo, Ordine Offerta, Ordine VPU, Attività Descrizione, Attività Inizio, Attività Fine, Attività Stato, Attività Note.

## Decisioni (12/10/2026)

- Il codice progetto coincide con l'evolutiva ed è univoco.
- Le attività e l'FTE appartengono all'evolutiva.
- Un'evolutiva ha di norma un ordine; un secondo ordine compare quando si esaurisce la capienza del primo.
- Il costo di un'evolutiva con più ordini è la somma degli importi degli ordini.
- Il VPU si emette per ordine; anche l'offerta è per ordine.
- I codici li assegna un'altra struttura: l'app non li genera.
- 0,20 FTE per progetto è un segnaposto.

## Questioni aperte

- **Promemoria**: per progetto (ipotesi di lavoro) o per ordine?
- **Project manager**: stringa libera o elenco di persone? Serve se l'FTE va ripartito per PM.
- **Criterio «VPU da emettere»**: è «fine progetto passata da almeno un giorno e ordine con VPU = NO», senza guardare la fase (come l'app precedente, applicato a ogni ordine). Da rivedere se serve limitarlo alla fase Esercizio.
- **Significato di `26`** in `EVO-26-xxx`: non coincide con l'anno delle date (EVO-26-002 finisce nel 2024). Non usato dall'app.
- **Valore reale dell'FTE** per progetto.
