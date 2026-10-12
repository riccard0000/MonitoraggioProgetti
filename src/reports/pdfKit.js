/* Kit condiviso per i report PDF (jsPDF + jspdf-autotable).
 *
 * Intestazione, schede indicatori, blocchi di testo, tabelle e piè di pagina sono definiti qui
 * una volta sola: i report in report.js li compongono senza ripetere il disegno.
 */
(function (radice) {
  'use strict';

  const MP = radice.MP = radice.MP || {};
  const Kit = MP.pdfKit = MP.pdfKit || {};

  const M = 12; // margine in mm

  const COLORI = {
    primario: [44, 62, 80], accento: [52, 152, 219], testo: [45, 55, 72], tenue: [113, 128, 150],
    bordo: [226, 232, 240], chiaro: [248, 250, 252], bianco: [255, 255, 255],
    verde: [39, 174, 96], verdeChiaro: [238, 250, 241], rosso: [231, 76, 60], rossoChiaro: [255, 235, 235],
    blu: [41, 128, 185], bluChiaro: [235, 245, 255], arancio: [243, 156, 18], arancioChiaro: [255, 248, 235],
    totale: [237, 242, 247]
  };

  const COLORI_FASE = {
    Ideazione: [127, 140, 141], Avvio: [41, 128, 185], Analisi: [247, 220, 111], Sviluppo: [243, 156, 18],
    Collaudo: [142, 68, 173], Certificazione: [174, 214, 241], Esercizio: [39, 174, 96]
  };

  // Testo scuro sui colori chiari, bianco sugli altri.
  function testoSu(rgb) {
    const luminanza = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    return luminanza > 0.6 ? COLORI.primario : COLORI.bianco;
  }

  function nuovoDocumento(orientamento) {
    const lib = radice.jspdf && radice.jspdf.jsPDF;
    if (!lib) throw new Error('La libreria PDF non è stata caricata (cartella vendor/).');
    return new lib({ orientation: orientamento === 'l' ? 'l' : 'p', unit: 'mm', format: 'a4', compress: true });
  }

  function misure(doc) {
    return { L: doc.internal.pageSize.getWidth(), A: doc.internal.pageSize.getHeight() };
  }

  const colore = {
    testo: (doc, c) => doc.setTextColor(c[0], c[1], c[2]),
    riempi: (doc, c) => doc.setFillColor(c[0], c[1], c[2]),
    bordo: (doc, c) => doc.setDrawColor(c[0], c[1], c[2])
  };

  // Titolo, data di esportazione e linea. Restituisce la y da cui continuare.
  function intestazione(doc, titolo) {
    const { L } = misure(doc);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    colore.testo(doc, COLORI.primario);
    doc.text(titolo, M, M + 6);

    const timbro = new Date().toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    colore.testo(doc, COLORI.tenue);
    doc.text('Esportato il ' + timbro, L - M, M + 6, { align: 'right' });

    colore.bordo(doc, COLORI.accento);
    doc.setLineWidth(0.7);
    doc.line(M, M + 10, L - M, M + 10);
    return M + 17;
  }

  // Nuova pagina se non c'e' spazio per `altezza` mm. Restituisce la y aggiornata.
  function spazio(doc, y, altezza) {
    const { A } = misure(doc);
    if (y + altezza <= A - 18) return y;
    doc.addPage();
    return M + 4;
  }

  function titoloSezione(doc, y, testo) {
    y = spazio(doc, y, 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    colore.testo(doc, COLORI.tenue);
    doc.text(testo.toUpperCase(), M, y + 2);
    return y + 5;
  }

  // Schede indicatore affiancate. voci: [{ etichetta, valore, colore? }]
  function schedeKpi(doc, y, voci) {
    const { L } = misure(doc);
    const spazioTra = 4;
    const larghezza = (L - 2 * M - spazioTra * (voci.length - 1)) / voci.length;
    y = spazio(doc, y, 24);

    voci.forEach((v, i) => {
      const x = M + i * (larghezza + spazioTra);
      colore.riempi(doc, COLORI.chiaro);
      colore.bordo(doc, COLORI.bordo);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, y, larghezza, 20, 2, 2, 'FD');
      colore.riempi(doc, v.colore || COLORI.accento);
      doc.roundedRect(x, y, 2.6, 20, 1.2, 1.2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      colore.testo(doc, COLORI.tenue);
      doc.text(String(v.etichetta).toUpperCase(), x + 6, y + 6.5);

      doc.setFontSize(v.piccolo ? 9 : 12);
      colore.testo(doc, COLORI.testo);
      const righe = doc.splitTextToSize(String(v.valore), larghezza - 10).slice(0, 2);
      doc.text(righe, x + 6, y + 13.5, { lineHeightFactor: 1.05 });
    });
    return y + 24;
  }

  // Riquadro con titolo e testo che puo' continuare su piu' pagine.
  function blocco(doc, y, titolo, testo) {
    const { L, A } = misure(doc);
    const larghezza = L - 2 * M;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const righe = doc.splitTextToSize(String(testo), larghezza - 12);
    const interlinea = 4.5;
    let da = 0;

    while (da < righe.length || da === 0) {
      y = spazio(doc, y, 22);
      const disponibili = Math.max(1, Math.floor((A - 18 - y - 13) / interlinea));
      const parte = righe.slice(da, da + disponibili);
      const altezza = 12 + parte.length * interlinea;

      colore.riempi(doc, COLORI.bianco);
      colore.bordo(doc, COLORI.bordo);
      doc.setLineWidth(0.2);
      doc.roundedRect(M, y, larghezza, altezza, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      colore.testo(doc, COLORI.tenue);
      doc.text((da === 0 ? titolo : titolo + ' (segue)').toUpperCase(), M + 6, y + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      colore.testo(doc, COLORI.testo);
      doc.text(parte, M + 6, y + 12, { lineHeightFactor: 1.15 });

      y += altezza + 4;
      da += parte.length;
      if (!righe.length) break;
    }
    return y;
  }

  // Tabella con intestazione ripetuta a ogni pagina.
  //   colonne: [{ titolo, valore: riga => testo, larghezza, allinea?, cella?: (dati, riga) => void }]
  //   opzioni: { piede?: [testi], coloraRiga?: riga => rgb, fontSize? }
  function tabella(doc, y, colonne, righe, opzioni) {
    const o = opzioni || {};
    const fs = o.fontSize || 8;
    const stili = {};
    colonne.forEach((c, i) => { stili[i] = { cellWidth: c.larghezza, halign: c.allinea || 'left' }; });

    doc.autoTable({
      startY: y,
      margin: { left: M, right: M, bottom: 18, top: M + 4 },
      head: [colonne.map((c) => c.titolo)],
      body: righe.map((r) => colonne.map((c) => c.valore(r))),
      foot: o.piede ? [o.piede] : undefined,
      showFoot: 'lastPage',
      theme: 'plain',
      styles: {
        font: 'helvetica', fontSize: fs, cellPadding: 1.8, textColor: COLORI.testo,
        lineColor: COLORI.bordo, lineWidth: { bottom: 0.2 }, overflow: 'linebreak', valign: 'top'
      },
      headStyles: { fillColor: COLORI.primario, textColor: COLORI.bianco, fontStyle: 'bold', fontSize: fs },
      footStyles: { fillColor: COLORI.totale, textColor: COLORI.primario, fontStyle: 'bold', fontSize: fs },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: stili,
      didParseCell: (d) => {
        if (d.section === 'head' && colonne[d.column.index].allinea) {
          d.cell.styles.halign = colonne[d.column.index].allinea;
        }
        if (d.section !== 'body') return;
        const riga = righe[d.row.index];
        if (o.coloraRiga) {
          const c = o.coloraRiga(riga);
          if (c) d.cell.styles.fillColor = c;
        }
        const speciale = colonne[d.column.index].cella;
        if (speciale) speciale(d, riga);
      }
    });
    return doc.lastAutoTable.finalY + 4;
  }

  // Cella che sembra un'etichetta colorata (fase, classificazione).
  function etichetta(d, rgb) {
    d.cell.styles.fillColor = rgb;
    d.cell.styles.textColor = testoSu(rgb);
    d.cell.styles.fontStyle = 'bold';
    d.cell.styles.halign = 'center';
  }

  // Linea e numero di pagina su ogni pagina, da chiamare a documento finito.
  function piePagina(doc, sinistra, destra) {
    const { L, A } = misure(doc);
    const pagine = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pagine; i++) {
      doc.setPage(i);
      colore.bordo(doc, COLORI.bordo);
      doc.setLineWidth(0.2);
      doc.line(M, A - 12, L - M, A - 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      colore.testo(doc, COLORI.tenue);
      if (sinistra) doc.text(sinistra, M, A - 8);
      doc.text('Pagina ' + i + ' / ' + pagine, L / 2, A - 8, { align: 'center' });
      if (destra) doc.text(destra, L - M, A - 8, { align: 'right' });
    }
  }

  function nomeFile(prefisso) {
    const d = new Date();
    const due = (n) => String(n).padStart(2, '0');
    const quando = d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate()) + '_' + due(d.getHours()) + '-' + due(d.getMinutes());
    return (prefisso + '_' + quando).replace(/[\\/:*?"<>|\s]+/g, '_') + '.pdf';
  }

  Object.assign(Kit, {
    M, COLORI, COLORI_FASE, testoSu, nuovoDocumento, misure, colore, intestazione, spazio,
    titoloSezione, schedeKpi, blocco, tabella, etichetta, piePagina, nomeFile
  });
})(window);
