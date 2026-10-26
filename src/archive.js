import { validateBackup, validPhoto, LIMITS } from './backup.js';
import { sha256, getPhoto } from './photo-store.js';
import { publicURL } from './urls.js';

const MAGIC = new TextEncoder().encode('YHF3BIN\n');
const HEADER_BYTES = MAGIC.length + 4;
export async function createArchive(snapshot, resolvePhoto = getPhoto) {
  const clean = validateBackup(snapshot), sources = new Set(clean.records.flatMap(r => r.photos));
  for (const p of clean.library || []) sources.add(p);
  for (const l of clean.layouts || []) for (const p of [...l.single.photos, ...l.multi.photos]) sources.add(p);
  const payload = [], descriptors = [], substitutions = new Map(); let offset = 0;
  for (const source of sources) {
    let asset;
    if (source.startsWith('photo:')) { asset = await resolvePhoto(source); if (!asset?.original) throw new Error('原图缺失，请保留当前数据并检查备份'); }
    else {
      const res = await fetch(publicURL(source)); if (!res.ok) throw new Error('旧版照片读取失败，备份未完成');
      const original = await res.blob();
      asset = { id: crypto.randomUUID(), fileName: '旧版旅行图片-' + descriptors.length + '.jpg', mime: original.type, size: original.size, original, sha256: await sha256(original), originalAvailable: false, preview: source };
    }
    if (asset.original.size > LIMITS.originalBytes || await sha256(asset.original) !== asset.sha256) throw new Error('照片原文件校验失败，备份未完成');
    const previewResponse = await fetch(publicURL(asset.preview)); if (!previewResponse.ok) throw new Error('预览图读取失败');
    const preview = await previewResponse.blob();
    const descriptor = { id: asset.id, fileName: asset.fileName, mime: asset.mime, size: asset.original.size, sha256: asset.sha256, originalAvailable: asset.originalAvailable === true, width: asset.width || 0, height: asset.height || 0, previewUnavailable: asset.previewUnavailable === true, offset, previewOffset: offset + asset.original.size, previewSize: preview.size, previewMime: preview.type, previewHash: await sha256(preview) };
    payload.push(asset.original, preview); offset += asset.original.size + preview.size; descriptors.push(descriptor); substitutions.set(source, 'photo:' + asset.id);
  }
  const mapPhotos = array => array.map(p => substitutions.get(p) || p);
  const layouts = (clean.layouts || []).map(l => {
    const mapState = state => ({ ...state, photos: mapPhotos(state.photos), crops: Object.fromEntries(Object.entries(state.crops).map(([p, c]) => [substitutions.get(p) || p, c])) });
    return { ...l, single: mapState(l.single), multi: mapState(l.multi) };
  });
  const manifest = { app: 'yinghuo-footprints', schemaVersion: 3, exportedAt: new Date().toISOString(), records: clean.records.map(r => ({ ...r, photos: mapPhotos(r.photos) })), marks: clean.marks, layouts, library: mapPhotos(clean.library || []), assets: descriptors };
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  if (json.byteLength > LIMITS.manifestBytes) throw new Error('备份元数据超过32 MiB，请联系开发者分批迁移；原数据未改变');
  const length = new Uint8Array(4); new DataView(length.buffer).setUint32(0, json.byteLength, true);
  return new Blob([MAGIC, length, json, ...payload], { type: 'application/octet-stream' });
}
export async function readArchive(file) {
  const header = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  if (header.length !== HEADER_BYTES || !MAGIC.every((v, i) => header[i] === v)) throw new Error('不是有效的萤火足迹原图备份');
  const length = new DataView(header.buffer).getUint32(MAGIC.length, true);
  if (!length || length > LIMITS.manifestBytes || HEADER_BYTES + length > file.size) throw new Error('备份清单长度无效');
  const manifest = JSON.parse(await file.slice(HEADER_BYTES, HEADER_BYTES + length).text());
  if (manifest.schemaVersion !== 3) throw new Error('原图备份版本不支持');
  const clean = validateBackup(manifest), assets = [], ids = new Set();
  if (!Array.isArray(manifest.assets) || manifest.assets.length > LIMITS.records * LIMITS.photos + LIMITS.records * 16) throw new Error('备份照片清单无效');
  let offset = 0;
  for (const a of manifest.assets) {
    if (![a?.width,a?.height].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=200000)) throw new Error('照片尺寸元数据无效');
    if (!a || !/^[a-zA-Z0-9_-]{1,150}$/.test(a.id) || ids.has(a.id) || typeof a.fileName !== 'string' || a.fileName.length > 1024 || typeof a.mime !== 'string' || a.mime.length > 100 || !Number.isSafeInteger(a.size) || a.size < 1 || a.size > LIMITS.originalBytes || a.offset !== offset || a.previewOffset !== offset + a.size || !Number.isSafeInteger(a.previewSize) || a.previewSize < 1 || a.previewSize > 12 * 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(a.previewMime) || !/^[a-f0-9]{64}$/.test(a.sha256) || !/^[a-f0-9]{64}$/.test(a.previewHash)) throw new Error('照片清单无效');
    ids.add(a.id);
    const base = HEADER_BYTES + length, original = file.slice(base + offset, base + offset + a.size, a.mime), previewBlob = file.slice(base + a.previewOffset, base + a.previewOffset + a.previewSize, a.previewMime);
    if (await sha256(original) !== a.sha256 || await sha256(previewBlob) !== a.previewHash) throw new Error('照片校验失败，备份可能不完整；原数据未改变');
    const preview = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(previewBlob); });
    validPhoto(preview); assets.push({ ...a, original, preview, storage: 'indexeddb', originalAvailable: a.originalAvailable === true }); offset += a.size + a.previewSize;
  }
  if (HEADER_BYTES + length + offset !== file.size) throw new Error('备份文件不完整或包含未识别内容');
  for (const source of [...clean.records.flatMap(r => r.photos), ...(clean.library || []), ...(clean.layouts || []).flatMap(l => [...l.single.photos, ...l.multi.photos])]) if (source.startsWith('photo:') && !ids.has(source.slice(6))) throw new Error('备份缺少所引用的照片');
  return { ...clean, assets };
}
export async function readBackupFile(file) {
  if (/\.yhf$/i.test(file.name || '') || new TextDecoder().decode(await file.slice(0, MAGIC.length).arrayBuffer()) === 'YHF3BIN\n') return readArchive(file);
  if (file.size > 100 * 1024 * 1024) throw new Error('旧版JSON超过100 MiB，请在旧电脑导出新版原图备份（.yhf）；不要删除原文件');
  const clean = validateBackup(JSON.parse(await file.text()));
  if ([...clean.records.flatMap(r=>r.photos), ...(clean.library || []), ...(clean.layouts || []).flatMap(l=>[...l.single.photos,...l.multi.photos])].some(p=>p.startsWith('photo:'))) throw new Error('JSON只有照片引用，请选择包含原文件的 .yhf 备份');
  return clean;
}
