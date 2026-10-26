import React, { useEffect, useState } from 'react';
import { photoPreview, isPhotoRef, getPhoto, downloadPhoto } from './photo-store.js';
import { publicURL } from './urls.js';
export function PhotoImage({ src, alt = '', ...props }) {
  const [resolved, setResolved] = useState(isPhotoRef(src) ? '' : publicURL(src));
  useEffect(() => { let active = true; setResolved(isPhotoRef(src) ? '' : publicURL(src)); photoPreview(src).then(value => active && setResolved(value)).catch(() => active && setResolved(publicURL('/assets/firefly.png'))); return () => { active = false; }; }, [src]);
  return <img loading="lazy" decoding="async" {...props} src={resolved || undefined} alt={alt}/>;
}
export function PhotoDownloadButton({ source, notify }) {
  const [original,setOriginal]=useState(false),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;setChecking(true);(isPhotoRef(source)?getPhoto(source):Promise.resolve(null)).then(p=>{if(active){setOriginal(p?.originalAvailable===true);setChecking(false);}}).catch(()=>active&&setChecking(false));return()=>{active=false;};},[source]);
  return <><button className="action" disabled={checking||busy} onClick={async()=>{setBusy(true);try{notify(await downloadPhoto(source));}catch(e){notify(e.message);}finally{setBusy(false);}}}>{checking?'检查照片…':busy?'导出中…':original?'下载原图':'下载旧版图片'}</button><small>{original?'导出选入的原文件，不压缩；原片可能包含拍摄位置等元信息':'此照片只有旧版或示例图片，无法还原原片'}</small></>;
}
