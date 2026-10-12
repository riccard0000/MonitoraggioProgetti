/* Report PDF: scheda progetto, riepilogo, scadenze delle attivita', VPU da emettere.
 * Ogni funzione restituisce il documento jsPDF; salvarlo e' compito di chi chiama (`doc.save`).
 * Le tabelle usano gli stessi filtri e ordinamenti della schermata (src/domain/elenco.js).
 */
(function (radice) {
  'use strict';

  const MP = radice.MP = radice.MP || {};
  const K = MP.pdfKit;
  const { COLORI: C, M } = K;
  const Importi = MP.importi;
  const Data = MP.date;
  const Modello = MP.modello;
  const Elenco = MP.elenco;
  const Scadenze = MP.scadenze;

  const euro = (n) => Importi.formatoEuro(n) + ' €';
  const data = (iso) => Data.formatoIT(iso) || '-';
  const periodo = (p) => {
    if (p.inizio && p.fine) return data(p.inizio) + ' - ' + data(p.fine);
    if (p.inizio) return 'dal ' + data(p.inizio);
    return p.fine ? 'fino al ' + data(p.fine) : '-';
  };
  const breve = (v) => (v === 'PARZIALE' ? 'Parz.' : v);

  // --------------------------------------------------------------- scheda progetto

  function schedaProgetto(p) {
    const doc = K.nuovoDocumento('p');
    const { L } = K.misure(doc);
    let y = K.intestazione(doc, 'Dettaglio progetto');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    K.colore.testo(doc, C.primario);
    doc.text(p.codice, M, y + 5);
    const larghezzaCodice = doc.getTextWidth(p.codice);

    const rgb = K.COLORI_FASE[p.fase] || C.primario;
    doc.setFontSize(8);
    const larghezzaFase = Math.max(24, doc.getTextWidth(p.fase) + 8);
    K.colore.riempi(doc, rgb);
    doc.roundedRect(M + larghezzaCodice + 4, y, larghezzaFase, 7, 3.5, 3.5, 'F');
    K.colore.testo(doc, K.testoSu(rgb));
    doc.text(p.fase, M + larghezzaCodice + 4 + larghezzaFase / 2, y + 4.8, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    K.colore.testo(doc, C.tenue);
    doc.text('Applicativo: ' + (p.applicativo || 'n/d'), L - M, y + 5, { align: 'right' });
    y += 13;

    y = K.schedeKpi(doc, y, [
      { etichetta: 'Costo totale', valore: euro(Modello.costoProgetto(p)), colore: C.verde },
      { etichetta: 'Periodo', valore: periodo(p), piccolo: true },
      { etichetta: 'Ordini', valore: (p.ordini || []).length, colore: C.blu },
      { etichetta: 'Attività', valore: (p.attivita || []).length, colore: C.arancio }
    ]);
    y = K.schedeKpi(doc, y, [
      { etichetta: 'Project manager', valore: p.projectManager || 'Non assegnato' },
      { etichetta: 'Promemoria', valore: p.promemoria || 'NO' }
    ]);

    y = K.titoloSezione(doc, y, 'Ordini (' + (p.ordini || []).length + ')');
    if ((p.ordini || []).length) {
      y = K.tabella(doc, y, [
        { titolo: 'Riferimento', valore: (o) => o.riferimento, larghezza: 80 },
        { titolo: 'Importo', valore: (o) => euro(o.importo), larghezza: 40, allinea: 'right' },
        { titolo: 'Offerta', valore: (o) => o.offerta, larghezza: 33, allinea: 'center' },
        { titolo: 'VPU', valore: (o) => o.vpu, larghezza: 33, allinea: 'center' }
      ], p.ordini, { piede: [{ content: 'Totale', styles: { halign: 'left' } }, { content: euro(Modello.costoProgetto(p)), styles: { halign: 'right' } }, '', ''] });
    } else {
      y = K.blocco(doc, y, 'Ordini', 'Nessun ordine presente.');
    }

    y = K.blocco(doc, y, 'Descrizione', p.descrizione || 'Nessuna descrizione presente.');
    if (p.sito) y = K.blocco(doc, y, 'Sito progetto', p.sito);
    if (p.note) y = K.blocco(doc, y, 'Note', p.note);

    const attivita = (p.attivita || []).slice().sort((a, b) => (a.inizio || '9999') < (b.inizio || '9999') ? -1 : 1);
    y = K.titoloSezione(doc, y, 'Attività collegate (' + attivita.length + ')');
    if (attivita.length) {
      K.tabella(doc, y, [
        { titolo: 'Stato', valore: (a) => a.stato, larghezza: 26 },
        { titolo: 'Descrizione', valore: (a) => a.descrizione, larghezza: 66 },
        { titolo: 'Periodo', valore: (a) => periodo(a), larghezza: 46 },
        { titolo: 'Note', valore: (a) => a.note || '-', larghezza: 48 }
      ], attivita);
    } else {
      K.blocco(doc, y, 'Attività', 'Nessuna attività presente.');
    }

    K.piePagina(doc, 'Dettaglio progetto ' + p.codice);
    return doc;
  }

  // ---------------------------------------------------------------------- riepilogo

  // progetti: gia' filtrati e ordinati come a schermo.
  // opzioni: { filtri: { testo, fasi }, immagini: { fasi, costi } (data URL dei grafici) }
  function riepilogo(progetti, opzioni) {
    const o = opzioni || {};
    const doc = K.nuovoDocumento('l');
    const { L, A } = K.misure(doc);
    let y = K.intestazione(doc, 'Riepilogo progetti');

    const f = o.filtri || {};
    y = K.blocco(doc, y, 'Filtri applicati',
      'Ricerca: ' + (f.testo || 'nessuna') + '    |    Fasi: ' + (f.fasi && f.fasi.length ? f.fasi.join(', ') : 'tutte'));

    const tot = Elenco.totali(progetti);
    y = K.schedeKpi(doc, y, [
      { etichetta: 'Progetti', valore: tot.progetti },
      { etichetta: 'Costo totale', valore: euro(tot.costo), colore: C.verde },
      { etichetta: 'Ordini', valore: tot.ordini, colore: C.blu },
      { etichetta: 'Attività', valore: tot.attivita, colore: C.arancio }
    ]);

    // Distribuzione per fase: una casella colorata per ogni fase.
    const conteggi = Elenco.conteggiPerFase(progetti);
    const fasi = Modello.FASI;
    const tra = 3;
    const largCasella = (L - 2 * M - tra * (fasi.length - 1)) / fasi.length;
    fasi.forEach((fase, i) => {
      const x = M + i * (largCasella + tra);
      const rgb = K.COLORI_FASE[fase];
      K.colore.riempi(doc, rgb);
      doc.roundedRect(x, y, largCasella, 13, 2, 2, 'F');
      K.colore.testo(doc, K.testoSu(rgb));
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(fase, x + largCasella / 2, y + 5, { align: 'center' });
      doc.setFontSize(11);
      doc.text(String(conteggi[fase]), x + largCasella / 2, y + 10.5, { align: 'center' });
    });
    y += 18;

    if (o.immagini && (o.immagini.fasi || o.immagini.costi)) {
      const tra2 = 8;
      const largCard = (L - 2 * M - tra2) / 2;
      const altCard = Math.min(A - 18 - y, 82);
      [o.immagini.fasi, o.immagini.costi].forEach((img, i) => {
        const x = M + i * (largCard + tra2);
        K.colore.riempi(doc, C.bianco);
        K.colore.bordo(doc, C.bordo);
        doc.setLineWidth(0.2);
        doc.roundedRect(x, y, largCard, altCard, 2, 2, 'FD');
        if (!img) return;
        const prop = doc.getImageProperties(img);
        const rapporto = prop.width / prop.height;
        let w = largCard - 10;
        let h = w / rapporto;
        if (h > altCard - 8) { h = altCard - 8; w = h * rapporto; }
        doc.addImage(img, 'PNG', x + (largCard - w) / 2, y + (altCard - h) / 2, w, h);
      });
    }

    doc.addPage();
    y = K.titoloSezione(doc, M + 2, 'Elenco progetti');
    const rigaVerde = (p) => (p.fase === 'Esercizio' ? C.verdeChiaro : null);
    K.tabella(doc, y, [
      { titolo: 'Codice', valore: (p) => p.codice, larghezza: 22, cella: (d) => { d.cell.styles.fontStyle = 'bold'; } },
      { titolo: 'Applicativo', valore: (p) => p.applicativo || '-', larghezza: 26 },
      { titolo: 'Project manager', valore: (p) => p.projectManager || '-', larghezza: 22 },
      { titolo: 'Fase', valore: (p) => p.fase, larghezza: 25, cella: (d, p) => K.etichetta(d, K.COLORI_FASE[p.fase] || C.primario) },
      { titolo: 'Periodo', valore: periodo, larghezza: 32 },
      { titolo: 'Descrizione', valore: (p) => p.descrizione || '-', larghezza: 41 },
      { titolo: 'Ordini', valore: (p) => ((p.ordini || []).map((x) => x.riferimento).join('\n') || '-'), larghezza: 32 },
      { titolo: 'Costo', valore: (p) => euro(Modello.costoProgetto(p)), larghezza: 22, allinea: 'right' },
      { titolo: 'Att.', valore: (p) => String((p.attivita || []).length), larghezza: 9, allinea: 'center' },
      { titolo: 'Prom.', valore: (p) => p.promemoria, larghezza: 11, allinea: 'center' },
      { titolo: 'Off.', valore: (p) => breve(Elenco.sintesiOrdini(p, 'offerta')), larghezza: 14, allinea: 'center' },
      { titolo: 'VPU', valore: (p) => breve(Elenco.sintesiOrdini(p, 'vpu')), larghezza: 14, allinea: 'center' }
    ], progetti, {
      fontSize: 7.5,
      coloraRiga: rigaVerde,
      piede: [
        { content: 'Totale progetti: ' + tot.progetti + '   -   Ordini: ' + tot.ordini + '   -   Attività: ' + tot.attivita, colSpan: 7 },
        { content: euro(tot.costo), styles: { halign: 'right' } },
        { content: '', colSpan: 4 }
      ]
    });

    K.piePagina(doc, 'Monitoraggio Progetti', 'Progetti: ' + tot.progetti);
    return doc;
  }

  // ---------------------------------------------------------------------- scadenze

  // righe: risultato di Scadenze.classifica.
  function scadenze(righe, oggi) {
    const doc = K.nuovoDocumento('l');
    let y = K.intestazione(doc, 'Report attività in scadenza');
    const r = Scadenze.riepilogo(righe);

    y = K.schedeKpi(doc, y, [
      { etichetta: 'In corso', valore: r.inCorso, colore: C.verde },
      { etichetta: 'Da avviare', valore: r.daAvviare, colore: C.blu },
      { etichetta: 'Scadute', valore: r.scadute, colore: C.rosso },
      { etichetta: 'Progetti', valore: r.progetti }
    ]);

    y += 3;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const voci = [[C.blu, 'Blu = attività da avviare'], [C.verde, 'Verde = attività in corso'], [C.rosso, 'Rosso = attività scaduta']];
    let x = M;
    voci.forEach(([rgb, testo]) => {
      K.colore.riempi(doc, rgb);
      doc.roundedRect(x, y - 3, 4, 4, 1, 1, 'F');
      K.colore.testo(doc, C.testo);
      doc.text(testo, x + 6, y);
      x += 60;
    });
    K.colore.testo(doc, C.tenue);
    doc.text('Data del report: ' + data(oggi), x + 10, y);
    y += 6;

    if (!righe.length) {
      K.blocco(doc, y, 'Scadenze', 'Nessuna attività in corso o da avviare.');
    } else {
      const sfondo = { 'SCADUTA': C.rossoChiaro, 'IN CORSO': C.verdeChiaro, 'DA AVVIARE': C.bluChiaro };
      const colTag = { 'SCADUTA': C.rosso, 'IN CORSO': C.verde, 'DA AVVIARE': C.blu };
      K.tabella(doc, y, [
        { titolo: 'Codice', valore: (r2) => r2.codice, larghezza: 24, cella: (d) => { d.cell.styles.fontStyle = 'bold'; } },
        { titolo: 'Applicativo', valore: (r2) => r2.applicativo || '-', larghezza: 30 },
        { titolo: 'Progetto', valore: (r2) => r2.progetto || '-', larghezza: 50 },
        { titolo: 'Attività', valore: (r2) => r2.attivita || '-', larghezza: 56 },
        { titolo: 'Inizio', valore: (r2) => data(r2.inizio), larghezza: 20 },
        { titolo: 'Fine', valore: (r2) => data(r2.fine), larghezza: 20 },
        { titolo: 'GG', valore: (r2) => (r2.giorni == null ? '' : String(r2.giorni)), larghezza: 12, allinea: 'right' },
        { titolo: 'Classificazione', valore: (r2) => r2.tag, larghezza: 28, cella: (d, r2) => K.etichetta(d, colTag[r2.tag]) },
        { titolo: 'Note', valore: (r2) => r2.note || '', larghezza: 33 }
      ], righe, { coloraRiga: (r2) => sfondo[r2.tag] });
    }

    K.piePagina(doc, 'Monitoraggio Progetti', 'Attività: ' + righe.length);
    return doc;
  }

  // ------------------------------------------------------------------------- VPU

  // righe: risultato di Vpu.daEmettere.
  function vpu(righe, oggi) {
    const doc = K.nuovoDocumento('l');
    let y = K.intestazione(doc, 'Report VPU da emettere');

    const importoTotale = Importi.arrotonda(righe.reduce((t, r) => t + (Number(r.importo) || 0), 0));
    const progetti = new Set(righe.map((r) => r.codice.toUpperCase())).size;
    const mediaGiorni = righe.length ? Math.round(righe.reduce((t, r) => t + r.giorniDallaFine, 0) / righe.length) : 0;

    y = K.schedeKpi(doc, y, [
      { etichetta: 'VPU da emettere', valore: righe.length },
      { etichetta: 'Importo totale', valore: euro(importoTotale), colore: C.verde },
      { etichetta: 'Progetti', valore: progetti, colore: C.blu },
      { etichetta: 'Giorni medi dalla fine', valore: mediaGiorni, colore: C.arancio }
    ]);
    y = K.blocco(doc, y, 'Criterio del report',
      'Ordini con VPU = NO di progetti conclusi da almeno un giorno, al ' + data(oggi) + '. Il VPU si emette per ordine.');

    if (!righe.length) {
      K.blocco(doc, y, 'VPU', 'Nessun VPU da emettere.');
    } else {
      K.tabella(doc, y, [
        { titolo: 'Codice', valore: (r) => r.codice, larghezza: 26, cella: (d) => { d.cell.styles.fontStyle = 'bold'; } },
        { titolo: 'Applicativo', valore: (r) => r.applicativo || '-', larghezza: 34 },
        { titolo: 'Descrizione', valore: (r) => r.descrizione || '-', larghezza: 80 },
        { titolo: 'Ordine', valore: (r) => r.riferimento, larghezza: 40 },
        { titolo: 'Inizio', valore: (r) => data(r.inizio), larghezza: 22 },
        { titolo: 'Fine', valore: (r) => data(r.fine), larghezza: 22 },
        { titolo: 'Importo', valore: (r) => euro(r.importo), larghezza: 31, allinea: 'right' },
        { titolo: 'GG', valore: (r) => String(r.giorniDallaFine), larghezza: 18, allinea: 'right' }
      ], righe, {
        piede: [{ content: 'Totale: ' + righe.length + ' ordini', colSpan: 6 }, { content: euro(importoTotale), styles: { halign: 'right' } }, '']
      });
    }

    K.piePagina(doc, 'Monitoraggio Progetti', 'VPU da emettere: ' + righe.length);
    return doc;
  }

  const prefissi = { scheda: 'scheda_progetto', riepilogo: 'riepilogo_progetti', scadenze: 'report_scadenze', vpu: 'report_vpu' };

  MP.reports = { schedaProgetto, riepilogo, scadenze, vpu, prefissi, nomeFile: K.nomeFile };
})(window);
