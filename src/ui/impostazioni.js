/* Impostazioni dell'archivio: valore FTE per progetto e destinatari delle email VPU. */
(function (radice) {
  'use strict';

  const MP = radice.MP;
  const UI = MP.ui;
  const { h } = UI;
  const Modello = MP.modello;

  // Accetta 0,2 e 0.2 (un FTE e' sempre tra 0 e 1, quindi il punto non e' mai un separatore di migliaia).
  function leggiFte(testo) {
    const t = String(testo).trim().replace(',', '.');
    return t === '' ? NaN : Number(t);
  }

  function apriImpostazioni() {
    const S = UI.stato;
    const cfg = S.config;
    const fte = h('input', { type: 'text', inputmode: 'decimal', value: String(cfg.fteProgetto).replace('.', ','), id: 'imp-fte', autocomplete: 'off' });
    const destinatari = h('textarea', { rows: 4, id: 'imp-dest', placeholder: 'un indirizzo per riga' }, cfg.destinatariVpu.join('\n'));
    const errore = h('div', { class: 'riepilogo-errori', role: 'alert', hidden: true });

    const contenuto = h('div', {},
      errore,
      h('div', { class: 'campo' },
        h('label', { for: 'imp-fte' }, 'FTE per progetto (tra 0 e 1)'),
        fte,
        h('span', { class: 'tenue' }, 'Quanto pesa ogni progetto attivo sul project manager. 0,20 è un segnaposto finché non si conosce il valore reale.')),
      h('div', { class: 'campo', style: { marginTop: '14px' } },
        h('label', { for: 'imp-dest' }, 'Destinatari delle email di richiesta VPU'),
        destinatari,
        h('span', { class: 'tenue' }, 'Separati da a capo, virgola o punto e virgola.')),
      h('p', { class: 'tenue', style: { marginTop: '14px' } },
        S.modalita === 'demo'
          ? 'Dati di prova: le impostazioni non vengono salvate dopo la chiusura della pagina.'
          : 'Le impostazioni sono salvate nella cartella dei dati e valgono per tutti i colleghi.'));

    UI.dialogo({
      titolo: 'Impostazioni',
      larghezza: 'min(560px, 96vw)',
      contenuto,
      pulsanti: [
        { testo: 'Annulla', valore: 'annulla' },
        {
          testo: 'Salva', classe: 'btn-ok', valore: 'salvato',
          azione: async () => {
            const nuova = Modello.creaConfigurazione(Object.assign({}, cfg, {
              fteProgetto: leggiFte(fte.value),
              destinatariVpu: destinatari.value.split(/[\n,;]+/).map((x) => x.trim()).filter((x) => x)
            }));
            const errori = Modello.validaConfigurazione(nuova);
            if (errori.length) {
              errore.textContent = errori.map((e) => e.messaggio).join('. ');
              errore.hidden = false;
              return false;
            }
            try {
              S.config = await S.adapter.salvaConfigurazione(nuova);
              UI.toast('Impostazioni salvate', 'ok');
              UI.aggiorna();
              return true;
            } catch (e) {
              errore.textContent = 'Salvataggio non riuscito: ' + e.message;
              errore.hidden = false;
              return false;
            }
          }
        }
      ]
    });
    fte.focus();
  }

  UI.apriImpostazioni = apriImpostazioni;
})(window);
