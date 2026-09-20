'use client';
import { useState } from 'react';
import { DocumentReader } from '@/components/document-reader';

type TopicFormProps = { classrooms: Array<{ id: string; name: string }>; students: Array<{ id: string; name: string; classroomId: string }> };
type Mode = 'auto' | 'manual';

export function TopicForm(props: TopicFormProps) {
  const [mode, setMode] = useState<Mode>('auto');
  return <div>
    <div className="mb-6 grid gap-3 sm:grid-cols-2" role="group" aria-label="お題の作成モード">
      {([{ value: 'auto', title: '授業記録・資料からAIが作る', description: '授業メモやPDF・画像をもとに、お題と難易度を自動で提案します。' }, { value: 'manual', title: '先生がお題を作る', description: '先生がテーマ・お題・難易度を入力して作成します。' }] as const).map(item => <button key={item.value} type="button" aria-pressed={mode === item.value} onClick={() => setMode(item.value)} className={`rounded-xl border-2 p-4 text-left ${mode === item.value ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white'}`}><span className="block font-bold">{item.title}</span><span className="mt-2 block text-sm leading-6 text-slate-600">{item.description}</span></button>)}
    </div>
    <div hidden={mode !== 'auto'}><TopicEditor {...props} mode="auto" /></div>
    <div hidden={mode !== 'manual'}><TopicEditor {...props} mode="manual" /></div>
  </div>;
}

function TopicEditor({ classrooms, students, mode }: TopicFormProps & { mode: Mode }) {
  const [dueAt, setDueAt] = useState('');
  const [studentId, setStudentId] = useState('');
  const [classroomId, setClassroomId] = useState('');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [difficulty, setDifficulty] = useState(2);
  const [rationale, setRationale] = useState('');
  const [historyNote, setHistoryNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  async function submit(action: 'propose' | 'publish') {
    if (busy) return;
    setBusy(true); setStatus(action === 'propose' ? '授業記録・資料からお題を作っています…' : '公開しています…');
    try {
      const response = await fetch('/api/topics', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, classroomId, content, title, body, difficulty, ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}), ...(studentId ? { studentId } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? '処理できませんでした');
      if (action === 'propose') {
        setTitle(result.proposal.title); setBody(result.proposal.body); setDifficulty(result.proposal.difficulty); setRationale(result.proposal.rationale);
        setHistoryNote(studentId ? `参考にした履歴：完了済みの対話 ${result.history?.conversationsUsed ?? 0}件・フィードバック ${result.history?.feedbackUsed ?? 0}件` : 'クラス全員向けに、授業記録・資料から作成しました。');
        setStatus('お題を提案しました。内容・難易度を確認し、必要に応じて修正して公開してください。');
      } else { window.location.reload(); }
    } catch (error) { setStatus(error instanceof Error ? error.message : '通信に失敗しました'); }
    finally { setBusy(false); }
  }
  const field = 'mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm';
  return <div className="space-y-4">
    <label className="block text-sm font-bold">配信する担当クラス<select disabled={busy} className={field} value={classroomId} onChange={event => { setClassroomId(event.target.value); setStudentId(''); setTitle(''); setBody(''); setRationale(''); }}><option value="">選択してください</option>{classrooms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">対象の生徒<select value={studentId} disabled={busy} onChange={event => { setStudentId(event.target.value); if (mode === 'auto') { setTitle(''); setBody(''); setRationale(''); setHistoryNote(''); } }} className={field}><option value="">クラス全員</option>{students.filter(student => student.classroomId === classroomId).map(student => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label><label className="text-sm font-bold">宿題の期限<input type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} className={field} /></label></div>
    {mode === 'auto' ? <p className="text-sm leading-6 text-slate-600">{studentId ? '授業記録・資料をもとに、この生徒の過去の対話・フィードバックを参考にして難易度や問い方を調整します。履歴がない場合は登録情報と授業内容を使います。' : '個別の生徒を選ぶと、その生徒の過去の対話・フィードバックも参考にします。クラス全員の場合は授業内容をもとに作成します。'}</p> : null}
    {mode === 'auto' ? <DocumentReader purpose="lesson" onRead={setContent} /> : null}
    <label className="block text-sm font-bold">{mode === 'auto' ? '授業記録・資料の内容' : '授業で学んだ内容・評価の参考（任意）'}<textarea className={field} rows={5} maxLength={20000} value={content} onChange={event => setContent(event.target.value)} placeholder="授業で扱った内容、生徒のつまずき、できるようになったことなどを入力してください。PDF・画像の読み取り結果も確認・編集できます。" /></label>
    {mode === 'auto' ? <button type="button" disabled={busy || !content.trim() || !classroomId} onClick={() => submit('propose')} className="rounded-xl border border-emerald-700 px-4 py-2 text-sm font-bold text-emerald-800 disabled:opacity-50">AIでお題を作成</button> : null}
    {mode === 'manual' || rationale ? <>
    {mode === 'auto' ? <p className="text-sm font-bold text-emerald-800">AIが作成したお題を確認・編集</p> : null}
    <label className="block text-sm font-bold">テーマ<input className={field} maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder="例：光合成と呼吸の関係" /></label>
    <label className="block text-sm font-bold">生徒へ出すお題<textarea className={field} rows={3} maxLength={4000} value={body} onChange={event => setBody(event.target.value)} placeholder="例：光合成と呼吸の違いを、何も知らない私に教えてください。" /></label>
    <label className="block text-sm font-bold">難易度<select className={field} value={difficulty} onChange={event => setDifficulty(Number(event.target.value))}>{['用語と基本', '基本の説明', '概念の組み合わせ', '条件変更・応用', '初見の場面へ応用'].map((label, index) => <option key={label} value={index + 1}>Lv.{index + 1} {label}</option>)}</select></label>
    {historyNote ? <p className="text-xs text-slate-500">{historyNote}</p> : null}
    {rationale ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">AIの提案理由：{rationale}</p> : null}
    <button type="button" disabled={busy || !classroomId || !title.trim() || !body.trim() || !dueAt} onClick={() => submit('publish')} className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-50">確認して宿題を配信</button>
    </> : <p className="text-sm text-slate-500">記録や資料を入力して「AIでお題を作成」を押してください。配信前に内容を確認・編集できます。</p>}
    {status ? <p role="status" className="text-sm leading-7">{status}</p> : null}
  </div>;
}
