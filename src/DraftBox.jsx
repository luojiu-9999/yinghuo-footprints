import React, { useRef } from 'react';
import { XIcon, TrashIcon } from '@phosphor-icons/react';
import { useDialogFocus } from './useDialogFocus.js';
export function DraftBox({ drafts, onClose, onResume, onDiscard }) {
  const ref = useRef(null); useDialogFocus(ref, onClose);
  return <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}><section className="backup-modal" ref={ref} role="dialog" aria-modal="true" aria-labelledby="draft-box-title"><header><h2 id="draft-box-title">草稿箱</h2><button className="icon-button" aria-label="关闭草稿箱" onClick={onClose}><XIcon size={22}/></button></header><p>草稿仅保存在当前浏览器，正式保存后会从这里移除。</p>{drafts.length ? <div className="draft-list">{drafts.map(d => <article key={d.id}><div><strong>{d.fields.title || '未命名旅行'}</strong><small>{d.region.name} · {d.fields.photos.length}张照片 · {new Date(d.updatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</small></div><button className="action primary" onClick={() => onResume(d)}>继续编辑</button><button className="icon-button" aria-label={'放弃草稿：' + (d.fields.title || '未命名旅行')} onClick={() => onDiscard(d)}><TrashIcon size={18}/></button></article>)}</div> : <p className="quiet">暂无未完成草稿。</p>}</section></div>;
}
