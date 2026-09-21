'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DocumentReader } from '@/components/document-reader';

export function PreparationForm({ classrooms, students }: { classrooms: Array<{ id: string; name: string }>; students: Array<{ id:string; name:string; classroomId:string }> }) {
  const router = useRouter();
  const [mode,setMode] = useState<'student'|'classroom'>(students.length ? 'student' : 'classroom');
  const [classroomId, setClassroomId] = useState(students.length === 1 ? students[0].classroomId : !students.length && classrooms.length === 1 ? classrooms[0].id : '');
  const [memo, setMemo] = useState('');
  const [material, setMaterial] = useState('');
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [status, setStatus] = useState('');
  const [requestId, setRequestId] = useState('');
  const [readerKey, setReaderKey] = useState(0);
  const field = 'mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm';
  function changed() { setRequestId(''); setStatus(''); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || reading) return;
    setBusy(true); setStatus('授業記録を受け付けています…');
    const id = requestId || crypto.randomUUID(); setRequestId(id);
    try {
      const content = [memo.trim(), material.trim()].filter(Boolean).join('\n\n【授業資料】\n');
      const response = await fetch('/api/lesson-preparations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, classroomId, content, title: title.trim() || content.split('\n')[0].slice(0, 80), dueAt: new Date(dueAt).toISOString() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? '受け付けられませんでした');
      setStatus('受け付けました。生徒別の課題と学習計画を準備しています。別の画面へ移動しても処理は続きます。');
      setMemo(''); setMaterial(''); setTitle(''); setRequestId(''); setReaderKey(value => value + 1);
      router.refresh();
    } catch(error) { setStatus(error instanceof Error ? error.message : '通信に失敗しました。同じ内容で再送できます。'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-5">
    <p className="text-sm leading-7 text-slate-600">授業の記録を一度渡すと、模試・過去の説明・フィードバックを参考に、選択した生徒の課題と学習計画を準備します。お題や難易度の設計はAIに任せられます。</p>
    <fieldset className="flex flex-wrap gap-4 text-sm" disabled={busy}><legend className="mb-2 font-bold">授業記録を渡す対象</legend>{([{value:'student',label:'生徒を選ぶ（個別指導）'},{value:'classroom',label:'クラスを選ぶ（一括）'}] as const).map(option=><label key={option.value} className="flex items-center gap-2"><input type="radio" name="targetMode" checked={mode===option.value} onChange={()=>{setMode(option.value);setClassroomId('');changed();}} />{option.label}</label>)}</fieldset>
    {mode==='student' && !students.length ? <p className="text-sm text-amber-800">個別指導の担当生徒がいません。管理者がユーザー編集で担当の先生を設定すると表示されます。</p> : null}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-bold">{mode==='student' ? '対象生徒' : '対象クラス'} <span className="text-xs text-rose-700">必須</span><select required disabled={busy} className={field} value={classroomId} onChange={event => { setClassroomId(event.target.value); changed(); }}><option value="">選択してください</option>{(mode==='student' ? students.map(s=>({id:s.classroomId,name:s.name})) : classrooms).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-sm font-bold">宿題の期限 <span className="text-xs text-rose-700">必須</span><input required type="datetime-local" disabled={busy} className={field} value={dueAt} onChange={event => { setDueAt(event.target.value); changed(); }} /></label>
    </div>
    <label className="block text-sm font-bold">授業メモ <span className="text-xs font-normal text-slate-500">資料だけでも大丈夫です</span><textarea disabled={busy} className={field} rows={4} maxLength={16000} value={memo} onChange={event => { setMemo(event.target.value); changed(); }} placeholder="例：今日は一次関数の傾きと切片を学習。式からグラフを描く練習をした。文章題はまだ扱っていない。" /></label>
    <fieldset className="min-w-0" disabled={busy}><DocumentReader key={readerKey} purpose="lesson" onBusyChange={setReading} onRead={text => { setMaterial(text); changed(); }} /></fieldset>
    {material ? <details className="rounded-xl bg-slate-50 p-4"><summary className="cursor-pointer text-sm font-bold">読み取った授業資料を確認・修正</summary><textarea aria-label="読み取った授業資料" value={material} maxLength={20000} onChange={event => { setMaterial(event.target.value); changed(); }} disabled={busy} rows={6} className={field} /></details> : null}
    <details><summary className="cursor-pointer text-sm text-slate-600">授業に名前を付ける（任意）</summary><input aria-label="授業の名前" disabled={busy} className={field} maxLength={200} value={title} onChange={event => { setTitle(event.target.value); changed(); }} placeholder="未入力なら授業記録の冒頭を使います" /></details>
    <button disabled={busy || reading || !classroomId || !dueAt || !(memo.trim() || material.trim()) || memo.length + material.length > 19980} className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-50">{reading ? '授業資料を読み取り中…' : busy ? '受付中…' : '授業記録を渡して、課題の準備を任せる'}</button>
    <p className="text-xs leading-6 text-slate-500">メモか資料のどちらかが必要です（合計約2万文字まで）。準備完了後に先生が承認するまで、生徒には配信されません。</p>
    {status ? <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm leading-7 text-emerald-900">{status}</p> : null}
  </form>;
}

export function PreparationRefresh({ active }: { active: boolean }) { return <Refresh active={active} />; }
import { useEffect } from 'react';
function Refresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => { if (!active) return; const timer = setInterval(() => { if(document.visibilityState === 'visible') router.refresh(); }, 5000); return () => clearInterval(timer); }, [active,router]);
  return active ? <p role="status" className="mt-3 text-xs text-slate-500">準備状況は自動で更新されます。</p> : null;
}

export function RetryPreparation({ id }: { id:string }) {
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState('');
  async function retry() {
    setBusy(true); setStatus('');
    try {
      const response=await fetch(`/api/lesson-preparations/${id}/retry`,{method:'POST'});
      const result=await response.json();
      if(!response.ok) throw new Error(result.message ?? '再試行できませんでした');
      setStatus(`${result.count}人分の再試行を受け付けました。`); router.refresh();
    } catch(error) { setStatus(error instanceof Error ? error.message : '通信に失敗しました'); }
    finally { setBusy(false); }
  }
  return <div className="mt-3"><button onClick={retry} disabled={busy} className="rounded-lg border border-amber-700 px-3 py-2 text-sm font-bold text-amber-900 disabled:opacity-50">{busy ? '受付中…' : '失敗した生徒分を再試行'}</button>{status ? <p role="status" className="mt-2 text-sm">{status}</p> : null}</div>;
}
