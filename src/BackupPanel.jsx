import React, { useRef, useState } from 'react';
import { XIcon, DownloadSimpleIcon } from '@phosphor-icons/react';
import { readBackupFile } from './archive.js';
import { useDialogFocus } from './useDialogFocus.js';

export function BackupPanel({ data, onClose, onRestore }) {
  const [backup, setBackup] = useState(null), [error, setError] = useState(''), [filename, setFilename] = useState('');
  const [mode, setMode] = useState('merge'), [confirmReplace, setConfirmReplace] = useState(false), [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useDialogFocus(ref, onClose, busy);
  async function choose(event) {
    const file = event.target.files?.[0]; event.target.value = ''; setBackup(null); setError(''); setConfirmReplace(false);
    if (!file) return;
    setBusy(true);
    try { const validated = await readBackupFile(file); setBackup(validated); setFilename(file.name); }
    catch (e) { setError(e instanceof SyntaxError ? '文件不是有效JSON备份，现有记录未改变' : e.message); }
    finally { setBusy(false); }
  }
  async function restore() {
    if (!backup || busy || mode === 'replace' && !confirmReplace) return;
    setBusy(true); setError('');
    try { await onRestore(backup, mode, data.revision); onClose(); }
    catch (e) { setError(e.message || '恢复失败，现有记录未改变'); setBusy(false); setConfirmReplace(false); }
  }
  const shared = backup?.records.filter(r => data.records.some(current => current.id === r.id)).length || 0;
  return <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !busy && onClose()}><section className="backup-modal" role="dialog" aria-modal="true" aria-labelledby="backup-title" ref={ref}><header><h2 id="backup-title">恢复旅行备份</h2><button className="icon-button" aria-label="关闭备份恢复" disabled={busy} onClick={onClose}><XIcon size={22}/></button></header><p>支持包含原图的 .yhf 备份和旧版JSON。新版原图备份不受旧版100 MiB文件限制，逐张校验后原子恢复。</p><label className="backup-file"><DownloadSimpleIcon size={23}/><span>{filename || '选择原图备份或旧版JSON'}</span><input type="file" accept=".yhf,.json,application/json,application/octet-stream" aria-label="选择旅行备份文件" disabled={busy} onChange={choose}/></label>{error && <p className="inline-warning" role="alert">{error}</p>}{backup && <><div className="backup-preview"><span><b>{backup.records.length}</b>段旅行</span><span><b>{backup.marks.length}</b>个手动足迹</span><span><b>{backup.records.reduce((s,r) => s + r.photos.length,0)}</b>张照片</span></div><label className="restore-option"><input type="radio" name="restore-mode" value="merge" checked={mode === 'merge'} onChange={() => setMode('merge')}/><span><strong>合并恢复</strong><small>保留现有数据；{shared}条相同ID的记录保留当前版本，其余记录新增。</small></span></label><label className="restore-option"><input type="radio" name="restore-mode" value="replace" checked={mode === 'replace'} onChange={() => { setMode('replace'); setConfirmReplace(false); }}/><span><strong>替换全部记录</strong><small>替换现有旅行与手动足迹。系统会自动保留一份替换前快照，可在设置中撤销。</small></span></label>{mode === 'replace' && <label className="replace-confirm"><input type="checkbox" checked={confirmReplace} onChange={e => setConfirmReplace(e.target.checked)}/>我确认用此备份替换现有旅行记录和手动足迹</label>}</>}<footer><small>恢复失败时原数据不变 · 草稿不会被清除</small><button className="action primary" disabled={!backup || busy || mode === 'replace' && !confirmReplace} onClick={restore}>{busy ? '处理中…' : '确认恢复'}</button></footer></section></div>;
}
