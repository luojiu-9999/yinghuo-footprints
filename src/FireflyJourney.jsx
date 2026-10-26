import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PhotoImage } from './PhotoImage.jsx';
import { loadMap } from './MapView.jsx';
import { mapGeometry, drawMapBase, curvePoint, loadImage } from './geo-canvas.js';
import { shortName, formatDate } from './data.js';

export function orderedVisits(records) { return [...records].sort((a,b) => a.date.localeCompare(b.date) || (a.visitOrder || 0)-(b.visitOrder || 0) || a.id.localeCompare(b.id)); }
export function FireflyJourney({ records, year, onEdit, theme }) {
  const [group, setGroup] = useState(''), [progress, setProgress] = useState(0), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1), [geo, setGeo] = useState(null), [error, setError] = useState('');
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const canvas = useRef(null), sprite = useRef(null);
  const visits = useMemo(() => orderedVisits(records.filter(r => !group || r.tripName === group)), [records, group]);
  const groups = [...new Set(records.map(r => r.tripName).filter(Boolean))];
  const max = Math.max(0, visits.length-1), stop = visits[Math.min(Math.floor(progress + 0.001),visits.length-1)];
  const ties = visits.some((r,i) => i && r.date === visits[i-1].date && (r.visitOrder || 0) === (visits[i-1].visitOrder || 0));
  useEffect(() => { let active = true; loadMap(100000).then(value => active && setGeo(value)).catch(e => active && setError(e.message)); loadImage('/assets/firefly.png').then(image => { sprite.current = image; }); return () => { active = false; }; }, []);
  useEffect(() => { setProgress(0); setPlaying(false); }, [group, year]);
  useEffect(() => {
    if (!playing || reduced || !max) return;
    let frame, last;
    const tick = now => { if (last !== undefined) setProgress(p => Math.min(max, p + Math.min(now-last,100)*speed/3000)); last = now; frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [playing,reduced,speed,max]);
  useEffect(() => { if (progress >= max) setPlaying(false); }, [progress,max]);
  useEffect(() => {
    const target = canvas.current; if (!target || !geo) return;
    const ctx = target.getContext('2d'), dark = document.documentElement.dataset.theme === 'night';
    ctx.clearRect(0,0,1000,650); ctx.fillStyle = dark ? '#0b252c' : '#f8fbf9'; ctx.fillRect(0,0,1000,650);
    const map = mapGeometry(geo,1000,650,30); drawMapBase(ctx,map,dark);
    const positions = visits.map(r => map.project(r.cityCenter));
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#c3a34d'; ctx.shadowColor = '#f5da67'; ctx.shadowBlur = reduced ? 0 : 12;
    const extent = reduced ? max : progress;
    for (let i=0;i<max;i++) { const fraction = Math.max(0,Math.min(1,extent-i)); if (!fraction) continue; ctx.beginPath(); for (let n=0;n<=60;n++) { const p = curvePoint(positions[i],positions[i+1],n/60*fraction); n ? ctx.lineTo(...p) : ctx.moveTo(...p); } ctx.stroke(); }
    positions.forEach((p,i) => { ctx.beginPath(); ctx.arc(...p, i <= extent ? 4 : 3,0,Math.PI*2); ctx.fillStyle = i <= extent ? '#edc861' : dark ? '#6e9690' : '#89a99b'; ctx.fill(); });
    if (positions.length) { const index = Math.min(Math.floor(progress),Math.max(0,max-1)), point = max ? curvePoint(positions[index],positions[index+1],Math.min(1,progress-index)) : positions[0]; ctx.shadowBlur = reduced ? 0 : 24; ctx.fillStyle = '#fff5bb'; ctx.beginPath(); ctx.arc(...point,6,0,2*Math.PI); ctx.fill(); if (sprite.current) ctx.drawImage(sprite.current,point[0]-18,point[1]-18,36,36); }
    ctx.shadowBlur = 0; ctx.fillStyle = dark ? '#bfd1c8' : '#587366'; ctx.font = '12px sans-serif'; ctx.fillText('地图来源：DataV GeoAtlas · 回忆连线，非真实行驶轨迹',24,628);
  }, [geo,visits,progress,reduced,max,theme]);
  return <section className="journey-workspace"><div className="feature-heading"><div><span className="eyebrow">FOLLOW YOUR INNER LIGHT</span><h2>萤火旅线</h2><p>{year} 年的回忆串联 · 不代表真实导航路线</p></div><label>播放范围<select aria-label="旅线播放范围" value={group} onChange={e => setGroup(e.target.value)}><option value="">年度回忆串联</option>{groups.map(name => <option key={name} value={name}>{name}</option>)}</select></label></div>{ties && <p className="inline-warning">有同日到访尚未指定先后，当前以记录ID稳定排列；请点击站点「编辑顺序」，填写同日到访顺序。</p>}{error && <p role="alert">{error}</p>}<div className="journey-stage"><canvas ref={canvas} width="1000" height="650" aria-label="萤火旅线地图" role="img"/>{stop && <div className="journey-stop"><PhotoImage src={stop.photos[0] || '/assets/landscape.png'} alt={stop.title}/><div><small>第 {Math.min(Math.floor(progress)+1,visits.length)} 站 · {formatDate(stop.date)}</small><h3>{shortName(stop.cityName)}</h3><p>{stop.title}</p></div></div>}</div><div className="playback-controls"><button className="action primary" disabled={visits.length<2 || reduced} onClick={() => { if(progress>=max)setProgress(0); setPlaying(!playing); }}>{playing ? '暂停旅线' : '播放旅线'}</button><button className="action" onClick={() => { setProgress(0); setPlaying(false); }}>回到起点</button><label className="journey-progress">旅线进度<input aria-label="旅线进度" type="range" min="0" max={max || 1} step="0.01" value={Math.min(progress,max)} onChange={e => { setProgress(Number(e.target.value)); setPlaying(false); }}/></label><label>速度<select aria-label="旅线播放速度" value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[0.5,1,2].map(s => <option key={s} value={s}>{s}×</option>)}</select></label><label className="reduce-motion"><input type="checkbox" checked={reduced} onChange={e => { setReduced(e.target.checked); setPlaying(false); }}/>静态连线</label></div>{!group && <p className="quiet">这里串联这一年的独立到访；如需播放单次旅行，请在编辑记录时填写相同的「旅行分组」。</p>}{visits.length<2 && <p className="quiet">至少两条到访记录才能播放连线，同一城市的重复到访也会保留。</p>}<ol className="journey-stops">{visits.map((r,i) => <li key={r.id} className={i<=progress?'reached':''}><button onClick={() => { setProgress(i); setPlaying(false); }}><span>{i+1}</span><strong>{shortName(r.cityName)}</strong><small>{formatDate(r.date)} · {r.tripName || '独立到访'}{r.example ? ' · 示例' : ''}</small></button><button className="text-action" onClick={() => onEdit(r)}>编辑顺序</button></li>)}</ol></section>;
}
