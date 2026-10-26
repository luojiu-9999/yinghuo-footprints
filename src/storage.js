import { validateBackup, validateRecord, validateLayouts, mergeBackup, assertBackupCapacity } from './backup.js';
const LEGACY_KEY = 'yinghuo-data-v1';
const EVENT_KEY = 'yinghuo-update-v2';
const DB_NAME = 'yinghuo-footprints';
let databasePromise;
const localListeners = new Set();
let channel;
function events() { if (!channel && typeof BroadcastChannel !== 'undefined') { channel = new BroadcastChannel('yinghuo-update-v2'); channel.onmessage = e => localListeners.forEach(fn => fn(e.data.type)); } }
function publish(type) { events(); channel?.postMessage({ type }); localListeners.forEach(fn => fn(type)); try { localStorage.setItem(EVENT_KEY, JSON.stringify({ type, nonce: crypto.randomUUID() })); } catch { /* Data is already committed to IndexedDB; this is only a fallback signal. */ } }
export function subscribeChanges(fn) { events(); localListeners.add(fn); const listener = e => { if (e.key === EVENT_KEY && e.newValue) { try { fn(JSON.parse(e.newValue).type); } catch {} } }; window.addEventListener('storage', listener); return () => { localListeners.delete(fn); window.removeEventListener('storage', listener); }; }
const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
function completed(tx) { const promise = new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('保存事务未完成')); tx.onerror = () => {}; }); promise.catch(() => {}); return promise; }
export function database() {
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('当前浏览器不支持本地数据库，请使用现代浏览器')); return; }
    const open = indexedDB.open(DB_NAME, 2);
    open.onupgradeneeded = () => { const db = open.result; for (const [name, keyPath] of [['records','id'],['marks','code'],['drafts','id'],['photos','id'],['layouts','key'],['meta',null]]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, keyPath ? { keyPath } : undefined); };
    open.onsuccess = () => { const db = open.result; db.onversionchange = () => { db.close(); databasePromise = undefined; }; resolve(db); };
    open.onerror = () => { databasePromise = undefined; reject(open.error); };
    open.onblocked = () => { databasePromise = undefined; reject(new Error('请关闭旧版本页面后重新打开')); };
  });
  return databasePromise;
}
export async function initializeData(fallback) {
  const db = await database(); const tx = db.transaction(['records', 'marks', 'meta'], 'readwrite'); const done = completed(tx);
  try {
    const meta = tx.objectStore('meta');
    if (!await request(meta.get('state'))) {
      const raw = localStorage.getItem(LEGACY_KEY);
      let initial = fallback;
      if (raw !== null) { try { initial = validateBackup(JSON.parse(raw)); } catch { throw new Error('旧版旅行数据无法读取，已保留原内容，请先检查旧版备份'); } }
      for (const record of initial.records) tx.objectStore('records').put({ ...record, version: record.version || 1 });
      for (const mark of initial.marks) tx.objectStore('marks').put(mark);
      meta.put({ revision: 1, initialized: true, migratedLegacy: raw !== null }, 'state');
    }
    await done; return readData();
  } catch (error) { try { tx.abort(); } catch {} throw error; }
}
export async function readData() {
  const db = await database(), tx = db.transaction(['records', 'marks', 'meta'], 'readonly'), done = completed(tx);
  const [records, marks, state] = await Promise.all([request(tx.objectStore('records').getAll()), request(tx.objectStore('marks').getAll()), request(tx.objectStore('meta').get('state'))]);
  await done; return { records, marks, revision: state?.revision || 0 };
}
// A read/write transaction serializes operations across tabs. Mutators always receive
// the latest committed records, never the stale collection rendered by a page.
export async function mutateData(mutator, { draftId, checkpoint = false, assets = [], layouts, replaceLayouts = false } = {}) {
  const db = await database(), tx = db.transaction(['records', 'marks', 'meta', 'drafts', 'photos', 'layouts'], 'readwrite'), done = completed(tx);
  try {
    const recordStore = tx.objectStore('records'), markStore = tx.objectStore('marks'), metaStore = tx.objectStore('meta');
    const [records, marks, meta] = await Promise.all([request(recordStore.getAll()), request(markStore.getAll()), request(metaStore.get('state'))]);
    const current = { records, marks, revision: meta?.revision || 0 };
    const revision = records.reduce((highest, r) => Math.max(highest, Number(r.version) || 0), current.revision) + 1;
    if (!Number.isSafeInteger(revision)) throw new Error('记录版本信息异常，请检查备份；原数据未改变');
    const next = mutator(current);
    validateBackup(next);
    const layoutStore = tx.objectStore('layouts'), photoStore = tx.objectStore('photos');
    const existingLayouts = await request(layoutStore.getAll());
    if (checkpoint) metaStore.put({ records, marks, layouts: existingLayouts, savedAt: new Date().toISOString() }, 'pre-restore');
    for (const asset of assets) { const existing = await request(photoStore.get(asset.id)); if (existing && existing.sha256 !== asset.sha256) throw new Error('照片ID冲突，原图未覆盖'); if (!existing) photoStore.put(asset); }
    for (const ref of new Set(next.records.flatMap(r => r.photos).filter(p => p.startsWith('photo:')))) if (!await request(photoStore.get(ref.slice(6)))) throw new Error('原图文件缺失，请使用包含照片的完整备份');
    if (layouts !== undefined) {
      const clean = validateLayouts(layouts);
      for (const ref of new Set(clean.flatMap(l => [...l.single.photos, ...l.multi.photos]).filter(p => p.startsWith('photo:')))) if (!await request(photoStore.get(ref.slice(6)))) throw new Error('拼贴照片文件缺失');
      if (replaceLayouts) layoutStore.clear();
      for (const layout of clean) if (replaceLayouts || !existingLayouts.some(l => l.key === layout.key)) layoutStore.put(layout);
    }
    assertBackupCapacity(next,await request(layoutStore.getAll()),await request(photoStore.getAllKeys()));
    const oldRecords = new Map(records.map(r => [r.id, r])), newIds = new Set(next.records.map(r => r.id));
    const savedRecords = next.records.map(r => {
      const old = oldRecords.get(r.id);
      if (r === old) return old;
      const updated = { ...r, version: revision, updatedAt: new Date().toISOString() }; recordStore.put(updated); return updated;
    });
    for (const old of records) if (!newIds.has(old.id)) recordStore.delete(old.id);
    const oldMarks = new Map(marks.map(m => [m.code, m])), newCodes = new Set(next.marks.map(m => m.code));
    for (const mark of next.marks) if (mark !== oldMarks.get(mark.code)) markStore.put(mark);
    for (const old of marks) if (!newCodes.has(old.code)) markStore.delete(old.code);
    if (draftId) tx.objectStore('drafts').delete(draftId);
    metaStore.put({ ...meta, initialized: true, revision }, 'state');
    await done; publish('data'); if (draftId) publish('drafts');
    return { records: savedRecords, marks: next.marks, revision };
  } catch (error) { try { tx.abort(); } catch {} throw error; }
}
export async function storeRecord(record, { expectedVersion, draftId } = {}) {
  record = validateRecord(record);
  return mutateData(current => {
    const existing = current.records.find(r => r.id === record.id);
    if (expectedVersion !== undefined && (!existing || existing.version !== expectedVersion)) { const error = new Error('这条记录已在其他页面修改或删除，你的草稿仍保留'); error.code = 'CONFLICT'; throw error; }
    if (expectedVersion === undefined && existing) throw new Error('记录ID已存在，请重新创建记录');
    return { ...current, records: [...current.records.filter(r => r.id !== record.id), record] };
  }, { draftId });
}
export async function restoreBackup(incoming, mode, expectedRevision) {
  const clean = validateBackup(incoming);
  return mutateData(current => {
  if (mode === 'replace' && current.revision !== expectedRevision) throw new Error('恢复期间有其他页面更新了记录，请重新检查当前记录后再确认替换');
  return mode === 'replace' ? clean : mergeBackup(current, clean);
}, { checkpoint: mode === 'replace', assets: incoming.assets || [], layouts: clean.layouts, replaceLayouts: mode === 'replace' }); }
export async function readCheckpoint() { const db = await database(), tx = db.transaction('meta', 'readonly'); return request(tx.objectStore('meta').get('pre-restore')); }
export async function getDrafts() { const db = await database(), tx = db.transaction('drafts', 'readonly'); return (await request(tx.objectStore('drafts').getAll())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
export async function saveDraft(draft) { const db = await database(), tx = db.transaction('drafts', 'readwrite'), done = completed(tx); tx.objectStore('drafts').put({ ...draft, updatedAt: new Date().toISOString() }); await done; publish('drafts'); }
export async function removeDraft(id) { const db = await database(), tx = db.transaction('drafts', 'readwrite'), done = completed(tx); tx.objectStore('drafts').delete(id); await done; publish('drafts'); }
export function tabOwner() { try { let id = sessionStorage.getItem('yinghuo-tab-owner'); if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('yinghuo-tab-owner', id); } return id; } catch { return crypto.randomUUID(); } }
export async function photoLibraryRefs() { const db = await database(), tx = db.transaction('photos', 'readonly'), done = completed(tx); const keys = await request(tx.objectStore('photos').getAllKeys()); await done; return keys.map(id => 'photo:' + id); }
export async function exportBackup() {
  // One read transaction gives records, layouts and the original library a consistent snapshot.
  const db = await database(), tx = db.transaction(['records','marks','layouts','photos'], 'readonly'), done = completed(tx);
  const [records,marks,layouts,keys] = await Promise.all(['records','marks','layouts'].map(name => request(tx.objectStore(name).getAll())).concat(request(tx.objectStore('photos').getAllKeys())));
  await done; return { app:'yinghuo-footprints',schemaVersion:3,exportedAt:new Date().toISOString(),records,marks,layouts,library:keys.map(id=>'photo:'+id) };
}
export async function getLayouts() { const db = await database(), tx = db.transaction('layouts', 'readonly'); return request(tx.objectStore('layouts').getAll()); }
export async function saveLayout(layout) {
  const clean = validateLayouts([layout])[0], db = await database(), tx = db.transaction(['records','marks','layouts', 'meta', 'photos'], 'readwrite'), done = completed(tx);
  try {
    for (const ref of [...clean.single.photos, ...clean.multi.photos].filter(p => p.startsWith('photo:'))) if (!await request(tx.objectStore('photos').get(ref.slice(6)))) throw new Error('照片不存在');
    const meta = tx.objectStore('meta'), state = await request(meta.get('state'));
    const [records,marks,allLayouts,photoIds]=await Promise.all([request(tx.objectStore('records').getAll()),request(tx.objectStore('marks').getAll()),request(tx.objectStore('layouts').getAll()),request(tx.objectStore('photos').getAllKeys())]);
    assertBackupCapacity({records,marks},[...allLayouts.filter(l=>l.key!==clean.key),clean],photoIds);
    if(!Number.isSafeInteger((state?.revision || 0)+1)) throw new Error('版本信息异常，原布局未改变');
    tx.objectStore('layouts').put(clean); meta.put({ ...state, revision: (state?.revision || 0) + 1 }, 'state'); await done; publish('data'); return clean;
  } catch (error) { try { tx.abort(); } catch {} throw error; }
}
export async function rawRescueBackup() {
  let legacy; try { legacy = localStorage.getItem(LEGACY_KEY); } catch { legacy = 'localStorage unavailable'; }
  let data; try { data = await exportBackup(); } catch (e) { data = { error: e.message }; }
  return { app: 'yinghuo-rescue', rescuedAt: new Date().toISOString(), legacyRaw: legacy, data };
}
export async function compressPhoto(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') throw new Error('请选择 JPG、PNG 或 WebP 格式的照片');
  if (file.size > 20 * 1024 * 1024) throw new Error('单张照片请小于 20 MB');
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1100 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return canvas.toDataURL('image/jpeg', 0.72);
}
