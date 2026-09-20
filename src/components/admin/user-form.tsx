'use client';

import { useRouter } from 'next/navigation';
import { DocumentReader } from '@/components/document-reader';
import { FormEvent, useState } from 'react';

const fieldClass = 'mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100';

export function UserForm({ classrooms }: { classrooms: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [credentials, setCredentials] = useState<{ organizationCode: string; loginIdentifier: string; initialPassword: string } | null>(null);
  const [role, setRole] = useState('student');
  const [examResults, setExamResults] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const element = event.currentTarget;
    setBusy(true);
    setStatus('登録中…');
    const form = new FormData(element);
    try {
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName: form.get('displayName'),
        email: role === 'student' ? undefined : form.get('email'),
        password: role === 'student' ? undefined : form.get('password'),
        role: form.get('role'),
        loginIdentifier: form.get('loginIdentifier') || undefined,
        ...(role === 'student' ? { intake: { grade: form.get('grade'), learningGoal: form.get('learningGoal'), weakAreas: form.get('weakAreas'), examResults, dailyTimeLimitMin: Number(form.get('minutes')), classroomId: form.get('classroomId') } } : {}),
      }),
    });
    if (response.ok) {
      const result = await response.json();
      setCredentials(result.credentials ?? null);
      element.reset(); setExamResults('');
      setStatus('登録しました。');
      router.refresh();
    } else {
      const result = await response.json().catch(() => ({}));
      setStatus(result.message ?? '登録できませんでした。');
    }
    } catch { setStatus('通信に失敗しました。もう一度お試しください。'); } finally { setBusy(false); }
  }

  return <details className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
    <summary className="cursor-pointer font-bold text-emerald-900">ユーザーを追加する</summary>
    {credentials ? <div role="status" className="mt-5 rounded-xl border border-emerald-300 bg-white p-5"><p className="font-bold">生徒のログイン情報</p><p className="mt-2 text-sm">生徒へ渡す情報を控えてください。初期パスワードはこの画面を離れると再表示できません。</p><dl className="mt-3 space-y-2 text-sm"><div><dt className="font-bold">所属コード</dt><dd className="select-all font-mono">{credentials.organizationCode}</dd></div><div><dt className="font-bold">ログインID</dt><dd className="select-all font-mono">{credentials.loginIdentifier}</dd></div><div><dt className="font-bold">初期パスワード</dt><dd className="select-all break-all font-mono">{credentials.initialPassword}</dd></div></dl><p className="mt-3 text-sm text-slate-600">初回ログイン後、生徒本人にパスワードの変更を求めます。</p><button type="button" onClick={() => setCredentials(null)} className="mt-3 text-sm font-bold text-emerald-700 underline">控えたので閉じる</button></div> : null}
    <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-bold">氏名<input name="displayName" required className={fieldClass} placeholder="山田 花子" /></label>
      <label className="text-sm font-bold">ロール<select name="role" value={role} onChange={event => setRole(event.target.value)} className={fieldClass}><option value="student">生徒</option><option value="teacher">先生</option><option value="admin">管理者</option></select></label>
      {role === 'student' ? <>
        <label className="text-sm font-bold">ログインID<input name="loginIdentifier" required minLength={3} maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,39}" className={fieldClass} placeholder="student02" autoCapitalize="none" autoComplete="off" /><span className="mt-1 block text-xs font-normal text-slate-500">3〜40文字の半角英数字・ピリオド・ハイフン・アンダースコア</span></label>
        <p className="self-center text-sm leading-6 text-slate-600">メールアドレスは不要です。初期パスワードは自動生成し、登録後に表示します。</p>
      </> : <>
        <label className="text-sm font-bold">メールアドレス<input name="email" required type="email" className={fieldClass} placeholder="user@example.com" autoComplete="email" /></label>
        <label className="text-sm font-bold">初期パスワード<input name="password" required minLength={8} type="password" className={fieldClass} autoComplete="new-password" /></label>
      </>}
      {role === 'student' ? <>
        <label className="text-sm font-bold">学年<input name="grade" required maxLength={40} placeholder="例：高校2年生" className={fieldClass} /></label>
        <label className="text-sm font-bold">担当クラス<select name="classroomId" required className={fieldClass}><option value="">クラスを選択</option>{classrooms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-sm font-bold sm:col-span-2">利用目的・目標<textarea name="learningGoal" required maxLength={2000} placeholder="例：大学受験に向け、数学の基礎を固めたい" className="mt-2 min-h-20 w-full rounded-xl border p-3 text-sm" /></label>
        <label className="text-sm font-bold">苦手に感じる範囲<textarea name="weakAreas" maxLength={4000} placeholder="例：二次関数のグラフ、場合分け" className="mt-2 min-h-24 w-full rounded-xl border p-3 text-sm" /></label>
        <label className="text-sm font-bold">1日の学習時間（分）<input name="minutes" type="number" required defaultValue={30} min={5} max={240} className={fieldClass} /></label>
        <div className="sm:col-span-2"><DocumentReader purpose="exam" onRead={setExamResults} /></div>
        <label className="text-sm font-bold sm:col-span-2">模試結果（読み取り内容の確認・手入力）<textarea value={examResults} onChange={event => setExamResults(event.target.value)} maxLength={20000} placeholder="科目・点数/満点・偏差値・単元別結果など。結果がなければ空欄で構いません。" className="mt-2 min-h-32 w-full rounded-xl border p-3 text-sm" /></label>
        <p className="text-sm text-emerald-900 sm:col-span-2">登録後、入力内容をもとにAIが学習計画と最初のお題を提案します。</p>
      </> : null}
      <div className="flex items-center gap-3 sm:col-span-2"><button disabled={busy || credentials !== null} className="disabled:opacity-50 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800">登録する</button><span role="status" className="text-sm text-slate-600">{status}</span></div>
    </form>
  </details>;
}
