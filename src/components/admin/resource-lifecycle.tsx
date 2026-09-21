'use client';
import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconButton } from '@/components/icon';
import { isBackdropClick } from '@/components/dialog-backdrop';
type Preview = { name: string; archivedAt: string | null; fingerprint: string; runningJobs: number; counts: Record<string,number> };
const labels: Record<string,string> = {lessons:'授業・課題の内容',assignments:'配信・下書き課題',conversations:'対話',messages:'対話メッセージ',assessments:'評価',plans:'学習計画',preparations:'授業記録',exams:'模試の分析',jobs:'関連する非同期処理'};
export function ResourceLifecycle({ kind, id, archived, compact = false }: { kind:'student'|'classroom'; id:string; archived:boolean; compact?:boolean }) {
  const router=useRouter();
  const dialog=useRef<HTMLDialogElement>(null);
  const heading=useId();
  const [preview,setPreview]=useState<Preview|null>(null);
  const [action,setAction]=useState<'archive'|'restore'|'delete'>('archive');
  const [confirmation,setConfirmation]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const path=`/api/admin/resources/${kind}/${id}`;
  async function open(next:typeof action) {
    setBusy(true); setError(''); setConfirmation(''); setPreview(null); setAction(next);
    dialog.current?.showModal();
    try {
      const response=await fetch(path,{cache:'no-store'}); const body=await response.json();
      if(!response.ok) throw new Error(body.message ?? '影響を確認できませんでした');
      setPreview(body);
    } catch(e) { setError(e instanceof Error ? e.message : '通信に失敗しました'); }
    finally { setBusy(false); }
  }
  async function apply() {
    if(!preview || busy) return;
    setBusy(true); setError('');
    try {
      const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,confirmation,fingerprint:preview.fingerprint})});
      const result=await response.json(); if(!response.ok) throw new Error(result.message ?? '変更できませんでした');
      dialog.current?.close();
      if(action==='delete' && kind==='student') router.push('/admin/users');
      router.refresh();
    } catch(e) { setError(e instanceof Error ? e.message : '通信に失敗しました'); }
    finally { setBusy(false); }
  }
  const title=action==='delete' ? '完全削除' : action==='restore' ? '復元' : 'アーカイブ';
  // 一覧の行では操作をアイコンに寄せる。説明はツールチップと読み上げラベルに持たせる。
  const controls = archived
    ? <>
        <IconButton icon="unarchive" label="復元する" disabled={busy} onClick={()=>open('restore')} />
        <IconButton icon="delete" label="完全削除する" tone="danger" disabled={busy} onClick={()=>open('delete')} />
      </>
    : <IconButton icon="archive" label="アーカイブする" disabled={busy} onClick={()=>open('archive')} />;

  return <div className={compact ? 'inline-flex items-center gap-1' : 'mt-4 rounded-xl border border-slate-200 p-4'}>
    {compact ? controls : <div className="flex flex-wrap items-center gap-3"><span className="text-sm text-slate-600">{archived ? 'アーカイブ中' : '利用終了時の管理'}</span>{controls}</div>}
    <dialog ref={dialog} aria-labelledby={heading} onCancel={e=>{if(busy)e.preventDefault();}} onClick={event=>{ if(!busy && isBackdropClick(event)) dialog.current?.close(); }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border-0 bg-white p-6 text-left text-slate-900 shadow-2xl backdrop:bg-slate-950/40">
      <h2 id={heading} className="text-xl font-bold">{title}の確認</h2>
      {preview ? <><p className="mt-4 font-bold">{preview.name}</p><p className="mt-3 text-sm leading-7">{action==='delete' ? kind==='student' ? '生徒のアカウント・模試情報・個別の学習履歴を完全に削除します。元に戻せません。集合授業の共有記録と他の生徒のデータは残ります。' : 'このクラスの授業記録・課題・対話・評価・学習計画を完全に削除します。元に戻せません。在籍者のアカウントと別のクラスや個別指導の履歴は残ります。' : action==='archive' ? kind==='student' ? 'ログインと新しい学習を停止し、履歴は残します。後から復元できます。' : 'このクラスの新しい課題作成・配信・対話を停止し、履歴は残します。後から復元できます。' : '登録情報と履歴を使って利用を再開します。停止したAI作業は自動では再開しません。必要な授業記録を改めて渡してください。'}</p>
      {action!=='restore' ? <><p className="mt-4 text-sm font-bold">{action==='delete' ? '削除するデータ' : '保持する学習データ'}</p><dl className="mt-2 grid grid-cols-2 gap-2 text-sm">{Object.entries(labels).map(([key,label])=><div key={key} className="flex justify-between gap-2 rounded-lg bg-slate-50 p-2"><dt>{label}</dt><dd className="shrink-0 whitespace-nowrap">{preview.counts[key] ?? 0}件</dd></div>)}</dl></> : null}
      {action==='delete' ? <><p className="mt-3 text-xs leading-6 text-slate-600">操作監査と所属全体の利用費集計は残します。共有授業の文章中の記載は自動では書き換えません。</p>{preview.runningJobs>0 ? <p role="alert" className="mt-3 text-sm text-amber-800">AI作業が{preview.runningJobs}件処理中です。完了後に閉じて再確認してください。</p> : null}<label className="mt-4 block text-sm font-bold">確認のため「{preview.name}」を入力<input autoComplete="off" value={confirmation} onChange={e=>setConfirmation(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 p-3" /></label></> : null}</> : <p className="mt-4 text-sm">{busy ? '関連データを確認しています…' : '確認を完了できませんでした。一度閉じて再度お試しください。'}</p>}
      {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-6 flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={()=>dialog.current?.close()} className="rounded-lg border border-slate-300 px-4 py-2">キャンセル</button><button type="button" onClick={apply} disabled={busy || !preview || (action==='delete' && (confirmation!==preview.name || preview.runningJobs>0))} className={`rounded-lg px-4 py-2 font-bold text-white disabled:opacity-40 ${action==='delete' ? 'bg-rose-700' : 'bg-emerald-700'}`}>{busy ? '処理中…' : `${title}する`}</button></div>
    </dialog>
  </div>;
}
