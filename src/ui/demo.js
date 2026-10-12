/* Dati di esempio per la modalita' «prova»: nessun file viene letto o scritto.
 * Le date delle attivita' sono relative a `oggi`, cosi' scadenze e VPU hanno sempre qualcosa da mostrare.
 */
(function (radice) {
  'use strict';

  const MP = radice.MP = radice.MP || {};
  const UI = MP.ui = MP.ui || {};
  const Modello = MP.modello;
  const Data = MP.date;

  // Sposta una data `aaaa-mm-gg` di `giorni` giorni.
  function sposta(iso, giorni) {
    const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + giorni));
    return Data.iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  function datiDemo(oggi) {
    const t = (n) => sposta(oggi, n);
    const att = (descrizione, stato, inizio, fine, note) => ({ descrizione, stato, inizio, fine, note: note || '' });
    const ord = (riferimento, importo, offerta, vpu) => ({ riferimento, importo, offerta, vpu });
    const sito = (nome) => 'https://intranet.esempio.it/progetti/' + nome;

    return [
      Modello.creaProgetto({
        codice: 'EVO-26-001', applicativo: 'SERVIZIO TERMICO 3.0', projectManager: 'Verdi', fase: 'Esercizio',
        inizio: '2025-02-19', fine: '2026-04-21', sito: sito('conto-termico'), descrizione: 'Servizio termico 3.0',
        promemoria: 'SI', ordini: [ord('Prova 1', 10000, 'SI', 'SI')],
        attivita: [
          att('Rilascio in esercizio Parte 1', 'Completata', '2026-02-02', '2026-02-02'),
          att('Rilascio in esercizio Intranet', 'Completata', '2026-03-17', '2026-03-17'),
          att('Rilascio in esercizio CR', 'Completata', '2026-04-14', '2026-04-14', 'Rilascio concordato con il cliente'),
          att('Rilascio in esercizio Intranet P2', 'Completata', '2026-04-21', '2026-04-21')
        ]
      }),
      Modello.creaProgetto({
        codice: 'EVO-26-002', applicativo: 'SITO ACME', projectManager: 'Neri', fase: 'Esercizio',
        inizio: '2024-08-09', fine: '2024-09-18', sito: sito('sito-acme'),
        descrizione: 'Dichiarazione di accessibilità sui portali',
        note: 'Portale, sito di supporto, portale autoconsumo, open data, area clienti',
        promemoria: 'SI', ordini: [ord('Prova 2', 1000, 'SI', 'SI')]
      }),
      Modello.creaProgetto({
        codice: 'EVO-26-003', applicativo: 'PROGRAMMA P M0 I.00', projectManager: 'Neri', fase: 'Esercizio',
        inizio: '2024-12-16', fine: '2026-02-23', descrizione: 'Efficientamento ERP',
        note: 'Secondo ordine aperto per esaurimento della capienza del primo.', promemoria: 'SI',
        ordini: [ord('Prova 3', 2000, 'SI', 'SI'), ord('Prova 4', 1500, 'SI', 'NO')],
        attivita: [
          att('Esercizio nascosto', 'Completata', '2025-07-16', '2025-07-16'),
          att('Apertura portale', 'Completata', '2025-09-01', '2025-09-01'),
          att('Richiesta VPU', 'Completata', '2026-02-26', '2026-02-26')
        ]
      }),
      Modello.creaProgetto({
        codice: 'EVO-26-004', applicativo: 'PORTALE AUTOCONSUMO', projectManager: 'Bianchi', fase: 'Sviluppo',
        inizio: t(-120), fine: t(75), descrizione: 'Nuova sezione per le comunità energetiche', promemoria: 'SI',
        ordini: [ord('Ordine 4400123', 8000, 'SI', 'NO')],
        attivita: [
          att('Analisi dei requisiti', 'Completata', t(-120), t(-80)),
          att('Consegna documentazione di progetto', 'In corso', t(-60), t(-12), 'In attesa di conferma dal cliente'),
          att('Sviluppo funzionalità', 'In corso', t(-40), t(25)),
          att('Collaudo con il cliente', 'Da avviare', t(30), t(55)),
          att('Rilascio in esercizio', 'Da avviare', t(70), t(75))
        ]
      }),
      Modello.creaProgetto({
        codice: 'EVO-26-005', applicativo: 'AREA CLIENTI', projectManager: 'Verdi', fase: 'Collaudo',
        inizio: t(-200), fine: t(20), descrizione: 'Nuova gestione delle deleghe', promemoria: 'NO',
        ordini: [ord('Ordine 4400187', 12500, 'SI', 'NO')],
        attivita: [
          att('Sviluppo completato', 'Completata', t(-190), t(-30)),
          att('Collaudo funzionale', 'In corso', t(-28), t(10)),
          att('Correzione anomalie', 'Sospesa', t(-10), t(5), 'In attesa del rilascio dell\'ambiente di test')
        ]
      }),
      Modello.creaProgetto({
        codice: 'EVO-26-006', applicativo: 'OPEN DATA', projectManager: 'Bianchi', fase: 'Analisi',
        inizio: t(-25), fine: t(150), descrizione: 'Pubblicazione dei dataset sugli incentivi', promemoria: 'NO',
        ordini: [ord('Ordine 4400201', 4200, 'SI', 'NO')],
        attivita: [att('Raccolta fabbisogni', 'In corso', t(-25), t(12)), att('Disegno dei dataset', 'Da avviare', t(13), t(45))]
      }),
      Modello.creaProgetto({
        codice: 'EVO-26-007', applicativo: 'SITO DI SUPPORTO', projectManager: 'Neri', fase: 'Certificazione',
        inizio: t(-150), fine: t(15), descrizione: 'Verifica di conformità WCAG', promemoria: 'SI',
        ordini: [ord('Ordine 4400150', 3000, 'SI', 'NO')],
        attivita: [att('Verifica con strumenti automatici', 'Completata', t(-100), t(-70)), att('Audit finale', 'In corso', t(-5), t(15))]
      }),
      Modello.creaProgetto({
        codice: 'EVO-26-008', applicativo: 'PORTALE ACME', projectManager: 'Verdi', fase: 'Esercizio',
        inizio: t(-220), fine: t(-40), descrizione: 'Aggiornamento della home page', promemoria: 'SI',
        ordini: [ord('Ordine 4400098', 5600, 'SI', 'NO')],
        attivita: [att('Rilascio in esercizio', 'Completata', t(-42), t(-40))]
      }),
      Modello.creaProgetto({
        codice: 'EVO-26-009', applicativo: 'ERP', projectManager: 'Bianchi', fase: 'Ideazione',
        descrizione: 'Studio di fattibilità per il nuovo ciclo passivo', promemoria: 'NO'
      }),
      Modello.creaProgetto({
        codice: 'EVO-26-010', applicativo: 'AREA CLIENTI', projectManager: 'Neri', fase: 'Avvio',
        inizio: t(-6), descrizione: 'Notifiche via email sulle pratiche', promemoria: 'NO',
        ordini: [ord('Ordine 4400230', 2800, 'SI', 'NO')],
        attivita: [att('Kick-off', 'Completata', t(-6), t(-6)), att('Stima dettagliata', 'In corso', t(-5), t(3))]
      })
    ];
  }

  UI.datiDemo = datiDemo;
})(window);
