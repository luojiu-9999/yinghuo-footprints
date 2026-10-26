import { PhotoImage, PhotoDownloadButton } from './PhotoImage.jsx';
import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { ButterflyIcon, MapTrifoldIcon, MagnifyingGlassIcon, TShirtIcon, UserCircleIcon, CaretRightIcon, CheckIcon, XIcon, PlusIcon, MinusIcon, MapPinIcon, ImagesIcon, CompassIcon, SunIcon, CrosshairIcon, DownloadSimpleIcon, TrashIcon, ArrowLeftIcon, CaretLeftIcon } from '@phosphor-icons/react';
import { MapView, loadMap, childrenFromMap } from './MapView.jsx';
import { ROOT, ZHEJIANG, HANGZHOU, THEMES, seedRecords, shortName, totalStats, recordHasRegion, markHasRegion, cityFootprints, MUNICIPAL_CODES } from './data.js';
import { initializeData, readData, mutateData, storeRecord, subscribeChanges, getDrafts, removeDraft, tabOwner, exportBackup, restoreBackup, readCheckpoint } from './storage.js';
import { BackupPanel } from './BackupPanel.jsx';
import { DraftBox } from './DraftBox.jsx';
import { RecordForm } from './RecordForm.jsx';
import { RecordsPage, CityPage, MemoirPage } from './Pages.jsx';
import { StartupRescue } from './StartupRescue.jsx';
import { publicURL } from './urls.js';
import { createArchive } from './archive.js';
import { downloadBlob } from './photo-store.js';
const PhotoMap = lazy(() => import('./PhotoMap.jsx').then(module => ({ default: module.PhotoMap })));
export const TODAY = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
export function Action({ icon: Icon, children, className = '', ...props }) { return <button className={`action ${className}`} {...props}>{Icon && <Icon size={19}/ >}{children}</button>; }
export function Empty({ title, text, onAdd }) { return <div className="empty"><CompassIcon size={44} weight="light"/><h2>{title}</h2><p>{text}</p>{onAdd && <Action className="primary" icon={PlusIcon} onClick={onAdd}>留下第一段记忆</Action>}</div>; }
function getTheme() { try { return localStorage.getItem('yinghuo-theme-v1') === 'night' ? 'night' : 'landscape'; } catch { return 'landscape'; } }

export function App() {
  const [theme, setTheme] = useState(getTheme);
  const [themeOpen, setThemeOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [data, setData] = useState({ records: [], marks: [], revision: 0 });
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState('');
  const [drafts, setDrafts] = useState([]), [draftBox, setDraftBox] = useState(false), [backupOpen, setBackupOpen] = useState(false), [checkpoint, setCheckpoint] = useState(null);
  const owner = useRef(tabOwner()).current;
  const { records, marks } = data;
  const [page, setPage] = useState('map');
  const [path, setPath] = useState([ROOT]);
  const region = path.at(-1);
  const [selected, setSelected] = useState(ZHEJIANG);
  const [children, setChildren] = useState([]);
  const [index, setIndex] = useState([]);
  const [query, setQuery] = useState('');
  const [listQuery, setListQuery] = useState('');
  const [zoom, setZoom] = useState(1);
  const [form, setForm] = useState(null);
  const [toast, setToast] = useState('');
  const [photoViewer, setPhotoViewer] = useState(null);
  const [city, setCity] = useState(null);
  const [story, setStory] = useState(null);
  const notifier = useRef(null);
  const stats = totalStats(records, marks);
  const notify = text => { setToast(text); clearTimeout(notifier.current); notifier.current = setTimeout(() => setToast(''), 4300); };
  const applyData = snapshot => setData(current => snapshot.revision >= current.revision ? snapshot : current);
  const failureMessage = error => error.name === 'QuotaExceededError' ? '本地数据库空间不足，原记录仍保留，请管理照片或导出备份' : error.message || '保存未完成，原记录仍保留';
  const persist = async mutator => { try { applyData(await mutateData(mutator)); return true; } catch (error) { notify(failureMessage(error)); return false; } };
  useEffect(() => {
    let active = true;
    const refresh = type => {
      if (type === 'data') readData().then(snapshot => { if (active) applyData(snapshot); }).catch(error => active && notify(failureMessage(error)));
      getDrafts().then(items => active && setDrafts(items)).catch(() => {});
    };
    const unsubscribe = subscribeChanges(refresh);
    initializeData({ records: seedRecords, marks: [] }).then(async snapshot => {
      if (!active) return; applyData(snapshot); setLoading(false);
      const [items, before] = await Promise.all([getDrafts(), readCheckpoint()]);
      if (active) { setDrafts(items); setCheckpoint(before); }
    }).catch(error => { if (active) { setLoadError(failureMessage(error)); setLoading(false); } });
    return () => { active = false; unsubscribe(); };
  }, []);
  useEffect(() => { fetch(publicURL('/maps/index.json')).then(r => r.json()).then(items => setIndex(items.filter(i => Number.isFinite(i.code)))).catch(() => notify('地区搜索暂不可用，仍可通过地图浏览')); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('yinghuo-theme-v1', theme); } catch {} }, [theme]);
  useEffect(() => { const key = e => { if (e.key === 'Escape') { setThemeOpen(false); setProfileOpen(false); setPhotoViewer(null); setQuery(''); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, []);
  useEffect(() => { if (!photoViewer) return; const key = e => { if (e.key === 'ArrowRight') setPhotoViewer(v => ({ ...v, current: (v.current + 1) % v.photos.length })); if (e.key === 'ArrowLeft') setPhotoViewer(v => ({ ...v, current: (v.current - 1 + v.photos.length) % v.photos.length })); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [photoViewer]);
  const searched = useMemo(() => query.trim() ? index.filter(i => i.name.includes(query.trim())).slice(0, 9) : [], [query, index]);
  const focus = selected || region;
  const focusRecords = records.filter(r => recordHasRegion(r, focus.code));
  const focusStats = totalStats(focusRecords, marks.filter(m => markHasRegion(m, focus.code)));
  const footprintCities = cityFootprints(records, marks, index);
  const isVisited = focusRecords.length > 0 || marks.some(m => m.code === focus.code || (m.path || []).some(p => p.code === focus.code));
  const nav = id => { setPage(id); setCity(null); setStory(null); setThemeOpen(false); setProfileOpen(false); setQuery(''); };
  const enter = item => { setPath([...(item.path || path), item]); setSelected(null); setZoom(1); setListQuery(''); setPage('map'); setQuery(''); };
  const selectRegion = (item, drill) => { if (drill && item.level !== 'district') enter(item); else setSelected(item); };
  const searchChoose = item => { setPath(item.path?.length ? item.path : [ROOT]); setSelected(item); setPage('map'); setCity(null); setStory(null); setZoom(1); setListQuery(''); setQuery(''); };
  const openForm = (target, record, draft) => {
    setThemeOpen(false); setProfileOpen(false); setDraftBox(false);
    setForm({ region: target, record, draft, key: crypto.randomUUID() });
  };
  const addRecord = item => {
    const target = item || ROOT;
    const draft = drafts.find(d => d.owner === owner && !d.recordId && d.region.code === target.code);
    openForm(target, undefined, draft);
  };
  const editRecord = record => {
    const target = footprintCities.find(c => c.code === record.cityCode) || { code: record.cityCode, name: record.cityName, level: 'city', path: [ROOT, { code: record.provinceCode, name: record.provinceName, level: 'province' }] };
    openForm(target, record, drafts.find(d => d.owner === owner && d.recordId === record.id));
  };
  const resumeDraft = draft => {
    const resumed = draft.owner === owner ? draft : { ...draft, id: crypto.randomUUID(), owner };
    openForm(draft.region, records.find(r => r.id === draft.recordId), resumed);
  };
  const discardDraft = async draft => {
    if (!window.confirm('放弃这份草稿？已保存的记录不会改变。')) return;
    try { await removeDraft(draft.id); notify('草稿已放弃'); } catch (error) { notify(failureMessage(error)); }
  };
  const cityOpen = code => {
    const item = footprintCities.find(c => c.code === code) || index.find(i => i.code === code);
    if (item?.level === 'province' && !MUNICIPAL_CODES.has(item.code)) { searchChoose(item); return; }
    setCity(item || { code, name: records.find(r => r.cityCode === code)?.cityName, level: 'city' }); setPage('city'); setStory(null);
  };
  const markRegion = async () => {
    if (focus.code === 100000) return;
    const target = focus, light = !marks.some(m => m.code === target.code);
    const ok = await persist(current => ({ ...current, marks: light ? current.marks.some(m => m.code === target.code) ? current.marks : [...current.marks, { ...target, date: TODAY }] : current.marks.filter(m => m.code !== target.code) }));
    if (ok) notify(light ? '已点亮' + target.name + '，可稍后补充旅行记录' : '手动点亮已取消，旅行记录仍然保留');
  };
  const locate = () => {
    if (!navigator.geolocation) { notify('当前浏览器不支持定位，请手动选择地区'); return; }
    notify('正在确认位置，请允许浏览器使用定位…');
    navigator.geolocation.getCurrentPosition(async position => {
      let found;
      try {
        const { longitude: lng, latitude: lat } = position.coords;
        const contains = ring => { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside; } return inside; };
        let trail = [ROOT];
        for (let depth = 0; depth < 3; depth++) {
          const geo = await loadMap(trail.at(-1).code);
          const feature = geo.features.find(f => { const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates; return polygons?.some(p => contains(p[0]) && !p.slice(1).some(contains)); });
          if (!feature) break;
          found = childrenFromMap(geo, trail).find(r => r.code === Number(feature.properties.adcode));
          if (!found || found.level === 'district') break;
          trail = [...trail, found];
        }
      } catch { /* A province-direct city may not have a child boundary file. */ }
      if (!found) { notify('当前位置未匹配到可用行政区，请手动选择'); return; }
      searchChoose(found); addRecord(found); notify(`已定位到${found.name}，请核对后保存`);
    }, () => notify('未能获取位置，你仍可手动点亮或补录旅行'), { timeout: 12000, maximumAge: 60000 });
  };
  const deleteRecord = async record => {
    if (!window.confirm('删除「' + record.title + '」？地图足迹和本地原图库将保留。')) return;
    const ok = await persist(current => {
      const latest = current.records.find(r => r.id === record.id);
      if (!latest || latest.version !== record.version) throw new Error('这条记录已在其他页面更新，请重新查看后再删除');
      const province = { code: latest.provinceCode, name: latest.provinceName, level: 'province', path: [ROOT] };
      const cityRegion = footprintCities.find(c => c.code === latest.cityCode) || { code: latest.cityCode, name: latest.cityName, level: 'city', path: [ROOT, province] };
      const visited = [cityRegion, ...latest.districtCodes.map((code, i) => index.find(node => node.code === code) || { code, name: latest.districtNames[i], level: 'district', path: [...cityRegion.path, cityRegion] })];
      return { ...current, records: current.records.filter(r => r.id !== record.id), marks: [...current.marks, ...visited.filter(item => !current.marks.some(m => m.code === item.code)).map(item => ({ ...item, date: record.date }))] };
    });
    if (ok) { setStory(null); notify('旅行记录已删除，地图足迹已保留'); }
  };
  const exportData = async () => {
    try {
      notify('正在校验原图并制作完整备份，请稍候…');
      downloadBlob(await createArchive(await exportBackup()), '萤火足迹-原图备份.yhf'); notify('原图、旅行和照片地图已导出，恢复时请选择此 .yhf 文件');
    } catch (error) { notify(failureMessage(error)); }
  };
  const restore = async (backup, mode, revision) => {
    applyData(await restoreBackup(backup, mode, revision)); setPage('map'); setCity(null); setStory(null); setCheckpoint(await readCheckpoint()); notify(mode === 'merge' ? '备份已合并，相同ID保留当前记录' : '备份已替换恢复，可在设置中撤销');
  };
  const undoRestore = async () => {
    const before = await readCheckpoint();
    if (!before || !window.confirm('恢复到上次替换之前的数据？当前数据也会保留为新的恢复快照。')) return;
    try { await restore(before, 'replace', data.revision); } catch (error) { notify(failureMessage(error)); }
  };
  const submitRecord = async (record, options) => {
    try { const result = await storeRecord(record, options); applyData(result); setForm(null); notify(options.expectedVersion !== undefined ? '旅行记忆已更新，足迹与回忆录已同步' : '旅行已收藏，足迹已点亮'); }
    catch (error) { if (error.code === 'CONFLICT') throw error; throw new Error(failureMessage(error)); }
  };

  if (loadError) return <StartupRescue error={loadError} onRecovered={snapshot => { applyData(snapshot); setLoadError(''); setLoading(false); notify('已从备份恢复，旧版原始文本仍保留'); }}/ >;
  if (loading) return <main className="content-page"><h1>萤火足迹</h1><p role="status">正在载入你的旅行空间…</p></main>;


  return <div className={`app theme-${theme} ${themeOpen ? 'theme-picker-open' : ''}`}>
    <header className="header">
      <button className="brand" onClick={() => nav('map')} aria-label="萤火足迹首页"><PhotoImage className="brand-logo" src="/assets/firefly.png" alt=""/><span>萤火足迹</span></button>
      <nav className="main-nav" aria-label="主导航">{[['map', '足迹地图'], ['records', '城市记录'], ['memoir', '回忆录'], ['collage', '照片地图']].map(([id, label]) => <button key={id} className={(page === id || id === 'records' && page === 'city') ? 'active' : ''} onClick={() => nav(id)}>{label}</button>)}</nav>
      <div className="header-search"><MagnifyingGlassIcon size={20}/><input aria-label="搜索省、市、区县" placeholder="搜索省、市、区县" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searched[0] && searchChoose(searched[0])}/>{query && <button className="icon-button" aria-label="清空搜索" onClick={() => setQuery('')}><XIcon size={16}/></button>}{query && <div className="search-results">{searched.length ? searched.map(item => <button key={item.code} onClick={() => searchChoose(item)}><MapPinIcon size={18}/><span><strong>{item.name}</strong><small>{(item.path || []).slice(1).map(p => p.name).join(' · ') || '中国'}</small></span><CaretRightIcon size={15}/></button>) : <p>没有找到这个地区，试试完整名称</p>}</div>}</div>
      <div className="header-tools"><button className={`icon-button theme-trigger ${themeOpen ? 'selected' : ''}`} aria-label="外观主题" aria-expanded={themeOpen} onClick={() => { setThemeOpen(!themeOpen); setProfileOpen(false); }}><TShirtIcon size={25}/></button><span className="header-divider"/><button className="icon-button" aria-label="我的设置" aria-expanded={profileOpen} onClick={() => { setProfileOpen(!profileOpen); setThemeOpen(false); }}><UserCircleIcon size={33} weight="duotone"/></button></div>
      {themeOpen && <div className="theme-popover"><h3><TShirtIcon size={22}/>外观主题</h3><div className="theme-options">{THEMES.map(t => <button key={t.id} className={theme === t.id ? 'chosen' : ''} aria-label={t.name} aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}><span className={`appearance-swatch ${t.id}`} aria-hidden="true"><i/><i/><i/></span>{theme === t.id && <CheckIcon className="theme-check" size={22} weight="bold"/>}<span>{t.name}</span></button>)}</div><p>仅改变视觉风格，足迹数据不会变化</p></div>}
      {profileOpen && <div className="profile-popover"><h3>我的旅行空间</h3><p>私人保存 · 当前浏览器</p><Action icon={DownloadSimpleIcon} onClick={exportData}>导出旅行备份</Action><Action icon={DownloadSimpleIcon} onClick={() => { setProfileOpen(false); setBackupOpen(true); }}>恢复旅行备份</Action><Action onClick={() => { setProfileOpen(false); setDraftBox(true); }}>草稿箱（{drafts.length}）</Action>{checkpoint && <Action onClick={undoRestore}>撤销上次替换恢复</Action>}{records.some(r => r.example) && <Action icon={TrashIcon} onClick={async () => { if (await persist(current => ({ ...current, records: current.records.filter(r => !r.example) }))) { setProfileOpen(false); notify('示例记录已移除，现在开始你的旅程'); } }}>移除示例足迹</Action>}<small>原图与预览分开保存在此设备；请定期导出原图备份，清除站点数据会删除本地内容。</small></div>}
    </header>
    {drafts.length > 0 && !form && <div className="draft-banner"><span>有{drafts.length}份未完成旅行草稿，内容已保留</span><button onClick={() => setDraftBox(true)}>打开草稿箱</button></div>}
    {page === 'map' && <main className="map-layout"><section className="map-stage">
      <div className="map-heading"><div className="breadcrumbs">{path.map((p, i) => <React.Fragment key={p.code}>{i > 0 && <CaretRightIcon size={14}/>}<button onClick={() => { setPath(path.slice(0, i + 1)); setSelected(null); setZoom(1); }}>{p.name}</button></React.Fragment>)}</div><h1>{region.name}<span>一寸山河，一段记忆</span></h1><p>山河辽阔，步履成光<br/>每一处足迹，都是生活的注脚。</p></div>
      <MapView region={region} path={path} theme={theme} records={records} marks={marks} selected={selected} onSelect={selectRegion} onChildren={setChildren} zoom={zoom}/>
      <div className="map-controls"><button className="icon-button" aria-label="放大地图" onClick={() => setZoom(Math.min(zoom + .2, 3))}><PlusIcon size={20}/></button><button className="icon-button" aria-label="缩小地图" onClick={() => setZoom(Math.max(zoom - .2, .7))}><MinusIcon size={20}/></button><button className="icon-button" aria-label="重置地图视图" onClick={() => setZoom(1)}><CrosshairIcon size={20}/></button></div>
      <div className="map-footer"><span className="legend"><i className="legend-lit"/>已留下足迹<i className="legend-empty"/>待探索</span><span className="map-hint">点击选择 · 双击进入 · 滚轮缩放</span><button onClick={locate}><CrosshairIcon size={17}/>定位点亮</button></div>
    </section><aside className="region-panel"><div className="panel-top"><span>{focus.code === 100000 ? '我的旅行版图' : `${(focus.path || path).map(p => p.name).slice(-2).join(' / ')}`}</span>{records.some(r => r.example) && <span className="sample-label">含示例足迹</span>}</div><h2>{focus.code === 100000 ? '我的足迹' : focus.name}</h2><div className="gold-rule"/>
      {focus.code === 100000 ? <><p className="progress-text">已点亮 <b>{stats.cities}</b> 座城市 · <b>{stats.counties}</b> 个区县</p><p className="quiet">从一座城开始，慢慢走遍山河。</p><Action className="primary wide" icon={SunIcon} onClick={() => addRecord(ROOT)}>点亮新足迹<CaretRightIcon size={18}/></Action></> : <><p className="progress-text">{focus.level === 'province' ? <>已点亮 <b>{focusStats.cities}</b> 座城市 · <b>{focusStats.counties}</b> 个区县</> : isVisited ? <><b>{focusRecords.length}</b> 段旅行记忆 · 已留下足迹</> : <>下一段故事，从这里开始</>}</p>{focus.code !== 100000 && <p className="quiet footprint-memory-count">{focusRecords.length}段旅行记忆{isVisited && !focusRecords.length ? ' · 已点亮，待补充记录' : ''}</p>}<Action className="primary wide" icon={focus.level === 'district' ? SunIcon : CompassIcon} onClick={() => focus.level === 'district' ? addRecord(focus) : enter(focus)}>{focus.level === 'district' ? '点亮并记录' : `进入${shortName(focus.name)}`}<CaretRightIcon size={18}/></Action><div className="secondary-actions"><button onClick={markRegion}><SunIcon size={17}/>{marks.some(m => m.code === focus.code) ? '取消手动点亮' : '仅点亮区域'}</button><button onClick={() => addRecord(focus)}><PlusIcon size={17}/>记录足迹</button></div></>}
      <div className="region-cover"><PhotoImage src={String(focus.code).startsWith('53') ? '/assets/dali.png' : focus.code === 100000 || String(focus.code).startsWith('33') ? '/assets/hangzhou.png' : '/assets/landscape.png'} alt={String(focus.code).startsWith('53') ? '大理洱海风景' : String(focus.code).startsWith('33') ? '杭州西湖风景' : '山水旅行意境'}/><span><MapPinIcon size={20}/>{focus.code === 330000 ? '西湖 · 杭州' : focus.code === 530000 ? '洱海 · 大理' : focus.name}<small>行过山河，收集更大的自己</small></span></div>
      <div className="region-children"><div className="section-title"><h3>{region.code === 100000 ? '选择省份' : region.level === 'province' ? '继续探索' : '点亮区县'}</h3><span>{children.length} 个地区</span></div><label className="list-search"><MagnifyingGlassIcon size={16}/><input aria-label="筛选当前地区" placeholder="快速查找" value={listQuery} onChange={e => setListQuery(e.target.value)}/></label><div className="region-list">{children.filter(c => c.name.includes(listQuery)).map(item => { const lit = records.some(r => recordHasRegion(r, item.code)) || marks.some(m => m.code === item.code || (m.path || []).some(p => p.code === item.code)); return <button key={item.code} className={selected?.code === item.code ? 'active' : ''} onClick={() => selectRegion(item, item.level !== 'district')}><span>{shortName(item.name)}</span>{lit && <span className="lit-badge">已留足迹</span>}<CaretRightIcon size={14}/></button>; })}{!children.length && <p className="quiet">暂无可用细分边界，仍可记录当前地区。</p>}</div></div>
      <div className="footprint-stats"><span><MapPinIcon size={20}/><strong>{stats.cities}</strong><small>城市</small></span><span><CompassIcon size={20}/><strong>{stats.counties}</strong><small>区县</small></span><span><ImagesIcon size={20}/><strong>{stats.photos}</strong><small>照片</small></span></div>
    </aside></main>}
    {page === 'collage' && <Suspense fallback={<main className="content-page" role="status">正在打开照片地图…</main>}><PhotoMap records={records} index={index} notify={notify} theme={theme}/></Suspense>}
    {page === 'records' && <RecordsPage records={records} marks={marks} index={index} stats={stats} onAdd={() => addRecord(ROOT)} onCity={cityOpen}/>}
    {page === 'city' && city && <CityPage city={city} records={records.filter(r => r.cityCode === city.code)} marks={marks} index={index} onEdit={editRecord} onBack={() => nav('records')} onAdd={() => addRecord(city)} onStory={r => { setStory(r); setPage('memoir'); }} onPhoto={(photos, current) => setPhotoViewer({ photos, current })} onMap={item => searchChoose(item || city)}/>}
    {page === 'memoir' && <MemoirPage theme={theme} records={records} story={story ? records.find(r => r.id === story.id) || null : null} onEdit={editRecord} setStory={setStory} onAdd={() => addRecord(ROOT)} onDelete={deleteRecord} onPhoto={(photos, current) => setPhotoViewer({ photos, current })}/>}
    {form && <RecordForm key={form.key} region={form.region} record={form.record} draft={form.draft} owner={owner} index={index} onClose={() => setForm(null)} notify={notify} onSave={submitRecord}/>}
    {backupOpen && <BackupPanel data={data} onClose={() => setBackupOpen(false)} onRestore={restore}/>}
    {draftBox && <DraftBox drafts={drafts} onClose={() => setDraftBox(false)} onResume={resumeDraft} onDiscard={discardDraft}/>}
    {photoViewer && <div className="lightbox" role="dialog" aria-modal="true" aria-label="旅行照片浏览"><button className="lightbox-close icon-button" aria-label="关闭照片" onClick={() => setPhotoViewer(null)}><XIcon size={25}/></button><button className="lightbox-prev icon-button" aria-label="上一张照片" onClick={() => setPhotoViewer(v => ({ ...v, current: (v.current - 1 + v.photos.length) % v.photos.length }))}><CaretLeftIcon size={30}/></button><PhotoImage src={photoViewer.photos[photoViewer.current]} alt={`旅行照片 ${photoViewer.current + 1}`}/><button className="lightbox-next icon-button" aria-label="下一张照片" onClick={() => setPhotoViewer(v => ({ ...v, current: (v.current + 1) % v.photos.length }))}><CaretRightIcon size={30}/></button><div className="original-download"><PhotoDownloadButton source={photoViewer.photos[photoViewer.current]} notify={notify}/></div><span>{photoViewer.current + 1} / {photoViewer.photos.length}</span></div>}
    {toast && <div className="toast" role="status"><ButterflyIcon size={20} weight="duotone"/>{toast}</div>}
  </div>;
}
