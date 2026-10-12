# Guida all'uso

Per chi usa Monitoraggio Progetti: installazione, uso quotidiano, lavoro in più persone, backup e passaggio dalla vecchia app.

## Installazione (una volta sola)

1. In una libreria SharePoint condivisa crea due cartelle, per esempio `Monitoraggio/App` e `Monitoraggio/Dati`. Copia in `App` i file dell'applicazione (`index.html` e le cartelle `src` e `vendor`); lascia `Dati` vuota. Se i progetti sono di più team, dentro `Dati` si crea una cartella per team con i suoi permessi (vedi «Più team e permessi»).
2. Sincronizza la libreria con OneDrive su ogni PC.
3. Con **Edge o Chrome** apri `index.html` dalla copia sincronizzata (conviene salvarlo nei preferiti). Firefox e Safari non funzionano: non possono aprire cartelle.
4. Clic su **Apri la cartella dei dati** e scegli `Dati`. Il browser chiede il permesso di modificare i file: conferma. Non puoi scegliere cartelle di sistema come Desktop o Documenti: scegli una sottocartella.
5. Le volte successive basta **Riapri «Dati»** (un clic di conferma del permesso).

L'app e i dati stanno in cartelle separate: per aggiornare l'app basta sostituire `App`, i dati non si toccano.

## Più team e permessi

Quando più team usano l'app e ognuno deve vedere solo i propri progetti, la riservatezza la decide **SharePoint** con i permessi sulle cartelle: l'app non può farla rispettare (i file sono leggibili da chiunque abbia accesso alla cartella). L'app mostra ciò che il browser riesce ad aprire e non scrive dove non si può.

```
Dati/
  TeamA/   progetti/   backup/   config.json
  TeamB/   progetti/   backup/   config.json
```

**La cartella del team è quella con i permessi**, e il suo nome è il nome del team (libero: `TeamA`, `Energia`, `progetti_TeamA`…). Dentro ci sono i file dei progetti, uno per progetto, in una sottocartella `progetti` oppure direttamente nella cartella del team: l'app riconosce entrambe le forme. `backup` e `config.json` stanno nella cartella del team, accanto. I permessi vanno quindi messi sulla cartella del team, non su `progetti`.

Quello che non funziona è mettere i file in una sottocartella con un altro nome (per esempio `Dati/TeamA/progetti2/`): l'app non la riconosce e lo dice con un avviso rosso, con il nome del team e della cartella. Per correggere basta spostare i file nella cartella del team o in `progetti`, poi **↻ Aggiorna**.

Se prima la cartella `Dati` era di un team solo (`Dati/progetti`, `Dati/backup`, `Dati/config.json`) e poi l'hai divisa in più cartelle, i file rimasti nella radice (tipicamente `config.json`) non appartengono a nessun team e non vengono letti: l'app li segnala con lo stesso avviso rosso. Sposta `config.json` nella cartella del team a cui serve (ogni team ha le sue impostazioni); la vecchia cartella `backup` della radice si può tenere come archivio, l'app la ignora.

**Il proprietario del sito, una volta per ogni team:**

1. Crea la cartella `Dati/<Team>` nella libreria (il nome della cartella è il nome del team).
2. Sulla cartella del team interrompe l'ereditarietà dei permessi e concede **Modifica** ai referenti del team e **Lettura** al responsabile.
3. Non mette nulla fuori dalle cartelle dei team: ogni file fuori sarebbe visibile a tutti quelli che hanno accesso a `Dati`.

**Un team nuovo** è una cartella nuova con gli stessi passaggi; compare nell'app con **↻ Aggiorna** (l'app non crea mai le cartelle dei team, perché erediterebbero i permessi sbagliati). Alla prima scrittura in un team vuoto l'app chiede conferma di creare al suo interno `progetti` e `backup`.

**I referenti** aprono `Dati` (vedono solo il loro team) oppure direttamente `Dati/<Team>`: l'app riconosce da sola se è la cartella di un team o quella con tutti i team.

**Il responsabile** apre `Dati` e vede tutti i team: un riquadro per team (progetti, costo, VPU da emettere, attività scadute; un clic filtra), la colonna **Team** e il filtro per team in tutte le schermate, i PDF e il CSV. Per non poter modificare nulla per sbaglio attiva **Sola consultazione** (interruttore in alto, o nella schermata iniziale): si ricorda su quel PC e fa sparire i comandi di modifica. Il permesso di sola lettura su SharePoint resta la protezione vera.

**Da sapere:**

- Se la cartella di un team rifiuta la scrittura (permessi di sola lettura), l'app lo segnala con un 🔒 e il team passa in sola lettura fino alla prossima apertura.
- Ogni team ha le sue **impostazioni** (valore FTE e destinatari VPU) nel suo `config.json`; le modifica solo chi può scrivere nel team.
- I codici sono univoci dentro il team. Se due team avessero lo stesso codice (non previsto) il responsabile vede un avviso.
- Un progetto appartiene a un solo team e non si sposta da un team all'altro.
- Per provare tutto in locale: `npm run sandbox` crea in `sandbox/CartellaCondivisa` tre team di esempio più uno vuoto.

## Uso quotidiano

- **Riepilogo.** Cerca per testo (una frase esatta va tra virgolette: `"Ordine 4400123"`), filtra per fase, ordina cliccando sulle intestazioni. Un clic su una voce della **legenda dei grafici** nasconde o riattiva quella fase, come il filtro «Fasi»: il numero al centro, gli indicatori, l'altro grafico e la tabella si ricalcolano insieme (una voce nascosta resta in legenda, barrata). L'ultima fase selezionata non si può nascondere. Un clic su una riga apre il dettaglio; ✏️ modifica, 🗑️ elimina.
- **Nuovo progetto / Modifica.** Il codice lo assegna un'altra struttura: qui basta che sia univoco (le maiuscole e gli spazi non contano). Un progetto ha di norma **un ordine**; se la capienza si esaurisce aggiungine un secondo. Il **costo** del progetto è la somma degli importi degli ordini. Per gli importi usa la virgola per i decimali (`1.250,50`); un valore come `2.500` può voler dire mille: l'app chiede conferma.
- **VPU.** Si emette per ordine. La scheda *VPU da emettere* elenca gli ordini con VPU a NO di progetti conclusi da almeno un giorno; **Richiedi VPU** apre una bozza di email. I destinatari si impostano in *Impostazioni*.
- **Scadenze.** Le attività in corso o da avviare, con i giorni di ritardo, all'inizio o alla fine.
- **Analisi FTE.** Carico mensile dei project manager. Il valore per progetto (0,20) è un segnaposto: impostalo in *Impostazioni*.
- **Esporta CSV** e **PDF** (riepilogo, scheda progetto, scadenze, VPU) dai pulsanti delle schermate.

## Lavorare in più persone

- Ogni salvataggio controlla che nessuno abbia modificato lo stesso progetto nel frattempo. Se è successo, l'app dice quali campi sono cambiati e chiede se **ricaricare** la versione del collega o **sovrascrivere** con la tua (la sua resta nel backup).
- Per vedere le modifiche dei colleghi usa **↻ Aggiorna**; l'app si aggiorna anche da sola quando ci torni dopo mezzo minuto.
- Se due persone salvano lo stesso progetto quasi insieme, OneDrive può tenere entrambe le versioni. L'app lo segnala con un avviso giallo e **Risolvi…** mostra le differenze: scegli di tenere l'originale o di usare la copia.
- Un file che non si riesce a leggere compare in un avviso rosso e non viene toccato.

## Backup e ripristino

Nella cartella dei dati, `backup/<data>/` contiene la versione di **inizio giornata** di ogni progetto modificato quel giorno. I progetti eliminati lasciano `<CODICE>.eliminato.json`.

Per ripristinare un progetto: copia il file dal backup nella cartella dei progetti del team (`progetti/`, o la cartella del team stessa se i file stanno lì) con il nome `<CODICE>.json` (senza suffissi), poi apri il progetto nell'app e salvalo una volta, così la revisione sale e i colleghi che lo avevano aperto vedranno il conflitto invece di sovrascriverlo senza accorgersene.

## Passare dalla vecchia app

1. Nella vecchia app usa **Export CSV**.
2. Nella nuova clicca **Importa CSV** e scegli il file. Il costo di ogni progetto diventa il suo ordine.
3. Controlla l'anteprima: progetti nuovi, sostituiti, conflitti e avvisi. Se righe dello stesso codice hanno valori diversi (per esempio riferimenti ordine diversi) l'app non sceglie in silenzio: va riconosciuto il conflitto per procedere.
4. Da quel momento usa solo la nuova app: i dati della vecchia restano nel browser in cui la usavi e non si aggiornano più.

Il CSV esportato dalla nuova app si reimporta senza differenze, anche con più ordini per progetto.

## Se qualcosa non va

| Sintomo | Cosa fare |
|---|---|
| «Questo browser non permette di aprire cartelle» | Usa Edge o Chrome |
| Il permesso sulla cartella è scaduto | Torna alla schermata iniziale con *Cambia cartella* e usa *Riapri* |
| Avviso rosso su un file | Il file è rovinato o creato da una versione più recente: ripristinalo dal backup o aggiorna l'app |
| Un collega non vede le mie modifiche | Attendi la sincronizzazione di OneDrive, poi *Aggiorna* |
| I grafici o i PDF non compaiono | Controlla che la cartella `vendor` sia stata copiata insieme all'app |
| Non vedo il team di un collega | È normale se non hai il permesso: i team a cui non hai accesso non arrivano sul tuo PC |
| Manca un team appena creato | Premi **↻ Aggiorna**; se manca ancora, controlla che OneDrive l'abbia sincronizzato |
| Un team ha il 🔒 e dovrei poterlo modificare | La cartella ha rifiutato la scrittura: controlla i permessi su SharePoint con il proprietario del sito |
| Un team risulta «non leggibile» | Manca il permesso sulla cartella o la sincronizzazione è ferma: riapri la cartella con *Cambia cartella* |
