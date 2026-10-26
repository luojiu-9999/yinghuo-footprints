import fs from 'node:fs/promises';
import path from 'node:path';
const dir = path.resolve('public/maps');
await fs.mkdir(dir, { recursive: true });
const index = [];
const errors = [];
async function download(code) {
  const dest = path.join(dir, `${code}.json`);
  try { return JSON.parse(await fs.readFile(dest, 'utf8')); } catch {}
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://geo.datav.aliyun.com/areas_v3/bound/${code}_full.json`, { signal: AbortSignal.timeout(22000) });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (!data.features) throw new Error('Invalid geometry');
      await fs.writeFile(dest, JSON.stringify(data));
      return data;
    } catch (e) { if (attempt === 2) { errors.push({ code, error: e.message }); return null; } }
  }
}
async function pool(items, work, concurrency = 8) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) { const item = items[i++]; await work(item); }
  }));
}
const root = { code: 100000, name: '中国', level: 'country' };
const national = await download(100000);
if (!national) throw new Error('全国地图下载失败');
const provinces = national.features.filter(f => f.properties.adcode).map(f => ({ code: Number(f.properties.adcode), name: f.properties.name, level: 'province', center: f.properties.center, path: [root] }));
index.push(...provinces);
// Prioritize the complete hero flow before expanding to the rest of China.
await download(330000); await download(330100);
await pool(provinces, async province => {
  const geo = await download(province.code);
  if (!geo) return;
  const children = geo.features.filter(f => f.properties.adcode && Number(f.properties.adcode) !== province.code).map(f => ({ code: Number(f.properties.adcode), name: f.properties.name, level: f.properties.level || 'city', center: f.properties.center, path: [...province.path, province] }));
  index.push(...children);
  await pool(children.filter(c => c.level !== 'district'), async city => {
    const cityMap = await download(city.code);
    if (!cityMap) return;
    for (const f of cityMap.features) {
      if (!f.properties.adcode || Number(f.properties.adcode) === city.code) continue;
      index.push({ code: Number(f.properties.adcode), name: f.properties.name, level: 'district', center: f.properties.center, path: [...city.path, city] });
    }
  }, 2);
  await fs.writeFile(path.join(dir, 'index.json'), JSON.stringify(index));
  console.log(`地图已缓存：${province.name} · ${index.length} 个地区`);
}, 5);
await fs.writeFile(path.join(dir, 'index.json'), JSON.stringify(index));
await fs.writeFile(path.join(dir, 'download-report.json'), JSON.stringify({ source: 'https://datav.aliyun.com/portal/school/atlas/area_selector', downloadedAt: new Date().toISOString(), regions: index.length, errors }, null, 2));
// Keep the shared offline relationship validator in sync with the displayed map index.
await fs.writeFile(path.resolve('src/regions.json'), JSON.stringify(index.filter(r=>Number.isFinite(r.code)).map(r=>[r.code,r.name,r.level,(r.path||[]).map(p=>p.code),r.center||null])));
console.log(`完成：${index.length} 个地区；${errors.length} 项未提供边界（已记录）。`);
