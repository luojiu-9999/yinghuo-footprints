import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { MapChart, EffectScatterChart } from 'echarts/charts';
import { GeoComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { shortName } from './data.js';
import { publicURL } from './urls.js';
echarts.use([MapChart, EffectScatterChart, GeoComponent, TooltipComponent, CanvasRenderer]);
const cache = new Map();
export async function loadMap(code) {
  if (cache.has(code)) return cache.get(code);
  const response = await fetch(publicURL(`/maps/${code}.json`));
  if (!response.ok || !(response.headers.get('content-type') || '').includes('json')) throw new Error('此地区暂未提供细分边界，可直接添加旅行记录');
  const data = await response.json(); cache.set(code, data); return data;
}
export function childrenFromMap(geo, path) {
  return geo.features.filter(f => Number.isFinite(Number(f.properties.adcode)) && Number(f.properties.adcode) > 0 && f.properties.name).map(f => ({
    code: Number(f.properties.adcode), name: f.properties.name, level: f.properties.level || (path.length === 1 ? 'province' : path.length === 2 ? 'city' : 'district'), center: f.properties.center || f.properties.centroid, path,
  }));
}
export function MapView({ region, path, theme, records, marks, selected, onSelect, onChildren, zoom }) {
  const host = useRef(null); const chart = useRef(null); const callback = useRef({ onSelect, onChildren });
  const [status, setStatus] = useState('loading'); const [error, setError] = useState('');
  const [narrow, setNarrow] = useState(false);
  callback.current = { onSelect, onChildren };
  useEffect(() => {
    const instance = echarts.init(host.current); chart.current = instance;
    const observer = new ResizeObserver(() => { instance.resize(); setNarrow(host.current.clientWidth < 600); }); observer.observe(host.current);
    return () => { observer.disconnect(); instance.dispose(); chart.current = null; };
  }, []);
  useEffect(() => {
    let cancelled = false; setStatus('loading'); setError('');
    loadMap(region.code).then(geo => {
      if (cancelled || !chart.current) return;
      const children = childrenFromMap(geo, path);
      callback.current.onChildren(children);
      const name = `region-${region.code}`;
      echarts.registerMap(name, geo);
      const dark = theme === 'night';
      const mobile = narrow;
      const tinyRegions = new Set([110000, 120000, 310000, 810000, 820000]);
      const mobileLabels = new Set([650000, 540000, 150000, 230000, 510000, 530000, 330000, 440000, 710000]);
      const visits = new Set([...records.flatMap(r => [r.provinceCode, r.cityCode, ...r.districtCodes]), ...marks.flatMap(m => [m.code, ...(m.path || []).map(p => p.code)])]);
      const palette = dark ? { area: 'rgba(16,60,66,.6)', visited: 'rgba(135,104,60,.72)', border: '#4f8a85', text: '#b7ccc9', selected: '#b8954d', hover: '#407069' } : { area: 'rgba(192,211,183,.64)', visited: 'rgba(100,142,92,.82)', border: '#fcfcf3', text: '#405448', selected: 'rgba(216,178,93,.9)', hover: '#a4bf97' };
      const regions = children.map(c => ({ name: c.name, itemStyle: { areaColor: c.code === selected?.code ? palette.selected : visits.has(c.code) ? palette.visited : palette.area, borderWidth: c.code === selected?.code ? 2 : 1, borderColor: c.code === selected?.code ? '#e5be65' : palette.border, ...(dark && visits.has(c.code) ? { shadowBlur: 10, shadowColor: '#cfa958' } : {}) }, label: { show: region.code !== 100000 || (mobile ? mobileLabels.has(c.code) : !tinyRegions.has(c.code)), color: dark && visits.has(c.code) ? '#fff1c3' : palette.text } }));
      const points = records.filter(r => region.code === 100000 || r.provinceCode === region.code || r.cityCode === region.code).map(r => ({ name: r.cityName, value: [...r.cityCenter, 1] }));
      chart.current.setOption({
        backgroundColor: 'transparent', animationDurationUpdate: 450,
        tooltip: { trigger: 'item', backgroundColor: dark ? '#102d31' : '#fffef8', borderColor: 'transparent', textStyle: { color: dark ? '#e7ece4' : '#264735', fontSize: 13 }, formatter: p => `${p.name}<br/>${visits.has(children.find(c => c.name === p.name)?.code) ? '已留下足迹 · ' : ''}点击选择，双击进入` },
        geo: { map: name, roam: true, zoom, scaleLimit: { min: .7, max: 4 }, layoutCenter: ['50%', '49%'], layoutSize: region.code === 100000 ? '96%' : '88%', aspectScale: .85, label: { show: true, formatter: p => p.name === '南海诸岛' ? '' : shortName(p.name), fontSize: dark ? 12 : 13, fontFamily: 'Noto Serif SC, SimSun, serif', color: palette.text }, itemStyle: { areaColor: palette.area, borderColor: palette.border, borderWidth: 1 }, emphasis: { label: { color: dark ? '#fff2ce' : '#183f2f' }, itemStyle: { areaColor: palette.hover } }, select: { disabled: true }, regions },
        series: [{ type: 'effectScatter', coordinateSystem: 'geo', data: points, symbolSize: dark ? 9 : 7, rippleEffect: { scale: dark ? 4 : 2.4, brushType: 'stroke' }, itemStyle: { color: '#eebf55', shadowBlur: dark ? 18 : 9, shadowColor: '#eabb4e' }, tooltip: { show: false }, silent: true }],
      }, true);
      chart.current.off('click'); chart.current.off('dblclick');
      chart.current.on('click', p => { const child = children.find(c => c.name === p.name); if (child) callback.current.onSelect(child, false); });
      chart.current.on('dblclick', p => { const child = children.find(c => c.name === p.name); if (child) callback.current.onSelect(child, true); });
      setStatus('ready');
    }).catch(e => { if (!cancelled) { setStatus('error'); setError(e.message); callback.current.onChildren([]); chart.current?.clear(); } });
    return () => { cancelled = true; };
  }, [region.code, theme, records, marks, selected?.code, zoom, narrow]);
  return <><div className="map-canvas" ref={host} data-map-narrow={narrow} aria-label={`${region.name}行政区划地图`} />{status === 'loading' && <div className="map-status" role="status">正在展开山河…</div>}{status === 'error' && <div className="map-status"><p>{error}</p><small>仍可通过右侧「记录足迹」保存到访信息</small></div>}</>;
}
