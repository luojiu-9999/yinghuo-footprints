export const ROOT = { code: 100000, name: '中国', level: 'country' };
export const ZHEJIANG = { code: 330000, name: '浙江省', level: 'province', path: [ROOT] };
export const HANGZHOU = { code: 330100, name: '杭州市', level: 'city', path: [ROOT, ZHEJIANG] };
export const THEMES = [
  { id: 'landscape', name: '白色模式', description: '清透自然，日间留白' },
  { id: 'night', name: '暗夜模式', description: '一盏萤火，照亮回忆' },
];
export const seedRecords = [
  { id: 'sample-hangzhou', example: true, provinceCode: 330000, provinceName: '浙江省', cityCode: 330100, cityName: '杭州市', districtCodes: [330106, 330102], districtNames: ['西湖区', '上城区'], date: '2026-05-16', days: 3, title: '在西湖，把日子慢下来', note: '沿着苏堤走了一整个下午。风吹过湖面，远处是雷峰塔，手里是一杯温热的龙井。原来最好的旅行，是允许自己慢下来。', attractions: ['西湖', '雷峰塔', '河坊街'], photos: ['/assets/hangzhou.png'], cityCenter: [120.153576, 30.287459] },
  { id: 'sample-dali', example: true, provinceCode: 530000, provinceName: '云南省', cityCode: 532900, cityName: '大理白族自治州', districtCodes: [532901], districtNames: ['大理市'], date: '2026-08-23', days: 4, title: '洱海边，风是自由的', note: '清晨骑车经过白族村落，洱海是浅浅的蓝。坐在湖边发呆，看云从苍山慢慢经过，留下一段没有安排的时间。', attractions: ['洱海', '大理古城'], photos: ['/assets/dali.png'], cityCenter: [100.225668, 25.589449] },
];
export const cityInfo = {
  330100: { title: '杭州', subtitle: '一半山水，一半人间', photo: '/assets/hangzhou.png', text: '沿着西湖走一走，在龙井的茶香里停一停。山水与烟火，都藏在江南的日常里。' },
  532900: { title: '大理', subtitle: '在苍山洱海之间，遇见自由', photo: '/assets/dali.png', text: '苍山不墨千秋画，洱海无弦万古琴。去湖边吹风，去古城收集一段慢时光。' },
};
export const attractionExamples = {
  330100: [
    { name: '西湖', district: '西湖区', intro: '湖山、堤岸与人文古迹交织的江南风景。', tip: '建议步行苏堤与白堤，留出半天慢慢游览。', time: '半天至一天' },
    { name: '灵隐寺', district: '西湖区', intro: '隐于山林之间的古刹，与飞来峰石刻相伴。', tip: '可将寺院与周边山林安排在同一天，出行前核实预约要求。', time: '2–3 小时' },
    { name: '雷峰塔', district: '西湖区', intro: '西湖南岸的地标，可远眺湖面与群山。', tip: '适合与南山路、夕照风景一同游览。', time: '1–2 小时' },
    { name: '河坊街', district: '上城区', intro: '感受杭州老街的市井风物与传统商铺。', tip: '傍晚散步更有烟火气，可顺路探访周边街巷。', time: '1–2 小时' },
  ],
  532900: [
    { name: '洱海', district: '大理市', intro: '苍山脚下的高原湖泊，沿岸散布白族村落。', tip: '选一段湖岸慢行，留意防晒，尊重沿岸生态。', time: '半天至一天' },
    { name: '大理古城', district: '大理市', intro: '在古城街巷里感受白族建筑与生活。', tip: '清晨或傍晚步行游览，更适合感受街巷。', time: '2–3 小时' },
    { name: '苍山', district: '大理市', intro: '十九峰连绵，山间步道可远眺洱海。', tip: '高海拔天气变化快，提前确认开放与天气。', time: '半天' },
  ],
};
export const formatDate = value => value.replaceAll('-', '.');
export const shortName = name => (name || '').replace(/白族自治州|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市$/g, '');
export function recordHasRegion(record, code) { return Number(record.provinceCode) === Number(code) || Number(record.cityCode) === Number(code) || record.districtCodes.includes(Number(code)); }
export const MUNICIPAL_CODES = new Set([110000,120000,310000,500000,810000,820000]);
export function markHasRegion(mark, code) { return mark.code === Number(code) || (mark.path || []).some(p => p.code === Number(code)); }
export function cityFootprints(records, marks, index = []) {
  const cities = new Map();
  const add = (region, province) => {
    if (!region || cities.has(region.code)) return;
    const node = index.find(i => i.code === region.code) || region;
    cities.set(region.code, { ...node, level: 'city', path: MUNICIPAL_CODES.has(region.code) ? [ROOT, { ...node, level: 'province' }] : node.path || [ROOT, province].filter(Boolean), provinceName: province?.name || '' });
  };
  for (const r of records) add({ code:r.cityCode, name:r.cityName, center:r.cityCenter }, { code:r.provinceCode, name:r.provinceName, level:'province' });
  for (const m of marks) for (const node of [...(m.path || []),m]) if (node.level === 'city' || node.level === 'province' && MUNICIPAL_CODES.has(node.code)) add(node, (m.path || []).find(p => p.level === 'province') || node);
  return [...cities.values()].sort((a,b) => a.name.localeCompare(b.name,'zh-CN'));
}
export function totalStats(records, marks = []) {
  return {
    provinces: new Set([...records.map(r => r.provinceCode), ...marks.flatMap(m => [m, ...(m.path || [])]).filter(m => m.level === 'province').map(m => m.code)]).size,
    cities: new Set([...records.map(r => r.cityCode), ...marks.flatMap(m => [m, ...(m.path || [])]).filter(m => m.level === 'city' || m.level === 'province' && MUNICIPAL_CODES.has(m.code)).map(m => m.code)]).size,
    counties: new Set([...records.flatMap(r => r.districtCodes), ...marks.filter(m => m.level === 'district').map(m => m.code)]).size,
    photos: records.reduce((sum, r) => sum + r.photos.length, 0),
    days: records.reduce((sum, r) => sum + Number(r.days || 0), 0),
  };
}
