# Guida all'uso

Per chi usa Monitoraggio Progetti: installazione, uso quotidiano, lavoro in più persone, backup e passaggio dalla vecchia app.

## Installazione (una volta sola)

1. In una libreria SharePoint condivisa crea due cartelle, per esempio `Monitoraggio/App` e `Monitoraggio/Dati`. Copia in `App` i file dell'applicazione (`index.html` e le cartelle `src` e `vendor`); lascia `Dati` vuota.
2. Sincronizza la libreria con OneDrive su ogni PC.
3. Con **Edge o Chrome** apri `index.html` dalla copia sincronizzata (conviene salvarlo nei preferiti). Firefox e Safari non funzionano: non possono aprire cartelle.
4. Clic su **Apri la cartella dei dati** e scegli `Dati`. Il browser chiede il permesso di modificare i file: conferma. Non puoi scegliere cartelle di sistema come Desktop o Documenti: scegli una sottocartella.
5. Le volte successive basta **Riapri «Dati»** (un clic di conferma del permesso).

L'app e i dati stanno in cartelle separate: per aggiornare l'app basta sostituire `App`, i dati non si toccano.

## Uso quotidiano

- **Riepilogo.** Cerca per testo (una frase esatta va tra virgolette: `"Ordine 4400123"`), filtra per fase, ordina cliccando sulle intestazioni. Un clic su una riga apre il dettaglio; ✏️ modifica, 🗑️ elimina.
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

Per ripristinare un progetto: copia il file dal backup in `progetti/` con il nome `<CODICE>.json` (senza suffissi), poi apri il progetto nell'app e salvalo una volta, così la revisione sale e i colleghi che lo avevano aperto vedranno il conflitto invece di sovrascriverlo senza accorgersene.

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
