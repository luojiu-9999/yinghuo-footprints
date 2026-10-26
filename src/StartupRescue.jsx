import React, { useState } from 'react';
import { BackupPanel } from './BackupPanel.jsx';
import { rawRescueBackup, restoreBackup, readData, exportBackup } from './storage.js';
import { downloadBlob } from './photo-store.js';
import { createArchive } from './archive.js';
export function StartupRescue({ error, onRecovered }) {
  const [open, setOpen] = useState(false), [message, setMessage] = useState(''), [snapshot, setSnapshot] = useState({ records: [], marks: [], revision: 0 });
  async function chooseRestore() { try { setSnapshot(await readData()); setOpen(true); } catch (e) { setMessage('本地数据库无法使用，暂不能恢复。请先导出救援文本，并检查浏览器权限：' + e.message); } }
  async function raw() { try { downloadBlob(new Blob([JSON.stringify(await rawRescueBackup(), null, 2)], { type: 'application/json' }), '萤火足迹-原始救援文本.json'); setMessage('原始文本已导出；这是诊断副本，不包含原图文件，也不会修改旧数据。'); } catch (e) { setMessage(e.message); } }
  return <main className="content-page rescue-page"><span className="eyebrow">YOUR MEMORIES ARE STILL YOURS</span><h1>旅行空间暂时未能载入</h1><p role="alert">{error}</p><p>请勿清除浏览器数据。原有内容不会因刷新或恢复失败被删除。</p><div className="rescue-actions"><button className="action" onClick={raw}>导出原始救援文本</button><button className="action" onClick={async () => { try { downloadBlob(await createArchive(await exportBackup()), '萤火足迹-可读原图备份.yhf'); setMessage('可读原图备份已导出'); } catch (e) { setMessage('无法生成完整备份：' + e.message + '；请先保存原始救援文本。'); } }}>导出可读原图备份</button><button className="action primary" onClick={chooseRestore}>从旅行备份恢复</button><button className="action" onClick={() => location.reload()}>重新载入</button></div>{message && <p role="status">{message}</p>}{open && <BackupPanel data={snapshot} onClose={() => setOpen(false)} onRestore={async (backup, mode, revision) => { const next = await restoreBackup(backup, mode, revision); onRecovered(next); }}/>}</main>;
}
