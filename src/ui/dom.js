/* Strumenti per costruire la pagina in modo sicuro.
 *
 * Tutto cio' che viene dai dati (descrizioni, note, CSV importati) entra nella pagina come
 * testo, mai come HTML: `h()` crea gli elementi e i figli stringa diventano nodi di testo.
 */
(function (radice) {
  'use strict';

  const MP = radice.MP = radice.MP || {};
  const UI = MP.ui = MP.ui || {};
  const Data = MP.date;
  const Importi = MP.importi;

  // Proprieta' (non attributi) da impostare direttamente sull'elemento.
  const PROPRIETA = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'readOnly', 'required', 'multiple', 'open']);

  // h('div', { class: 'x', onclick: fn }, 'testo', altroNodo, [lista])
  function h(tag, attributi, ...figli) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attributi || {})) {
      if (v == null || v === false) continue;
      if (k === 'class' || k === 'className') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (PROPRIETA.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    aggiungi(el, figli);
    return el;
  }

  function aggiungi(el, figli) {
    for (const f of figli.flat(Infinity)) {
      if (f == null || f === false) continue;
      el.append(f instanceof Node ? f : document.createTextNode(String(f)));
    }
  }

  function svuota(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  function sostituisci(el, ...figli) {
    svuota(el);
    aggiungi(el, figli);
    return el;
  }

  const senzaAccenti = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function badgeFase(fase) {
    return h('span', { class: 'badge badge-' + senzaAccenti(fase || 'nd') }, fase || 'n/d');
  }

  // valore: 'SI' | 'NO' | 'PARZIALE' | '-'
  function badgeSiNo(valore) {
    const classi = { SI: 'si', NO: 'no', PARZIALE: 'par', '-': 'nd' };
    return h('span', { class: 'etichetta etichetta-' + (classi[valore] || 'nd') }, valore === 'PARZIALE' ? 'Parziale' : valore);
  }

  const euro = (numero) => Importi.formatoEuro(numero) + ' €';
  const dataIT = (iso) => Data.formatoIT(iso) || '-';

  function periodo(p) {
    if (p.inizio && p.fine) return dataIT(p.inizio) + ' – ' + dataIT(p.fine);
    if (p.inizio) return 'dal ' + dataIT(p.inizio);
    if (p.fine) return 'fino al ' + dataIT(p.fine);
    return '-';
  }

  // Data di oggi nel fuso locale, `aaaa-mm-gg`.
  function oggiIso() {
    const d = new Date();
    return Data.iso(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // ------------------------------------------------------------- notifiche

  function toast(messaggio, tipo) {
    let contenitore = document.getElementById('toasts');
    if (!contenitore) {
      contenitore = h('div', { id: 'toasts', 'aria-live': 'polite' });
      document.body.appendChild(contenitore);
    }
    const t = h('div', { class: 'toast toast-' + (tipo || 'info'), role: tipo === 'errore' ? 'alert' : 'status' }, messaggio);
    contenitore.appendChild(t);
    setTimeout(() => t.remove(), tipo === 'errore' ? 9000 : 4000);
    return t;
  }

  // ---------------------------------------------------------------- dialoghi

  // opzioni: { titolo, contenuto, pulsanti: [{ testo, classe, valore, azione }], larghezza,
  //            puoChiudere: () => boolean | Promise<boolean> }
  // Un pulsante con `azione` la esegue (se restituisce false il dialogo resta aperto);
  // altrimenti chiude il dialogo con il suo `valore`.
  // -> { el, corpo, chiudi(valore), finita: Promise<valore>, pulsanti: [elementi] }
  //    (Esc e X chiudono con 'annulla')
  function dialogo(opzioni) {
    const dlg = h('dialog', { class: 'dlg' });
    dlg.style.width = opzioni.larghezza || 'min(720px, 96vw)';

    let risolvi;
    const finita = new Promise((ok) => { risolvi = ok; });
    let valoreFinale = 'annulla';
    let chiudendo = false;

    function chiudi(valore) {
      valoreFinale = valore === undefined ? 'annulla' : valore;
      if (dlg.open) dlg.close();
    }

    async function tentaChiusura() {
      if (chiudendo) return;
      chiudendo = true;
      try {
        if (!opzioni.puoChiudere || (await opzioni.puoChiudere())) chiudi('annulla');
      } finally {
        chiudendo = false;
      }
    }

    const corpo = h('div', { class: 'dlg-corpo' }, opzioni.contenuto);
    const pulsanti = (opzioni.pulsanti || []).map((p) => h('button', {
      type: 'button',
      class: 'btn ' + (p.classe || 'btn-secondario'),
      disabled: !!p.disabilitato,
      onclick: async () => {
        if (p.azione) {
          const esito = await p.azione();
          if (esito === false) return;
        }
        chiudi(p.valore);
      }
    }, p.testo));

    aggiungi(dlg, [h('div', { class: 'dlg-interno' },
      h('div', { class: 'dlg-testa' },
        h('h2', {}, opzioni.titolo),
        h('button', { type: 'button', class: 'icona', 'aria-label': 'Chiudi', onclick: tentaChiusura }, '×')),
      corpo,
      pulsanti.length ? h('div', { class: 'dlg-piede' }, pulsanti) : null)]);

    dlg.addEventListener('cancel', (e) => { e.preventDefault(); tentaChiusura(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) tentaChiusura(); });
    dlg.addEventListener('close', () => { dlg.remove(); risolvi(valoreFinale); });

    document.body.appendChild(dlg);
    dlg.showModal();
    return { el: dlg, corpo, chiudi, finita, pulsanti };
  }

  // -> Promise<boolean>
  async function conferma(testo, opzioni) {
    const o = opzioni || {};
    const d = dialogo({
      titolo: o.titolo || 'Conferma',
      larghezza: 'min(460px, 96vw)',
      contenuto: h('p', { class: 'testo-conferma' }, testo),
      pulsanti: [
        { testo: o.annulla || 'Annulla', valore: false },
        { testo: o.conferma || 'Conferma', classe: o.pericolo ? 'btn-pericolo' : 'btn-primario', valore: true }
      ]
    });
    return (await d.finita) === true;
  }

  // ------------------------------------------------------------------ file

  function scarica(nome, tipo, contenuto) {
    const url = URL.createObjectURL(new Blob([contenuto], { type: tipo }));
    const a = h('a', { href: url, download: nome });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  Object.assign(UI, {
    h, aggiungi, svuota, sostituisci, badgeFase, badgeSiNo, euro, dataIT, periodo, oggiIso,
    toast, dialogo, conferma, scarica, senzaAccenti
  });
})(window);
