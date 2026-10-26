import rows from './regions.json' with { type: 'json' };
export const LIMITS = Object.freeze({ photos: 8, attractions: 10000, records: 10000, originalBytes: 100 * 1024 * 1024, manifestBytes: 32 * 1024 * 1024 });
export const regions = new Map(rows.map(([code, name, level, path, center]) => [code, { code, name, level, path, center }]));
regions.set(100000, { code: 100000, name: '中国', level: 'country', path: [] });
const municipalities = new Set([110000, 120000, 310000, 500000, 810000, 820000]);
const fail = message => { throw new Error('数据无效：' + message); };
function text(value, label, max = 200) { if (typeof value !== 'string' || value.length > max) fail(label); return value; }
function list(value, label, max = LIMITS.records) { if (!Array.isArray(value) || value.length > max) fail(label); return value; }
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('到访日期格式错误');
  const parsed = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail('到访日期不存在');
  return value;
}
function region(value, level, name) {
  const node = regions.get(value);
  if (!node || !(node.level === level || level === 'city' && municipalities.has(value))) fail('地区不存在或层级不符');
  if (name !== undefined && text(name, '地区名称错误') !== node.name) fail('地区代码与名称不符');
  return node;
}
export function validPhoto(p) {
  if (typeof p !== 'string' || p.length > 28 * 1024 * 1024 || !(/^photo:[a-zA-Z0-9_-]{1,150}$/.test(p) || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/\s]+=*$/.test(p) || /^\/assets\/[A-Za-z0-9._-]+$/.test(p))) fail('照片格式不支持');
  return p;
}
export function validateRecord(r) {
  if (!r || typeof r !== 'object') fail('旅行记录格式错误');
  const id = text(r.id, '记录ID错误', 150); if (!id) fail('记录ID为空');
  const province = region(r.provinceCode, 'province', r.provinceName), city = region(r.cityCode, 'city', r.cityName);
  if (city.code !== province.code && !city.path.includes(province.code)) fail('城市不属于所选省份');
  const districtCodes = list(r.districtCodes, '区县列表错误', 10000);
  const districtNames = list(r.districtNames, '区县名称错误', 10000);
  if (districtCodes.length !== districtNames.length || new Set(districtCodes).size !== districtCodes.length) fail('区县代码与名称不匹配');
  districtCodes.forEach((c, i) => { const district = region(c, 'district', districtNames[i]); if (!district.path.includes(city.code)) fail('区县不属于所选城市'); });
  if (!Number.isInteger(r.days) || r.days < 1 || r.days > 365) fail('旅行天数须为1至365');
  const cityCenter = list(r.cityCenter, '城市坐标错误', 2);
  if (cityCenter.length !== 2 || !cityCenter.every(Number.isFinite) || Math.abs(cityCenter[0]) > 180 || Math.abs(cityCenter[1]) > 90) fail('城市坐标错误');
  return { id, example: r.example === true, provinceCode: province.code, provinceName: province.name, cityCode: city.code, cityName: city.name, districtCodes, districtNames, date: date(r.date), days: r.days, title: text(r.title, '标题错误', 200), note: text(r.note, '备注错误', 10000), attractions: list(r.attractions, '景点列表错误', LIMITS.attractions).map(a => text(a, '景点名称错误')), photos: list(r.photos, '照片列表错误', LIMITS.photos).map(validPhoto), cityCenter, version: Number.isSafeInteger(r.version) && r.version > 0 && r.version < Number.MAX_SAFE_INTEGER ? r.version : 1, updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : undefined, tripName: text(r.tripName || '', '旅行分组名称错误', 100), visitOrder: Number.isSafeInteger(r.visitOrder) && r.visitOrder >= 0 ? r.visitOrder : 0 };
}
export function validateLayouts(value = []) {
  const keys = new Set();
  return list(value, '照片地图配置过多').map(l => {
    if (!l || typeof l !== 'object' || !Number.isInteger(l.mapCode) || !regions.has(l.mapCode) || !regions.has(l.regionCode)) fail('照片地图区域错误');
    const node = regions.get(l.regionCode); if (!node.path.includes(l.mapCode)) fail('照片地图层级关系错误');
    const key = l.mapCode + ':' + l.regionCode; if (keys.has(key)) fail('照片地图配置重复'); keys.add(key);
    const mode = ['single', 'multi'].includes(l.mode) ? l.mode : 'single';
    const clean = (s, count) => {
      const photos = list(s?.photos || [], '拼贴照片过多', count).map(validPhoto);
      const crops = Object.fromEntries(photos.map(p => { const c = s?.crops?.[p] || {}; return [p, { x: Math.max(0, Math.min(100, Number.isFinite(c.x) ? c.x : 50)), y: Math.max(0, Math.min(100, Number.isFinite(c.y) ? c.y : 50)), zoom: Math.max(1, Math.min(3, Number(c.zoom) || 1)) }]; }));
      return { photos, crops, columns: [1, 2, 3].includes(s?.columns) ? s.columns : 2 };
    };
    return { key, mapCode: l.mapCode, regionCode: l.regionCode, mode, single: clean(l.single, 1), multi: clean(l.multi, 8) };
  });
}
export function validateBackup(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('文件必须是旅行备份对象');
  if (value.app !== undefined && value.app !== 'yinghuo-footprints') fail('不属于萤火足迹');
  if (value.schemaVersion !== undefined && ![2, 3].includes(value.schemaVersion)) fail('暂不支持此备份版本');
  const ids = new Set(), markCodes = new Set();
  const records = list(value.records, '旅行记录列表格式错误').map(r => { const item = validateRecord(r); if (ids.has(item.id)) fail('记录ID重复'); ids.add(item.id); return item; });
  const marks = list(value.marks, '点亮列表格式错误').map(m => {
    if (!m || !['province', 'city', 'district'].includes(m.level)) fail('足迹层级错误');
    const node = region(m.code, m.level, m.name);
    if (markCodes.has(node.code)) fail('点亮地区重复'); markCodes.add(node.code);
    const supplied = list(m.path || [], '地区层级路径错误', 4).map(p => { region(p.code, p.level, p.name); return p.code; });
    const unique = [...new Set(supplied)].filter(c=>!(m.level==='city' && municipalities.has(node.code) && c===node.code));
    if (unique.length && unique.join(',') !== node.path.join(',')) fail('点亮地区的省市路径错误');
    return { code: node.code, name: node.name, level: m.level, center: node.center, date: date(m.date), path: node.path.map(c => { const p = regions.get(c); return { code: p.code, name: p.name, level: p.level, center: p.center }; }) };
  });
  const result = { records, marks };
  if (value.layouts !== undefined) result.layouts = validateLayouts(value.layouts);
  if (value.library !== undefined) result.library = list(value.library,'照片库超过容量上限', LIMITS.records * LIMITS.photos).map(validPhoto);
  return result;
}
export function mergeBackup(current, incoming) {
  const ids = new Set(current.records.map(r => r.id)), codes = new Set(current.marks.map(m => m.code));
  const next = { records: [...current.records, ...incoming.records.filter(r => !ids.has(r.id))], marks: [...current.marks, ...incoming.marks.filter(m => !codes.has(m.code))] };
  if (next.records.length > LIMITS.records || next.marks.length > LIMITS.records) fail('合并后记录总数超过上限，请先另存备份');
  return next;
}
// A conservative admission budget ensures newly saved data can still produce a
// manifest below the same limit enforced by the reader. Photo bytes are NOT counted
// here: originals live in the binary payload, not in JSON/Base64.
export function assertBackupCapacity(snapshot, layouts = [], photoIds = []) {
  const refs = new Set(photoIds.map(id=>'photo:'+id));
  for(const p of snapshot.records.flatMap(r=>r.photos)) refs.add(p);
  for(const l of layouts) for(const p of [...l.single.photos,...l.multi.photos]) refs.add(p);
  const ids = new Map([...refs].map((p,i)=>[p,'photo:'+String(i).padStart(150,'x')]));
  const mapState=s=>({...s,photos:s.photos.map(p=>ids.get(p)),crops:Object.fromEntries(Object.entries(s.crops).map(([p,c])=>[ids.get(p),c]))});
  const metadata={records:snapshot.records.map(r=>({...r,photos:r.photos.map(p=>ids.get(p))})),marks:snapshot.marks,layouts:layouts.map(l=>({...l,single:mapState(l.single),multi:mapState(l.multi)}))};
  const estimate=new TextEncoder().encode(JSON.stringify(metadata)).byteLength+refs.size*8192+snapshot.records.length*128+4096;
  if(estimate>LIMITS.manifestBytes) throw new Error('为保证备份可以恢复，元数据已接近32 MiB保护线；本次未写入，请先导出备份并分批管理照片');
  return estimate;
}
