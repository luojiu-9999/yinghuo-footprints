import { database } from './storage.js';
import { LIMITS, assertBackupCapacity } from './backup.js';
import { publicURL } from './urls.js';

const cache = new Map();
const req = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
export const isPhotoRef = source => typeof source === 'string' && source.startsWith('photo:');
export async function sha256(blob) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join(''); }
export async function getPhoto(source) { const db = await database(), tx = db.transaction('photos', 'readonly'); return req(tx.objectStore('photos').get(source.replace(/^photo:/, ''))); }
export async function photoPreview(source) {
  if (!isPhotoRef(source)) return publicURL(source);
  if (cache.size > 128) cache.delete(cache.keys().next().value);
  if (!cache.has(source)) cache.set(source, getPhoto(source).then(p => publicURL(p?.preview || '/assets/firefly.png')).catch(error => { cache.delete(source); throw error; }));
  return cache.get(source);
}
export async function importOriginal(file) {
  const supported = /^(image\/(jpeg|png|webp|heic|heif))$/i.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || '');
  if (!supported || !file.size) throw new Error('请选择 JPG、PNG、WebP 或 HEIC/HEIF 照片');
  if ((file.name || '').length>1024 || file.type.length>100) throw new Error('照片文件名或格式信息过长，请检查文件');
  if (file.size > LIMITS.originalBytes) throw new Error('单张原图最大100 MiB，请保留源文件并选择其他照片');
  const header = new Uint8Array(await file.slice(0,32).arrayBuffer()), ascii = new TextDecoder().decode(header);
  const recognized = header[0]===0xff && header[1]===0xd8 && header[2]===0xff || header[0]===0x89 && ascii.slice(1,4)==='PNG' || ascii.startsWith('RIFF') && ascii.slice(8,12)==='WEBP' || ascii.slice(4,8)==='ftyp' && /hei[cfx]|mif1|msf1/.test(ascii.slice(8));
  if (!recognized) throw new Error('文件内容与支持的照片格式不符，未写入本地');
  const estimate = await navigator.storage?.estimate?.();
  if (estimate?.quota && estimate.quota - (estimate.usage || 0) < file.size * 1.1) throw new Error('本地空间不足，原文件未改动，请先备份并释放空间');
  let preview = '/assets/firefly.png', width = 0, height = 0, previewUnavailable = false;
  try {
    let image;
    try { image = await createImageBitmap(file); }
    catch {
      const url = URL.createObjectURL(file);
      try { image = await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('此浏览器无法预览'));img.src=url;}); }
      finally { URL.revokeObjectURL(url); }
    }
    width = image.width; height = image.height;
    const scale = Math.min(1, 1600 / Math.max(width, height)), canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); image.close?.(); preview = canvas.toDataURL('image/jpeg', 0.82);
  } catch { previewUnavailable = true; }
  const id = crypto.randomUUID(), asset = { id, fileName: file.name || '旅行原图', mime: file.type || 'application/octet-stream', size: file.size, width, height, sha256: await sha256(file), original: file.slice(0, file.size, file.type), preview, previewUnavailable, originalAvailable: true, storage: 'indexeddb', createdAt: new Date().toISOString() };
  const db = await database();let tx;
  try { tx = db.transaction(['photos','records','marks','layouts'], 'readwrite', { durability: 'strict' }); }
  catch { tx = db.transaction(['photos','records','marks','layouts'], 'readwrite'); }
  const done = new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('原图保存失败')); tx.onerror = () => {}; });done.catch(()=>{});
  try {
    const [records,marks,layouts,keys]=await Promise.all([req(tx.objectStore('records').getAll()),req(tx.objectStore('marks').getAll()),req(tx.objectStore('layouts').getAll()),req(tx.objectStore('photos').getAllKeys())]);
    assertBackupCapacity({records,marks},layouts,[...keys,id]);tx.objectStore('photos').add(asset);await done;
  } catch(error) {try{tx.abort();}catch{}throw error;}
  cache.set('photo:' + id, Promise.resolve(preview));
  return 'photo:' + id;
}
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function downloadPhoto(source) {
  if (isPhotoRef(source)) { const asset = await getPhoto(source); if (!asset?.original) throw new Error('原图不存在，请保留现有备份'); if (await sha256(asset.original) !== asset.sha256) throw new Error('原图校验失败，已阻止导出损坏文件'); downloadBlob(asset.original, asset.fileName); return asset.originalAvailable ? '原文件已导出，未压缩' : '已导出旧版图片；旧记录没有原片'; }
  const response = await fetch(publicURL(source)); if (!response.ok) throw new Error('图片无法读取'); downloadBlob(await response.blob(), '旅行照片-旧版.jpg'); return '已导出旧版图片；旧记录没有原片';
}
// Native Android/iOS file-system adapters can implement this contract without changing records.
// Cloud adapters must be explicitly configured later; nothing uploads automatically.
export const localPhotoStorage = { importOriginal, getPhoto, photoPreview, downloadPhoto };
