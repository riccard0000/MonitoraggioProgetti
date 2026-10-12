/* Impostazioni di un team: valore FTE per progetto e destinatari delle email VPU.
 * Con piu' team si sceglie il team; dove non si puo' scrivere le impostazioni si vedono soltanto.
 */
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

  // `teamIniziale`: il team da mostrare per primo (altrimenti quello filtrato, o il primo modificabile).
  function apriImpostazioni(teamIniziale) {
    const S = UI.stato;
    const multi = UI.multi();
    let team = teamIniziale
      || S.filtri.team
      || (UI.squadreScrivibili()[0] || S.squadre[0] || {}).nome;

    const fte = h('input', { type: 'text', inputmode: 'decimal', id: 'imp-fte', autocomplete: 'off' });
    const destinatari = h('textarea', { rows: 4, id: 'imp-dest', placeholder: 'un indirizzo per riga' });
    const errore = h('div', { class: 'riepilogo-errori', role: 'alert', hidden: true });
    const avviso = h('p', { class: 'tenue', style: { marginTop: '14px' } });
    let bottoneSalva = null;

    // Riempie i campi con le impostazioni del team scelto e li blocca se non si puo' scrivere.
    function mostraTeam() {
      const cfg = UI.config(team);
      fte.value = String(cfg.fteProgetto).replace('.', ',');
      destinatari.value = cfg.destinatariVpu.join('\n');
      const puoScrivere = UI.scrivibile(team);
      fte.disabled = destinatari.disabled = !puoScrivere;
      if (bottoneSalva) bottoneSalva.disabled = !puoScrivere;
      errore.hidden = true;
      avviso.textContent = !puoScrivere
        ? (S.consultazione ? 'Sola consultazione: le impostazioni si vedono ma non si possono modificare.' : 'Sola lettura: le impostazioni di questo team si vedono ma non si possono modificare.')
        : S.modalita === 'demo'
          ? 'Dati di prova: le impostazioni non vengono salvate dopo la chiusura della pagina.'
          : 'Le impostazioni sono salvate nella cartella del team e valgono per tutti i suoi referenti.';
    }

    const selezione = multi
      ? h('div', { class: 'campo', style: { marginBottom: '14px' } },
        h('label', { for: 'imp-team' }, 'Team'),
        h('select', { id: 'imp-team', onchange: (e) => { team = e.target.value; mostraTeam(); } },
          S.squadre.map((s) => h('option', { value: s.nome, selected: s.nome === team }, s.nome + (s.scrivibile ? '' : ' (sola lettura)')))))
      : null;

    const contenuto = h('div', {},
      errore,
      selezione,
      h('div', { class: 'campo' },
        h('label', { for: 'imp-fte' }, 'FTE per progetto (tra 0 e 1)'),
        fte,
        h('span', { class: 'tenue' }, 'Quanto pesa ogni progetto attivo sul project manager. 0,20 è un segnaposto finché non si conosce il valore reale.')),
      h('div', { class: 'campo', style: { marginTop: '14px' } },
        h('label', { for: 'imp-dest' }, 'Destinatari delle email di richiesta VPU'),
        destinatari,
        h('span', { class: 'tenue' }, 'Separati da a capo, virgola o punto e virgola.')),
      avviso);

    const d = UI.dialogo({
      titolo: 'Impostazioni',
      larghezza: 'min(560px, 96vw)',
      contenuto,
      pulsanti: [
        { testo: 'Annulla', valore: 'annulla' },
        {
          testo: 'Salva', classe: 'btn-ok', valore: 'salvato',
          azione: async () => {
            const nuova = Modello.creaConfigurazione(Object.assign({}, UI.config(team), {
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
              S.configPerTeam[team] = await S.adapter.salvaConfigurazione(nuova, multi ? team : undefined);
              UI.toast('Impostazioni salvate', 'ok');
              UI.aggiorna();
              return true;
            } catch (e) {
              if (UI.gestisciErroreScrittura(e)) { mostraTeam(); return false; }
              errore.textContent = 'Salvataggio non riuscito: ' + e.message;
              errore.hidden = false;
              return false;
            }
          }
        }
      ]
    });
    bottoneSalva = d.pulsanti[1];
    mostraTeam();
    if (!fte.disabled) fte.focus();
  }

  UI.apriImpostazioni = apriImpostazioni;
})(window);
