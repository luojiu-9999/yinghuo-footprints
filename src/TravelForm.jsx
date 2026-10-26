import { PhotoImage } from './PhotoImage.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { ButterflyIcon, CheckIcon, XIcon, CircleNotchIcon, CameraIcon, MapPinIcon, SunIcon } from '@phosphor-icons/react';
import { ROOT, ZHEJIANG, HANGZHOU, attractionExamples, shortName } from './data.js';
import { loadMap, childrenFromMap } from './MapView.jsx';
import { saveDraft, removeDraft } from './storage.js';
import { importOriginal } from './photo-store.js';
import { LIMITS } from './backup.js';
import { TODAY } from './App.jsx';

export function RecordForm({ region, record, draft, owner, index, onClose, onSave, notify }) {
  const startProvince = region.level === 'country' ? { code: 0, name: '请选择省份' } : region.level === 'province' ? region : region.path?.find(p => p.level === 'province') || ZHEJIANG;
  const startCity = region.level === 'city' ? region : region.path?.find(p => p.level === 'city') || (region.level === 'district' ? { ...region, level: 'city' } : startProvince.code === 330000 ? HANGZHOU : null);
  const [fields, setFields] = useState(() => draft?.fields || { provinceCode: record?.provinceCode || startProvince.code, cityCode: record?.cityCode || startCity?.code || 0, districtCodes: record?.districtCodes || (region.level === 'district' ? [region.code] : []), districtNames: record?.districtNames || [], date: record?.date || TODAY, days: record?.days || 1, title: record?.title || '', note: record?.note || '', attractions: record?.attractions || [], customPlace: '', photos: record?.photos || [], tripName: record?.tripName || '', visitOrder: record?.visitOrder || 0 });
  const { provinceCode, cityCode, districtCodes, date, days, title, note, attractions, customPlace, photos } = fields;
  const draftId = useRef(draft?.id || crypto.randomUUID()).current;
  const recordId = record?.id || draft?.recordId;
  const baseVersion = useRef(draft?.baseVersion ?? record?.version).current;
  const [dirty, setDirty] = useState(Boolean(draft));
  const [cities, setCities] = useState([]), [counties, setCounties] = useState([]);
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [closing, setClosing] = useState(false);
  const [loadingCities, setLoadingCities] = useState(true), [loadingCounties, setLoadingCounties] = useState(true);
  const [draftStatus, setDraftStatus] = useState(draft ? 'saved' : 'clean');
  const [conflict, setConflict] = useState(false);
  const formRef = useRef(null), fieldRef = useRef(fields), timer = useRef(null), chain = useRef(Promise.resolve()), paused = useRef(false), epoch = useRef(0), closeRef = useRef(null), live = useRef({});
  fieldRef.current = fields; live.current = { busy, saving, dirty, draftStatus };
  const provinces = index.filter(i => i.level === 'province');
  const province = index.find(i => i.code === Number(provinceCode)) || { ...startProvince, code: Number(provinceCode), name: record?.provinceName || startProvince.name };
  const city = Number(cityCode) > 0 ? cities.find(i => i.code === Number(cityCode)) || (Number(cityCode) === province.code ? { ...province, level: 'city' } : index.find(i => i.code === Number(cityCode))) : null;
  const suggestions = attractionExamples[Number(cityCode)] || [];
  const change = patch => { epoch.current++; setDirty(true); setDraftStatus('pending'); setFields(current => ({ ...current, ...patch })); };
  function commitDraft() {
    if (paused.current) return chain.current;
    const savedEpoch = epoch.current;
    const snapshot = { id: draftId, owner, recordId, baseVersion, region, fields: fieldRef.current };
    const pending = chain.current.catch(() => {}).then(() => saveDraft(snapshot)).then(() => { if (!paused.current && savedEpoch === epoch.current) setDraftStatus('saved'); }, error => { if (!paused.current) setDraftStatus('error'); throw error; });
    chain.current = pending; pending.catch(() => {}); return pending;
  }
  async function requestClose() {
    if (busy || saving || closing) { notify('正在处理照片或保存，请稍候'); return; }
    if (!dirty) { onClose(); return; }
    clearTimeout(timer.current); setClosing(true);
    try { await commitDraft(); paused.current = true; notify('草稿已保留，可从原入口或草稿箱继续'); onClose(); }
    catch { notify('草稿保存失败，请保留页面并先减少照片或导出已有数据'); setClosing(false); }
  }
  closeRef.current = requestClose;
  async function discard() {
    if (busy || saving || closing || !window.confirm('放弃这份未保存草稿？已保存的旅行记录不会被删除。')) return;
    paused.current = true; clearTimeout(timer.current); setClosing(true);
    try { await chain.current.catch(() => {}); await removeDraft(draftId); onClose(); notify('草稿已放弃'); }
    catch { paused.current = false; setClosing(false); notify('未能移除草稿，请重试'); }
  }
  useEffect(() => {
    paused.current = false;
    const previousFocus = document.activeElement, oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; formRef.current?.querySelector('select')?.focus();
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeRef.current?.(); return; }
      if (e.key !== 'Tab') return;
      const controls = [...formRef.current.querySelectorAll('button,input,select,textarea')].filter(el => !el.disabled && el.offsetParent !== null);
      if (e.shiftKey && document.activeElement === controls[0]) { e.preventDefault(); controls.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === controls.at(-1)) { e.preventDefault(); controls[0]?.focus(); }
    };
    const unload = e => { const state = live.current; if (state.busy || state.saving || state.dirty && state.draftStatus !== 'saved') { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('keydown', key, true); window.addEventListener('beforeunload', unload);
    return () => { paused.current = true; clearTimeout(timer.current); document.body.style.overflow = oldOverflow; window.removeEventListener('keydown', key, true); window.removeEventListener('beforeunload', unload); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  useEffect(() => { if (dirty && !paused.current) { timer.current = setTimeout(() => commitDraft().catch(() => {}), 300); } return () => clearTimeout(timer.current); }, [fields, dirty]);
  useEffect(() => {
    let active = true; setLoadingCities(true); setCities([]);
    if (!provinceCode) { setLoadingCities(false); setLoadingCounties(false); return; }
    const municipal = [110000,120000,310000,500000,810000,820000].includes(Number(provinceCode));
    const useCities = options => { if (!active) return; setCities(options); setFields(current => ({ ...current, cityCode: options.some(c => c.code === Number(current.cityCode)) ? Number(current.cityCode) : options[0]?.code || province.code })); };
    if (municipal) { useCities([{ ...province, level: 'city' }]); setLoadingCities(false); return; }
    loadMap(provinceCode).then(geo => useCities(childrenFromMap(geo, [ROOT, province]))).catch(() => useCities([{ ...province, level: 'city' }])).finally(() => active && setLoadingCities(false));
    return () => { active = false; };
  }, [provinceCode]);
  useEffect(() => {
    let active = true; setCounties([]); if (!cityCode || loadingCities) return; setLoadingCounties(true);
    loadMap(cityCode).then(geo => { if (active) setCounties(childrenFromMap(geo, [ROOT, province, { ...city, code: Number(cityCode), level: 'city' }]).filter(c => c.code !== Number(cityCode))); }).catch(() => {}).finally(() => active && setLoadingCounties(false));
    return () => { active = false; };
  }, [cityCode, loadingCities]);
  const upload = async event => {
    const files = [...event.target.files]; event.target.value = '';
    if (files.length + photos.length > 8) { notify('每条记录最多上传8张照片，可先移除不需要的照片'); return; }
    setBusy(true);
    try { const images = []; for (const file of files) images.push(await importOriginal(file)); change({ photos: [...fieldRef.current.photos, ...images] }); }
    catch (error) { notify(error.message || '照片读取失败，请换一张照片'); }
    finally { setBusy(false); }
  };
  const addPlace = () => { const value = customPlace.trim(); if (value && !attractions.includes(value) && attractions.length >= LIMITS.attractions) { notify('每条记录最多' + LIMITS.attractions + '个地点'); return; } change({ attractions: value && !attractions.includes(value) ? [...attractions, value] : attractions, customPlace: '' }); };
  async function submit(event, copy = false) {
    event.preventDefault(); if (!city || busy || saving || closing || loadingCities || loadingCounties) return;
    if (!date || date > TODAY) { notify('请选择今天或过去的到访日期'); return; }
    if (!Number.isInteger(Number(days)) || Number(days) < 1 || Number(days) > 365) { notify('旅行天数应为1至365'); return; }
    paused.current = true; clearTimeout(timer.current); setSaving(true);
    await chain.current.catch(() => {});
    const districtNames = districtCodes.map((code, i) => counties.find(c => c.code === code)?.name || index.find(c => c.code === code)?.name || fields.districtNames[i] || String(code));
    const next = { id: !copy && recordId ? recordId : crypto.randomUUID(), example: false, provinceCode: province.code, provinceName: province.name, cityCode: Number(cityCode), cityName: city.name, districtCodes, districtNames, date, days: Number(days), title: title.trim() || shortName(city.name) + '，一段新的记忆', note: note.trim(), attractions: [...new Set([...attractions, ...(customPlace.trim() ? [customPlace.trim()] : [])])], photos, tripName: fields.tripName || '', visitOrder: Number(fields.visitOrder) || 0, cityCenter: city.center || record?.cityCenter || [120.153576,30.287459] };
    try { await onSave(next, { expectedVersion: !copy && recordId ? baseVersion : undefined, draftId }); }
    catch (error) { paused.current = false; setSaving(false); if (error.code === 'CONFLICT') setConflict(true); notify(error.message || '保存未完成，原记录仍保留'); await commitDraft().catch(() => {}); }
  }
  return <div className="modal-overlay" onClick={e => e.target === e.currentTarget && requestClose()}><section className="record-modal" role="dialog" aria-modal="true" aria-labelledby="record-title" ref={formRef}><header><span><ButterflyIcon size={30} weight="duotone"/><div><h2 id="record-title">{recordId ? '编辑旅行记忆' : '点亮一段新记忆'}</h2><p>{draft ? '已恢复未完成草稿，继续收藏这段旅程。' : '去过的地方，值得被记住。'}</p></div></span><button className="icon-button" disabled={saving || closing} onClick={requestClose} aria-label="关闭记录表单"><XIcon size={22}/></button></header><form onSubmit={submit}><div className="form-scroll">
    {conflict && <div className="inline-warning" role="alert">原记录已在其他页面修改或删除。当前内容已保留为草稿，可保存为另一条记录，原记录不会被覆盖。<button type="button" disabled={saving} onClick={e => submit(e, true)}>保存为新记录</button></div>}
    {draftStatus === 'error' && <p className="inline-warning" role="alert">草稿暂未保存，请保留此页面并检查本地存储空间。</p>}
    <div className="form-row"><label>省份<select value={provinceCode} onChange={e => change({ provinceCode: Number(e.target.value), districtCodes: [], districtNames: [], attractions: [] })}><option value={0}>请选择省份</option>{(provinces.length ? provinces : [ZHEJIANG]).map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</select></label><label>城市<select value={cityCode} disabled={loadingCities} onChange={e => change({ cityCode: Number(e.target.value), districtCodes: [], districtNames: [], attractions: [] })}>{loadingCities ? <option>正在加载城市…</option> : !cities.length ? <option value={0}>请先选择省份</option> : cities.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label></div>
    <div className="field"><span className="field-title">去过哪些区县？<small>可多选，也可以只记录城市</small></span>{loadingCounties ? <p className="quiet">正在展开区县…</p> : counties.length ? <div className="chip-options">{counties.map(c => <button key={c.code} type="button" className={districtCodes.includes(c.code) ? 'selected' : ''} aria-pressed={districtCodes.includes(c.code)} onClick={() => change({ districtCodes: districtCodes.includes(c.code) ? districtCodes.filter(v => v !== c.code) : [...districtCodes, c.code] })}>{districtCodes.includes(c.code) && <CheckIcon size={14}/ >}{c.name}</button>)}</div> : <p className="quiet">此地区暂无可用细分边界，原有足迹会保留。</p>}</div>
    <div className="form-row"><label>到访日期<input type="date" required max={TODAY} value={date} onChange={e => change({ date: e.target.value })}/></label><label>旅行天数<input type="number" min="1" max="365" required value={days} onChange={e => change({ days: e.target.value })}/></label></div>
    <div className="form-row"><label>旅行分组（可选）<input aria-label="旅行分组" maxLength={100} placeholder="例如：江南秋游，同组到访串成一趟旅程" value={fields.tripName || ''} onChange={e => change({ tripName: e.target.value })}/></label><label>同日到访顺序<input aria-label="同日到访顺序" type="number" min="0" max="10000" value={fields.visitOrder || 0} onChange={e => change({ visitOrder: Number(e.target.value) })}/></label></div><p className="quiet">原图保存在此设备，预览图单独生成。HEIC能否预览取决于浏览器；请定期导出原图备份。</p><label className="field">给这段旅程一个名字<input placeholder="例如：在西湖，把日子慢下来" maxLength={200} value={title} onChange={e => change({ title: e.target.value })}/></label>
    <div className="field"><span className="field-title">游玩过的地方<small>{suggestions.length ? '景点示例 · 点击选择' : '手动添加你发现的风景'}</small></span><div className="chip-options">{[...new Set([...suggestions.map(s => s.name), ...attractions])].map(name => <button type="button" key={name} className={attractions.includes(name) ? 'selected' : ''} aria-pressed={attractions.includes(name)} onClick={() => change({ attractions: attractions.includes(name) ? attractions.filter(a => a !== name) : [...attractions, name] })}>{attractions.includes(name) && <CheckIcon size={14}/ >}{name}</button>)}</div><div className="custom-place"><input aria-label="添加自定义景点" placeholder="添加一个小众地点…" value={customPlace} maxLength={40} onChange={e => change({ customPlace: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPlace(); } }}/><button type="button" onClick={addPlace}>添加</button></div></div>
    <label className="field">留下一点感受<textarea rows={3} placeholder="那天的风、遇到的人，或是想记住的一瞬间…" maxLength={10000} value={note} onChange={e => change({ note: e.target.value })}/></label>
    <div className="field"><span className="field-title">收藏原图<small>{photos.length}/8张 · 第一张为封面</small></span><div className="upload-photos">{photos.map((p, i) => <div key={i}><PhotoImage src={p} alt={'旅行照片 ' + (i + 1)}/><button type="button" aria-label={'移除第' + (i + 1) + '张照片'} onClick={() => change({ photos: photos.filter((_, j) => j !== i) })}><XIcon size={14}/></button><button type="button" className="cover-choice" aria-label={i === 0 ? '当前封面' : '设第' + (i + 1) + '张为封面'} onClick={() => i && change({ photos: [p, ...photos.filter((_, j) => j !== i)] })}>{i === 0 ? '封面' : '设为封面'}</button></div>)}{photos.length < 8 && <label className="upload-button">{busy ? <CircleNotchIcon className="spin" size={26}/> : <CameraIcon size={26}/>}<span>{busy ? '处理照片中' : '上传照片'}</span><input aria-label="上传旅行照片" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple disabled={busy || saving} onChange={upload}/></label>}</div></div>
  </div><footer><div className="draft-status"><span>{draftStatus === 'saved' ? '草稿已自动保存' : draftStatus === 'pending' ? '草稿保存中…' : draftStatus === 'error' ? '草稿未保存' : '私人保存 · 当前浏览器'}</span>{(dirty || draft) && <button type="button" disabled={busy || saving || closing} onClick={discard}>放弃草稿</button>}</div><button type="submit" className="action primary" disabled={busy || saving || closing || loadingCities || loadingCounties || !city}><SunIcon size={18}/>{saving ? '保存中…' : busy ? '处理照片中…' : recordId ? '保存修改' : '点亮并保存'}</button></footer></form></section></div>;
}
