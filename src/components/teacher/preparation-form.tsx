'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DocumentReader } from '@/components/document-reader';
import { DateTimeField } from '@/components/date-time-field';

export function PreparationForm({ classrooms, students, onDone, onContextChange }: { classrooms: Array<{ id: string; name: string }>; students: Array<{ id:string; name:string; classroomId:string }>; onDone?: () => void; onContextChange?: (context: { classroomId: string; studentId: string | null; dueAt: string }) => void }) {
  const router = useRouter();
  const [mode,setMode] = useState<'student'|'classroom'>(students.length ? 'student' : 'classroom');
  const [classroomId, setClassroomId] = useState(students.length === 1 ? students[0].classroomId : !students.length && classrooms.length === 1 ? classrooms[0].id : '');
  const [memo, setMemo] = useState('');
  const [material, setMaterial] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [status, setStatus] = useState('');
  const [requestId, setRequestId] = useState('');
  const [readerKey, setReaderKey] = useState(0);
  const field = 'mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100';
  const label = 'block text-sm font-bold text-slate-700';
  function changed() { setRequestId(''); setStatus(''); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || reading) return;
    setBusy(true); setStatus('授業記録を受け付けています…');
    const id = requestId || crypto.randomUUID(); setRequestId(id);
    try {
      const content = [memo.trim(), material.trim()].filter(Boolean).join('\n\n【授業資料】\n');
      const response = await fetch('/api/lesson-preparations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, classroomId, content, title: content.split('\n')[0].slice(0, 80), dueAt: new Date(dueAt).toISOString() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? '受け付けられませんでした');
      setStatus('受け付けました。準備の進み具合は画面で確認できます。');
      setMemo(''); setMaterial(''); setRequestId(''); setReaderKey(value => value + 1);
      router.refresh();
      onDone?.();
    } catch(error) { setStatus(error instanceof Error ? error.message : '通信に失敗しました。同じ内容で再送できます。'); }
    finally { setBusy(false); }
  }
  // 下の「手動で設定する」も同じ相手・期限に出すので、選択内容を親へ渡す。
  const studentId = mode === 'student' ? students.find(s => s.classroomId === classroomId)?.id ?? null : null;
  useEffect(() => { onContextChange?.({ classroomId, studentId, dueAt }); }, [classroomId, studentId, dueAt, onContextChange]);

  const ready = !busy && !reading && !!classroomId && !!dueAt && !!(memo.trim() || material.trim()) && memo.length + material.length <= 19980;

  return <form onSubmit={submit} className="space-y-6">
    <fieldset disabled={busy}>
      <legend className={label}>渡す相手</legend>
      {/* 生徒とクラスは配信のされ方が変わる。どちらを選んでいるか一目で分かる形にする。 */}
      <div className="mt-2 inline-flex rounded-xl border border-slate-300 p-1">
        {([{value:'student',label:'生徒ごと'},{value:'classroom',label:'クラス一括'}] as const).map(option =>
          <label key={option.value} className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-bold transition ${mode===option.value ? 'bg-emerald-700 text-white' : 'text-slate-600'}`}>
            <input type="radio" name="targetMode" className="sr-only" checked={mode===option.value}
              onChange={()=>{setMode(option.value);setClassroomId('');changed();}} />
            {option.label}
          </label>)}
      </div>
    </fieldset>

    {mode==='student' && !students.length
      ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">担当の生徒がいません。管理者に担当の設定を依頼してください。</p>
      : null}

    <div className="grid gap-4 sm:grid-cols-2">
      <label className={label}>{mode==='student' ? '生徒' : 'クラス'}<span className="ml-1 text-xs text-rose-700">必須</span>
        <select required disabled={busy} className={field} value={classroomId} onChange={event => { setClassroomId(event.target.value); changed(); }}>
          <option value="">選択してください</option>
          {(mode==='student' ? students.map(s=>({id:s.classroomId,name:s.name})) : classrooms).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <div className={label}>期限<span className="ml-1 text-xs text-rose-700">必須</span>
        <DateTimeField required disabled={busy} value={dueAt} onChange={next => { setDueAt(next); changed(); }} />
      </div>
    </div>

    <label className={label}>授業メモ<span className="ml-2 text-xs font-normal text-slate-500">資料だけでも可</span>
      <textarea disabled={busy} className={field} rows={5} maxLength={16000} value={memo}
        onChange={event => { setMemo(event.target.value); changed(); }}
        placeholder="例：一次関数の傾きと切片。式からグラフを描く練習まで。文章題は未実施。" />
    </label>

    <fieldset className="min-w-0" disabled={busy}>
      <DocumentReader key={readerKey} purpose="lesson" onBusyChange={setReading} onRead={text => { setMaterial(text); changed(); }} />
    </fieldset>

    {material ? <details className="rounded-xl bg-slate-50 p-4">
      <summary className="cursor-pointer text-sm font-bold">読み取った資料を確認・修正</summary>
      <textarea aria-label="読み取った授業資料" value={material} maxLength={20000}
        onChange={event => { setMaterial(event.target.value); changed(); }} disabled={busy} rows={6} className={field} />
    </details> : null}

    <div className="flex flex-wrap items-center gap-4 border-t border-slate-200 pt-5">
      <button disabled={!ready} className="rounded-xl bg-emerald-700 px-6 py-3 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50">
        {reading ? '資料を読み取り中…' : busy ? '受付中…' : 'AIに準備を任せる'}
      </button>
      <p className="text-xs leading-6 text-slate-500">配信前に先生が確認します。合計2万文字まで。</p>
    </div>
    {status ? <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm leading-7 text-emerald-900">{status}</p> : null}
  </form>;
}

export function PreparationRefresh({ active }: { active: boolean }) { return <Refresh active={active} />; }
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
