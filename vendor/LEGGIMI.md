# Librerie di terze parti

File minificati copiati dai pacchetti npm (scaricati con `npm pack`, che ne verifica l'integrità), con versione fissata. Niente CDN: la rete aziendale potrebbe bloccarli e la pagina deve funzionare anche offline.

| Cartella | Pacchetto | Versione | File | Licenza |
|---|---|---|---|---|
| `chart.js/` | [chart.js](https://www.npmjs.com/package/chart.js) | 4.5.1 | `chart.umd.min.js` | MIT |
| `jspdf/` | [jspdf](https://www.npmjs.com/package/jspdf) | 4.2.1 | `jspdf.umd.min.js` | MIT |
| `jspdf-autotable/` | [jspdf-autotable](https://www.npmjs.com/package/jspdf-autotable) | 5.0.8 | `jspdf.plugin.autotable.min.js` | MIT |

Per aggiornare: `npm pack <pacchetto>@<versione>` in una cartella vuota, estrarre il `.tgz`, copiare il file minificato di `dist/` e la licenza, poi aggiornare questa tabella.

Il bundle di jsPDF cita `canvg`, `dompurify` e `html2canvas` solo per le funzioni `html()` e SVG, che l'app non usa.
