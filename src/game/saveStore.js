// KAYIT DEPOSU — yuvalar IndexedDB'de, dizin localStorage'da.
//
// Neden ikisi: tek kayıt 1917'de 3,7 milyon karakterdi (129 ulus, 820 tümen)
// ve Chrome'un localStorage tavanı adres başına ~5 milyondur; tek yuva bile
// kampanyanın sonuna doğru sessizce yazılamaz olurdu, ikinci yuvaya hiç yer
// yoktu. Otomatik kayıt elle alınan kaydı da eziyordu (tek anahtar). IndexedDB
// yüzlerce MB alır ama zaman uyumsuzdur; menüler kayıt listesini anında
// göstermek ister. O yüzden küçük dizin (ad, tarih, ulus) eşzamanlı
// localStorage'da, ağır metin IndexedDB'de durur.
//
// IndexedDB yoksa (eski tarayıcı, kısıtlı pencere) metin de localStorage'a
// yazılır: eski davranış, yuva başına bir anahtar.

const INDEX_KEY = 'hexwar.saveIndex';
const TEXT_PREFIX = 'hexwar.save:';
/** Eski tek yuvalı kayıt; dizinde "older autosave" olarak görünür, ilk yeni otomatik kayıtta silinir. */
export const LEGACY_KEY = 'hexwar.save';
export const LEGACY_SLOT = 'legacy';
export const AUTO_SLOT = 'auto';
/** Elle alınan kayıt sayısı tavanı: her biri birkaç MB, liste de okunur kalmalı. */
export const MAX_MANUAL = 12;

const DB_NAME = 'hexwar';
const STORE = 'saves';
let dbPromise = null;

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch (err) {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function idb(mode, act) {
  return openDb().then((db) => {
    if (!db) return { ok: false, unavailable: true };
    return new Promise((resolve) => {
      let tx;
      try {
        tx = db.transaction(STORE, mode);
      } catch (err) {
        resolve({ ok: false, error: err });
        return;
      }
      const request = act(tx.objectStore(STORE));
      tx.oncomplete = () => resolve({ ok: true, value: request?.result });
      tx.onerror = () => resolve({ ok: false, error: tx.error });
      tx.onabort = () => resolve({ ok: false, error: tx.error });
    });
  });
}

function readLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      slot: LEGACY_SLOT, name: 'Older autosave', auto: true, seed: data.seed, turn: data.turn,
      savedAt: data.savedAt, version: data.version, nation: null, chars: raw.length,
    };
  } catch (err) {
    return null;
  }
}

function readIndex() {
  try {
    const rows = JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]');
    return Array.isArray(rows) ? rows.filter((row) => row && typeof row.slot === 'string') : [];
  } catch (err) {
    return [];
  }
}

function writeIndex(rows) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(rows));
    return true;
  } catch (err) {
    return false;
  }
}

/** Bütün kayıtlar, en yenisi önce. Eşzamanlıdır: menü ve ekran beklemeden çizer. */
export function listSaves() {
  const rows = readIndex();
  const legacy = readLegacy();
  if (legacy) rows.push(legacy);
  return rows.sort((a, b) => String(b.savedAt ?? '').localeCompare(String(a.savedAt ?? '')));
}

/** Yeni elle kayıt yuvası kimliği (oyun durumuna girmez; determinizmi etkilemez). */
export function newSlotId() {
  return `m${Date.now().toString(36)}`;
}

export function manualCount() {
  return readIndex().filter((row) => !row.auto).length;
}

/**
 * Metni yuvaya yazar, sonra dizini günceller. Dizin metinden SONRA yazılır:
 * yarıda kalan kayıt listede görünüp yüklenemez hâlde kalmasın.
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function writeSave(slot, text, meta) {
  const stored = await idb('readwrite', (store) => store.put(text, slot));
  if (!stored.ok) {
    if (!stored.unavailable) {
      console.error('[save] IndexedDB write failed', stored.error);
      return { ok: false, reason: 'browser storage refused the save (disk full or private window?)' };
    }
    try {
      localStorage.setItem(TEXT_PREFIX + slot, text);
    } catch (err) {
      return { ok: false, reason: 'browser storage is full or disabled' };
    }
  }
  const rows = readIndex().filter((row) => row.slot !== slot);
  rows.push({ ...meta, slot, chars: text.length });
  if (!writeIndex(rows)) return { ok: false, reason: 'browser storage is full or disabled' };
  // İlk yeni otomatik kayıt eski tek yuvanın yerini alır; 3,7 MB'lık eski
  // anahtar localStorage'da kalırsa dizine yer bırakmaz.
  if (slot === AUTO_SLOT) {
    try { localStorage.removeItem(LEGACY_KEY); } catch (err) { /* depo kapalı */ }
  }
  return { ok: true };
}

/** Yuvadaki metin; yoksa null. */
export async function readSave(slot) {
  if (slot === LEGACY_SLOT) {
    try { return localStorage.getItem(LEGACY_KEY); } catch (err) { return null; }
  }
  const found = await idb('readonly', (store) => store.get(slot));
  if (found.ok && typeof found.value === 'string') return found.value;
  try { return localStorage.getItem(TEXT_PREFIX + slot); } catch (err) { return null; }
}

export async function deleteSave(slot) {
  if (slot === LEGACY_SLOT) {
    try { localStorage.removeItem(LEGACY_KEY); } catch (err) { /* depo kapalı */ }
    return true;
  }
  await idb('readwrite', (store) => store.delete(slot));
  try { localStorage.removeItem(TEXT_PREFIX + slot); } catch (err) { /* depo kapalı */ }
  writeIndex(readIndex().filter((row) => row.slot !== slot));
  return true;
}

/** Yuvanın adını değiştirir (yalnız dizin). */
export function renameSave(slot, name) {
  const rows = readIndex();
  const row = rows.find((r) => r.slot === slot);
  if (!row) return false;
  row.name = name;
  return writeIndex(rows);
}
