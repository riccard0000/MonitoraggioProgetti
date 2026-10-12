/* Verifica ambiente: collegamento tra la pagina e la logica di verifica.js.
 * Script classico (niente moduli) per funzionare da file://.
 */
(function () {
  'use strict';

  var V = window.Verifica;
  var $ = function (id) { return document.getElementById(id); };

  var stato = {
    ambiente: [],
    rete: [],
    cartella: [],
    metriche: null,
    persistenza: null,
    monitor: [],
    dir: null,
    timer: null,
    // Identifica questa pagina nel file di controllo, per distinguere chi ha scritto.
    chi: Math.random().toString(36).slice(2, 6)
  };

  // ------------------------------------------------------------- presentazione

  function mostra(contenitore, risultati) {
    contenitore.textContent = '';
    risultati.forEach(function (r) {
      var li = document.createElement('li');
      li.className = 'st-' + r.stato;
      var tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = V.ETICHETTE[r.stato] || r.stato;
      var titolo = document.createElement('strong');
      titolo.textContent = r.titolo;
      var dett = document.createElement('div');
      dett.className = 'dett';
      dett.textContent = r.dettaglio;
      li.appendChild(tag);
      li.appendChild(titolo);
      li.appendChild(dett);
      contenitore.appendChild(li);
    });
  }

  function mostraErrore(testo) {
    var box = $('errori');
    box.style.display = 'block';
    box.textContent += (box.textContent ? '\n' : '') + testo;
  }

  window.addEventListener('error', function (e) { mostraErrore('Errore: ' + e.message); });
  window.addEventListener('unhandledrejection', function (e) {
    mostraErrore('Errore: ' + V.descriviErrore(e.reason));
  });

  // Esegue un gestore asincrono mostrando gli errori invece di perderli.
  function sicuro(fn) {
    return function () {
      return Promise.resolve().then(fn).catch(function (e) { mostraErrore(V.descriviErrore(e)); });
    };
  }

  // ------------------------------------------------- IndexedDB: cartella ricordata

  function apriDb() {
    return new Promise(function (ok, ko) {
      var r = indexedDB.open('verifica-ambiente', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('handles'); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { ko(r.error); };
    });
  }

  function salvaHandle(handle) {
    return apriDb().then(function (db) {
      return new Promise(function (ok, ko) {
        var tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, 'cartella');
        tx.oncomplete = function () { ok(); };
        tx.onerror = function () { ko(tx.error); };
      });
    });
  }

  function leggiHandle() {
    return apriDb().then(function (db) {
      return new Promise(function (ok, ko) {
        var rq = db.transaction('handles').objectStore('handles').get('cartella');
        rq.onsuccess = function () { ok(rq.result || null); };
        rq.onerror = function () { ko(rq.error); };
      });
    });
  }

  function descriviPersistenza(permesso) {
    if (permesso === 'granted') {
      return { id: 'persistenza', titolo: 'Permesso sulla cartella ricordata', stato: 'ok',
               dettaglio: 'dopo il ricaricamento il permesso è ancora valido: nessun clic in più' };
    }
    return { id: 'persistenza', titolo: 'Permesso sulla cartella ricordata', stato: 'avviso',
             dettaglio: 'dopo il ricaricamento il browser chiede di nuovo il permesso (' + permesso +
                        '): serve un clic di conferma a ogni apertura' };
  }

  function controllaCartellaRicordata() {
    if (!window.indexedDB) return Promise.resolve();
    return leggiHandle().then(function (h) {
      if (!h) {
        stato.persistenza = { id: 'persistenza', titolo: 'Permesso sulla cartella ricordata', stato: 'info',
          dettaglio: 'nessuna cartella ricordata: scegli una cartella al punto 3, poi ricarica la pagina' };
        mostra($('persistenza-lista'), [stato.persistenza]);
        return null;
      }
      return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
        stato.persistenza = descriviPersistenza(p);
        mostra($('persistenza-lista'), [stato.persistenza]);
        if (p === 'granted') {
          usaCartella(h);
        } else {
          $('btn-riattiva').hidden = false;
          $('btn-riattiva').onclick = sicuro(function () {
            return h.requestPermission({ mode: 'readwrite' }).then(function (p2) {
              if (p2 === 'granted') { usaCartella(h); $('btn-riattiva').hidden = true; }
            });
          });
        }
      });
    }).catch(function (e) {
      stato.persistenza = { id: 'persistenza', titolo: 'Permesso sulla cartella ricordata', stato: 'avviso',
        dettaglio: 'impossibile controllare: ' + V.descriviErrore(e) };
      mostra($('persistenza-lista'), [stato.persistenza]);
    });
  }

  // ------------------------------------------------------------------ cartella

  function usaCartella(dir) {
    stato.dir = dir;
    ['btn-crea-controllo', 'btn-scrivi-controllo', 'btn-monitor', 'btn-elimina-controllo'].forEach(function (id) {
      $(id).disabled = false;
    });
  }

  function scegliCartella() {
    return window.showDirectoryPicker({ id: 'verifica-ambiente', mode: 'readwrite' }).then(function (dir) {
      usaCartella(dir);
      $('btn-cartella').disabled = true;
      var n = Math.max(1, Math.min(50, Number($('num-file').value) || 10));
      return V.verificaCartella(dir, {
        file: n,
        avanzamento: function (t) { $('cartella-avanzamento').textContent = ' In corso: ' + t + '…'; }
      }).then(function (out) {
        stato.cartella = out.risultati;
        stato.metriche = out.metriche;
        mostra($('cartella-lista'), out.risultati);
        $('cartella-avanzamento').textContent = ' Completato.';
        return salvaHandle(dir).catch(function () { /* la persistenza e' facoltativa */ });
      });
    }, function (e) {
      if (e && e.name === 'AbortError') return;
      throw e;
    }).then(function () { $('btn-cartella').disabled = false; },
            function (e) { $('btn-cartella').disabled = false; throw e; });
  }

  // ------------------------------------------------------------------- monitor

  function orario(ms) { return new Date(ms).toLocaleTimeString('it-IT'); }

  function mostraControllo(c, copie) {
    $('monitor-stato').textContent = 'rev ' + c.rev + ', scritta da ' +
      (c.ultimoScrittore === stato.chi ? 'questa pagina' : 'un\'altra pagina') +
      ', ultima modifica ' + orario(c.lastModified) + ', copie di conflitto: ' + copie;
  }

  function registra(riga) {
    var li = document.createElement('li');
    li.textContent = riga;
    $('monitor-log').appendChild(li);
  }

  function fermaMonitor() {
    if (stato.timer) { clearInterval(stato.timer); stato.timer = null; }
    $('btn-monitor').textContent = 'Avvia il monitoraggio';
  }

  function avviaMonitor() {
    var ultimo = null;
    var copiePrima = 0;
    var t0 = Date.now();
    $('btn-monitor').textContent = 'Ferma il monitoraggio';
    stato.timer = setInterval(function () {
      V.leggiControllo(stato.dir).then(function (c) {
        return V.contaCopieControllo(stato.dir).then(function (copie) {
          var cambiato = !ultimo || c.lastModified !== ultimo.lastModified || c.rev !== ultimo.rev;
          if (cambiato && ultimo) {
            var tSec = Math.round((Date.now() - t0) / 1000);
            var scrittore = c.ultimoScrittore === stato.chi ? 'questa pagina' : 'un\'altra pagina';
            stato.monitor.push({ tSec: tSec, rev: c.rev, scrittore: scrittore, copie: copie });
            registra('dopo ' + tSec + ' s: rev ' + c.rev + ' scritta da ' + scrittore +
                     ' (copie di conflitto: ' + copie + ')');
          } else if (!cambiato && copie !== copiePrima) {
            registra('copie di conflitto del file di controllo: ' + copie);
          }
          ultimo = c;
          copiePrima = copie;
          mostraControllo(c, copie);
        });
      }).catch(function (e) {
        // Durante la sincronizzazione il file puo' risultare incompleto: si riprova al giro dopo.
        $('monitor-stato').textContent = 'lettura non riuscita (' + V.descriviErrore(e) + '), riprovo…';
      });
    }, 2000);
  }

  // ------------------------------------------------------------- questionario

  function costruisciQuestionario() {
    var box = $('questionario');
    V.DOMANDE.forEach(function (d) {
      var riga = document.createElement('div');
      riga.className = 'domanda';
      var label = document.createElement('label');
      label.setAttribute('for', 'q-' + d.id);
      label.textContent = d.testo;
      var sel = document.createElement('select');
      sel.id = 'q-' + d.id;
      var vuota = document.createElement('option');
      vuota.value = '';
      vuota.textContent = V.NON_RISPOSTO;
      sel.appendChild(vuota);
      d.opzioni.forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = o;
        opt.textContent = o;
        sel.appendChild(opt);
      });
      riga.appendChild(label);
      riga.appendChild(sel);
      box.appendChild(riga);
    });
  }

  function leggiRisposte() {
    var r = {};
    V.DOMANDE.forEach(function (d) {
      var v = $('q-' + d.id).value;
      if (v) r[d.id] = v;
    });
    return r;
  }

  // -------------------------------------------------------------------- report

  var ultimoReport = null;

  function generaReport() {
    ultimoReport = V.costruisciReport({
      generatoIl: new Date().toISOString(),
      ambiente: stato.ambiente,
      rete: stato.rete,
      cartella: stato.cartella,
      metriche: stato.metriche,
      persistenza: stato.persistenza,
      monitor: stato.monitor,
      risposte: leggiRisposte(),
      note: $('note').value
    });
    $('report').value = ultimoReport.testo;
    return ultimoReport;
  }

  function scarica(nome, tipo, contenuto) {
    var url = URL.createObjectURL(new Blob([contenuto], { type: tipo }));
    var a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function copia() {
    var r = generaReport();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(r.testo);
    }
    $('report').select();
    document.execCommand('copy');
    return Promise.resolve();
  }

  // ---------------------------------------------------------------------- avvio

  function init() {
    stato.ambiente = V.raccogliAmbiente(window);
    mostra($('ambiente-lista'), stato.ambiente);
    costruisciQuestionario();

    $('btn-rete').onclick = sicuro(function () {
      var extra = [];
      if ($('url-dataverse').value.trim()) extra.push({ id: 'dataverse', nome: 'Ambiente Dataverse indicato', url: $('url-dataverse').value.trim() });
      if ($('url-sharepoint').value.trim()) extra.push({ id: 'sharepoint', nome: 'Sito SharePoint indicato', url: $('url-sharepoint').value.trim() });
      $('btn-rete').disabled = true;
      return V.verificaRete(window.fetch.bind(window), extra).then(function (r) {
        stato.rete = r;
        mostra($('rete-lista'), r);
      }).then(function () { $('btn-rete').disabled = false; },
              function (e) { $('btn-rete').disabled = false; throw e; });
    });

    if (typeof window.showDirectoryPicker !== 'function') {
      $('btn-cartella').disabled = true;
      $('cartella-avanzamento').textContent = ' Questo browser o contesto non offre l\'accesso alle cartelle: prova con Edge o Chrome.';
    } else {
      $('btn-cartella').onclick = sicuro(scegliCartella);
      controllaCartellaRicordata();
    }

    $('btn-crea-controllo').onclick = sicuro(function () {
      return V.creaControllo(stato.dir, stato.chi).then(function (c) {
        return V.contaCopieControllo(stato.dir).then(function (n) { mostraControllo(c, n); });
      });
    });
    $('btn-scrivi-controllo').onclick = sicuro(function () {
      return V.incrementaControllo(stato.dir, stato.chi).then(function (c) {
        return V.contaCopieControllo(stato.dir).then(function (n) {
          mostraControllo(c, n);
          registra('scritta rev ' + c.rev + ' da questa pagina');
        });
      });
    });
    $('btn-monitor').onclick = function () { if (stato.timer) fermaMonitor(); else avviaMonitor(); };
    $('btn-elimina-controllo').onclick = sicuro(function () {
      fermaMonitor();
      return V.eliminaControllo(stato.dir).then(function (n) {
        $('monitor-stato').textContent = 'Rimossi ' + n + ' file di controllo (copie di conflitto comprese).';
      });
    });

    $('btn-report').onclick = generaReport;
    $('btn-copia').onclick = sicuro(copia);
    $('btn-scarica-md').onclick = function () { scarica('verifica-ambiente.md', 'text/markdown', generaReport().testo); };
    $('btn-scarica-json').onclick = function () {
      scarica('verifica-ambiente.json', 'application/json', JSON.stringify(generaReport().json, null, 2));
    };
  }

  init();
})();
