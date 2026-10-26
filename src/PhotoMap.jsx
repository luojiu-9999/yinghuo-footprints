import React, { useEffect, useRef, useState } from 'react';
import { loadMap } from './MapView.jsx';
import { getLayouts, saveLayout, photoLibraryRefs } from './storage.js';
import { PhotoImage, PhotoDownloadButton } from './PhotoImage.jsx';
import { photoPreview, importOriginal, downloadBlob } from './photo-store.js';
import { mapGeometry, drawMapBase, regionPath, drawCover, loadImage } from './geo-canvas.js';

const emptyState = () => ({ photos: [], crops: {}, columns: 2 });
function emptyLayout(mapCode, regionCode) { return { key: mapCode+':'+regionCode, mapCode, regionCode, mode: 'single', single: emptyState(), multi: emptyState() }; }
const imageCache = new Map();
async function previewImage(source) { if(imageCache.size>32)imageCache.delete(imageCache.keys().next().value); if (!imageCache.has(source)) imageCache.set(source, photoPreview(source).then(loadImage).catch(e => { imageCache.delete(source); throw e; })); return imageCache.get(source); }
export async function drawPhotoMap(canvas, geo, layouts, mapCode, selected, dark) {
  const ctx = canvas.getContext('2d'), { width, height } = canvas, map = mapGeometry(geo,width,height,30*width/1000);
  ctx.clearRect(0,0,width,height); ctx.fillStyle = dark ? '#0b252c' : '#f8fbf9'; ctx.fillRect(0,0,width,height); drawMapBase(ctx,map,dark);
  for (const item of map.items) {
    const layout = layouts.find(l => l.mapCode === mapCode && l.regionCode === item.code), state = layout?.[layout.mode];
    const path = regionPath(item);
    if (state?.photos.length) {
      ctx.save(); ctx.clip(path,'evenodd');
      try {
        const columns = layout.mode==='single' ? 1 : Math.min(state.columns || 2,state.photos.length), rows = Math.ceil(state.photos.length/columns), [x,y,w,h] = item.box;
        for (let i=0;i<state.photos.length;i++) {
          const box = [x+(i%columns)*w/columns,y+Math.floor(i/columns)*h/rows,w/columns,h/rows], image = await previewImage(state.photos[i]);
          ctx.save(); ctx.beginPath(); ctx.rect(...box); ctx.clip(); drawCover(ctx,image,box,state.crops[state.photos[i]]); ctx.restore();
        }
      } finally { ctx.restore(); }
    }
    ctx.strokeStyle = item.code === selected ? '#d1ac4c' : dark ? '#aac4bd' : '#fff'; ctx.lineWidth = (item.code===selected ? 2.5 : 1)*width/1000; ctx.stroke(path);
    if (item.box[2]>width/35 && item.box[3]>height/30) { ctx.font = `${Math.max(10,12*width/1000)}px sans-serif`; ctx.fillStyle = state?.photos.length ? '#fff' : dark ? '#c5d6cf' : '#426457'; ctx.shadowColor = '#173a36'; ctx.shadowBlur = state?.photos.length ? 5 : 0; ctx.textAlign = 'center'; ctx.fillText(item.name,item.box[0]+item.box[2]/2,item.box[1]+item.box[3]/2); ctx.shadowBlur = 0; }
  }
  ctx.textAlign = 'left'; ctx.fillStyle = dark ? '#b3c7bf' : '#5b7365'; ctx.font = `${12*width/1000}px sans-serif`; ctx.fillText('萤火足迹 · 照片地图  |  边界来源：DataV GeoAtlas  |  照片填充不代表到访事实',24*width/1000,height-20*width/1000);
  return map;
}
export function PhotoMap({ records, index, notify, theme }) {
  const [provinceCode,setProvinceCode] = useState(0), [cityCode,setCityCode] = useState(0), [regionCode,setRegionCode] = useState(0);
  const mapCode = cityCode || provinceCode || 100000;
  const [geo,setGeo] = useState(null), [layouts,setLayouts] = useState([]), [extras,setExtras] = useState([]), [error,setError] = useState(''), [status,setStatus] = useState(''), [uploading,setUploading] = useState(false), [exporting,setExporting] = useState(false), [activePhoto,setActivePhoto] = useState(''), [photoLimit,setPhotoLimit] = useState(48);
  const canvas = useRef(null), chain = useRef(Promise.resolve()), currentLayouts = useRef([]), generation = useRef(0), saveVersion = useRef(0), pendingSave = useRef(false);
  const importing = useRef(false);importing.current = uploading;
  const layout = layouts.find(l => l.mapCode===mapCode && l.regionCode===regionCode) || emptyLayout(mapCode,regionCode), mode = layout.mode, state = layout[mode];
  const allPhotos = [...new Set([...records.flatMap(r=>r.photos),...layouts.flatMap(l=>[...l.single.photos,...l.multi.photos]),...extras])];
  const provinces = index.filter(n=>n.level==='province'), cities = index.filter(n=>n.level==='city' && n.path.some(p=>p.code===provinceCode));
  const features = geo?.features.filter(f=>Number.isFinite(Number(f.properties.adcode)) && Number(f.properties.adcode)>0) || [];
  useEffect(()=>{ let active=true; getLayouts().then(items=>{ if(active) {currentLayouts.current=items;setLayouts(items);} }).catch(e=>active&&setError(e.message)); return()=>{active=false;}; },[]);
  useEffect(()=>{let active=true;photoLibraryRefs().then(refs=>active&&setExtras(refs)).catch(e=>active&&setError(e.message));return()=>{active=false;};},[]);
  useEffect(()=>{const unload=e=>{if(pendingSave.current||importing.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload);},[]);
  useEffect(()=>{ let active=true; setGeo(null);setError('');loadMap(mapCode).then(value=>{if(active){setGeo(value);setRegionCode(Number(value.features.find(f=>Number(f.properties.adcode)>0)?.properties.adcode)||0);}}).catch(e=>active&&setError(e.message));return()=>{active=false;}; },[mapCode]);
  useEffect(()=>{
    if(!geo || !canvas.current)return;
    const ticket=++generation.current, offscreen=document.createElement('canvas');offscreen.width=1000;offscreen.height=700;
    drawPhotoMap(offscreen,geo,layouts,mapCode,regionCode,document.documentElement.dataset.theme==='night').then(()=>{if(ticket===generation.current && canvas.current){canvas.current.getContext('2d').clearRect(0,0,1000,700);canvas.current.getContext('2d').drawImage(offscreen,0,0);}}).catch(e=>setError('拼贴预览失败：'+e.message));
  },[geo,layouts,mapCode,regionCode,theme]);
  function update(next) {
    const values=[...currentLayouts.current.filter(l=>l.key!==next.key),next]; currentLayouts.current=values;setLayouts(values);setStatus('正在保存拼贴…');setError('');
    const version=++saveVersion.current;pendingSave.current=true;
    chain.current=chain.current.catch(()=>{}).then(()=>saveLayout(next)).then(()=>{if(version===saveVersion.current){pendingSave.current=false;setStatus('拼贴已自动保存');}}).catch(e=>{if(version===saveVersion.current){setStatus('尚未保存，请重试');setError(e.message);}});
  }
  function selectPhoto(photo) {
    const selected=state.photos.includes(photo), count=mode==='single'?1:8;
    if(!selected && mode==='multi' && state.photos.length>=count){notify('一个区域最多拼贴8张照片');return;}
    const photos=selected?state.photos.filter(p=>p!==photo):mode==='single'?[photo]:[...state.photos,photo];
    update({...layout,[mode]:{...state,photos,crops:{...state.crops,[photo]:state.crops[photo] || {x:50,y:50,zoom:1}}}});setActivePhoto(photo);
  }
  function crop(patch) { if(!activePhoto || !state.photos.includes(activePhoto))return;update({...layout,[mode]:{...state,crops:{...state.crops,[activePhoto]:{x:50,y:50,zoom:1,...state.crops[activePhoto],...patch}}}}); }
  async function upload(event) {
    const files=[...event.target.files];event.target.value='';if(files.length>8){notify('每次最多选择8张原图');return;}setUploading(true);
    try{for(const file of files){const source=await importOriginal(file);setExtras(old=>[...old,source]);}notify('原图已保存在本地，选择照片即可填充区域');}catch(e){setError(e.message);}finally{setUploading(false);}
  }
  async function exportMap() {
    setExporting(true);setError('');
    try{await chain.current;const target=document.createElement('canvas');target.width=2400;target.height=1680;await drawPhotoMap(target,geo,currentLayouts.current,mapCode,0,document.documentElement.dataset.theme==='night');const blob=await new Promise(resolve=>target.toBlob(resolve,'image/png'));if(!blob)throw new Error('图片生成失败');downloadBlob(blob,'萤火足迹-照片地图-'+mapCode+'.png');notify('高清拼贴图已导出，原图未改动');}catch(e){setError(e.message);}finally{setExporting(false);}
  }
  const selectedName=features.find(f=>Number(f.properties.adcode)===regionCode)?.properties.name;
  const cropValue={x:50,y:50,zoom:1,...state.crops[activePhoto]};
  return <main className="content-page photo-map-page"><div className="page-intro"><div><span className="eyebrow">YOUR PHOTOS, SHAPED BY PLACES</span><h1>把风景，填进山河</h1><p>一个地方一张封面，或用多张照片拼出一段记忆。</p></div><button className="action primary" disabled={!geo||exporting} onClick={exportMap}>{exporting?'生成高清拼贴中…':'导出高清照片地图'}</button></div><div className="map-scope"><label>省份<select aria-label="照片地图省份" value={provinceCode} onChange={e=>{setProvinceCode(Number(e.target.value));setCityCode(0);}}><option value={0}>全国 · 按省填充</option>{provinces.map(p=><option value={p.code} key={p.code}>{p.name}</option>)}</select></label><label>城市<select aria-label="照片地图城市" value={cityCode} disabled={!provinceCode||!cities.length} onChange={e=>setCityCode(Number(e.target.value))}><option value={0}>{provinceCode?'全省 · 按市填充':'请先选择省份'}</option>{cities.map(c=><option value={c.code} key={c.code}>{c.name}</option>)}</select></label><span className="quiet">照片创作不改变旅行记录或点亮统计</span></div><div className="photo-map-workspace"><div className="photo-map-stage">{!geo&&!error&&<p role="status">正在展开真实地区边界…</p>}<canvas width="1000" height="700" ref={canvas} aria-label="照片填充地图" onClick={event=>{if(!geo)return;const rect=canvas.current.getBoundingClientRect(),x=(event.clientX-rect.left)*1000/rect.width,y=(event.clientY-rect.top)*700/rect.height,ctx=canvas.current.getContext('2d');const found=mapGeometry(geo,1000,700).items.find(item=>ctx.isPointInPath(regionPath(item),x,y,'evenodd'));if(found)setRegionCode(found.code);}}/></div><aside className="photo-map-editor"><span className="eyebrow">REGION STUDIO</span><label>填充区域<select aria-label="照片填充区域" value={regionCode} onChange={e=>{setRegionCode(Number(e.target.value));setActivePhoto('');}}>{features.map(f=><option key={f.properties.adcode} value={f.properties.adcode}>{f.properties.name}</option>)}</select></label><h2>{selectedName || '请选择地区'}</h2><div className="segmented"><button aria-pressed={mode==='single'} onClick={()=>update({...layout,mode:'single'})} disabled={!regionCode}>单图填充</button><button aria-pressed={mode==='multi'} onClick={()=>update({...layout,mode:'multi'})} disabled={!regionCode}>多图拼贴</button></div><p className="quiet">{mode==='single'?'选择一张照片作地区封面':'选择最多8张照片，照片整体裁切在地区边界内'}。切换模式不会清空另一种布局。</p>{mode==='multi'&&<label>拼贴列数<select aria-label="拼贴列数" value={state.columns} onChange={e=>update({...layout,multi:{...state,columns:Number(e.target.value)}})}>{[1,2,3].map(n=><option key={n} value={n}>{n}列</option>)}</select></label>}<label className="original-upload">{uploading?'保存原图中…':'＋ 从设备添加原图'}<input aria-label="为照片地图添加原图" type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" disabled={uploading} onChange={upload}/></label><div className="photo-picker">{allPhotos.slice(0,photoLimit).map((p,i)=><button key={p} aria-label={'填充照片'+(i+1)} aria-pressed={state.photos.includes(p)} disabled={!regionCode} onClick={()=>selectPhoto(p)}><PhotoImage src={p} alt={'可用照片'+(i+1)}/>{state.photos.includes(p)&&<span>{state.photos.indexOf(p)+1}</span>}</button>)}</div>{allPhotos.length>photoLimit&&<button className="text-action" onClick={()=>setPhotoLimit(v=>v+48)}>显示更多照片（{allPhotos.length}张）</button>}{state.photos.length>0&&<><label>调整哪张照片<select aria-label="裁切照片" value={state.photos.includes(activePhoto)?activePhoto:''} onChange={e=>setActivePhoto(e.target.value)}><option value="">请选择照片</option>{state.photos.map((p,i)=><option key={p} value={p}>第{i+1}张</option>)}</select></label>{state.photos.includes(activePhoto)&&<div className="crop-controls">{[['x','水平位置',0,100,1],['y','垂直位置',0,100,1],['zoom','照片缩放',1,3,0.05]].map(([key,label,min,max,step])=><label key={key}>{label}<input aria-label={label} type="range" min={min} max={max} step={step} value={cropValue[key]} onChange={e=>crop({[key]:Number(e.target.value)})}/></label>)}<div className="photo-order-controls"><button className="text-action" onClick={()=>{const photos=[...state.photos],i=photos.indexOf(activePhoto);if(i>0){[photos[i-1],photos[i]]=[photos[i],photos[i-1]];update({...layout,[mode]:{...state,photos}});}}}>向前排列</button><button className="text-action" onClick={()=>crop({x:50,y:50,zoom:1})}>重置裁切</button></div><div className="map-original-download"><PhotoDownloadButton source={activePhoto} notify={notify}/></div></div>}</>}<small role="status">{status || '布局按地区独立保存；原图永不覆盖'}</small>{status==='尚未保存，请重试'&&<button className="action" onClick={()=>update(layout)}>重试保存拼贴</button>}</aside></div>{error&&<p className="inline-warning" role="alert">{error}</p>}</main>;
}
