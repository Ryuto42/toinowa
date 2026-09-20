'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DocumentReader } from '@/components/document-reader';
interface User { id: string; display_name: string; email: string | null; login_identifier: string | null; role: string; status: string }
interface Profile { grade: string | null; learning_goal: string; exam_results: string; weak_areas: string; daily_time_limit_min: number }
const field = 'mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm';
export function UserEditForm({ user, profile }: { user: User; profile: Profile | null }) {
  const router = useRouter();
  const [examResults, setExamResults] = useState(profile?.exam_results ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setMessage(''); setError('');
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        displayName: data.get('displayName'), status: data.get('status'),
        ...(user.role === 'student' ? { loginIdentifier: data.get('loginIdentifier') || null, profile: { grade: data.get('grade'), learningGoal: data.get('learningGoal'), examResults, weakAreas: data.get('weakAreas'), dailyTimeLimitMin: Number(data.get('minutes')) } } : {}),
      }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? '保存できませんでした');
      setMessage(user.role === 'student' ? '保存しました。更新した情報は、次にAIが学習計画や個別のお題を作る際に使われます。' : '保存しました。');
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : '通信に失敗しました'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save}>
    <fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
      <label className="text-sm font-bold">氏名<input name="displayName" required maxLength={120} defaultValue={user.display_name} className={field} /></label>
      <label className="text-sm font-bold">利用状態<select name="status" defaultValue={user.status} className={field}><option value="active">有効</option><option value="invited">招待中</option><option value="suspended">停止</option></select></label>
      {user.role === 'student' ? <>
        <label className="text-sm font-bold">ログインID<input name="loginIdentifier" required={!user.email} minLength={3} maxLength={40} defaultValue={user.login_identifier ?? ''} autoCapitalize="none" autoComplete="off" className={field} /><span className="mt-1 block text-xs font-normal text-slate-500">変更した場合は新しいIDを生徒へ伝えてください。</span></label>
        <label className="text-sm font-bold">学年<input name="grade" required maxLength={40} defaultValue={profile?.grade ?? ''} className={field} /></label>
        <label className="text-sm font-bold sm:col-span-2">利用目的・目標<textarea name="learningGoal" required maxLength={2000} rows={3} defaultValue={profile?.learning_goal ?? ''} className={field} /></label>
        <label className="text-sm font-bold">苦手に感じる範囲<textarea name="weakAreas" maxLength={4000} rows={4} defaultValue={profile?.weak_areas ?? ''} className={field} /></label>
        <label className="text-sm font-bold">1日の学習時間（分）<input name="minutes" type="number" required min={5} max={240} defaultValue={profile?.daily_time_limit_min ?? 30} className={field} /></label>
        <div className="sm:col-span-2"><DocumentReader purpose="exam" onRead={setExamResults} /><p className="mt-2 text-xs text-slate-500">読み取り結果は下の模試結果欄に入ります。内容を確認してから保存してください。</p></div>
        <label className="text-sm font-bold sm:col-span-2">模試結果<textarea rows={7} maxLength={20000} value={examResults} onChange={event => setExamResults(event.target.value)} className={field} /></label>
        <p className="text-sm leading-7 text-slate-600 sm:col-span-2">更新した模試結果・苦手範囲は今後のAI提案に反映されます。すでに配信した宿題は変更されません。</p>
      </> : <p className="text-sm text-slate-600 sm:col-span-2">ログイン用メールアドレス：{user.email}</p>}
      <div className="flex items-center gap-4 sm:col-span-2"><button disabled={busy} className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? '保存中…' : '変更を保存'}</button><Link href="/admin/users" className="text-sm text-slate-600 underline">ユーザー一覧へ戻る</Link></div>
    </fieldset>
    {error ? <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p> : null}
    {message ? <p role="status" className="mt-4 text-sm text-emerald-800">{message}</p> : null}
  </form>;
}
