'use strict';
// Cartella finta che imita l'interfaccia della File System Access API
// (getFileHandle, getDirectoryHandle, createWritable, removeEntry, entries ...).
// Serve a provare in Node tutto cio' che normalmente richiede il browser.

let orologio = 1000;

function errore(name) {
  return Object.assign(new Error(name), { name });
}

function creaFile() {
  let testo = '';
  let modificato = ++orologio;
  return {
    kind: 'file',
    async createWritable() {
      let buffer = '';
      return {
        async write(t) { buffer += t; },
        async close() { testo = buffer; modificato = ++orologio; }
      };
    },
    async getFile() {
      return { async text() { return testo; }, lastModified: modificato, size: testo.length };
    }
  };
}

// maiuscoleDistinte=false imita Windows/OneDrive (nomi file senza distinzione).
function creaDir({ nome = 'cartella-finta', maiuscoleDistinte = false, falliSottocartella = false } = {}) {
  const chiave = (n) => (maiuscoleDistinte ? n : n.toLowerCase());
  const voci = new Map();
  return {
    kind: 'directory',
    name: nome,
    voci,
    async queryPermission() { return 'granted'; },
    async getFileHandle(n, opz = {}) {
      let v = voci.get(chiave(n));
      if (!v) {
        if (!opz.create) throw errore('NotFoundError');
        v = { nome: n, handle: creaFile() };
        voci.set(chiave(n), v);
      }
      if (v.handle.kind !== 'file') throw errore('TypeMismatchError');
      return v.handle;
    },
    async getDirectoryHandle(n, opz = {}) {
      if (falliSottocartella) throw errore('NotAllowedError');
      let v = voci.get(chiave(n));
      if (!v) {
        if (!opz.create) throw errore('NotFoundError');
        v = { nome: n, handle: creaDir({ nome: n, maiuscoleDistinte }) };
        voci.set(chiave(n), v);
      }
      if (v.handle.kind !== 'directory') throw errore('TypeMismatchError');
      return v.handle;
    },
    async removeEntry(n, opz = {}) {
      const v = voci.get(chiave(n));
      if (!v) throw errore('NotFoundError');
      if (v.handle.kind === 'directory' && v.handle.voci.size && !opz.recursive) {
        throw errore('InvalidModificationError');
      }
      voci.delete(chiave(n));
    },
    async *entries() {
      for (const v of voci.values()) yield [v.nome, v.handle];
    }
  };
}

// Scorciatoie per i test: leggere e scrivere un file dato il percorso ['progetti', 'X.json'].
async function leggiPercorso(radice, percorso) {
  let dir = radice;
  for (const parte of percorso.slice(0, -1)) dir = await dir.getDirectoryHandle(parte);
  const fh = await dir.getFileHandle(percorso[percorso.length - 1]);
  return (await fh.getFile()).text();
}

async function scriviPercorso(radice, percorso, testo) {
  let dir = radice;
  for (const parte of percorso.slice(0, -1)) dir = await dir.getDirectoryHandle(parte, { create: true });
  const fh = await dir.getFileHandle(percorso[percorso.length - 1], { create: true });
  const w = await fh.createWritable();
  await w.write(testo);
  await w.close();
}

async function elencoPercorso(radice, percorso) {
  let dir = radice;
  for (const parte of percorso) dir = await dir.getDirectoryHandle(parte);
  const nomi = [];
  for await (const [n] of dir.entries()) nomi.push(n);
  return nomi.sort();
}

module.exports = { creaDir, errore, leggiPercorso, scriviPercorso, elencoPercorso };
