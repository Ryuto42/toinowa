'use client';

import { TeacherPicker, type TeacherOption } from './teacher-assignment';
import { useRouter } from 'next/navigation';
import { IntakeFields, useIntake, emptyIntake, RequiredMark } from './intake-fields';
import { CredentialsReceipt, type Credentials } from './credentials-receipt';
import { FormEvent, useEffect, useId, useRef, useState } from 'react';

const fieldClass = 'mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100';

export function UserForm({ classrooms, teachers }: { classrooms: Array<{ id: string; name: string }>; teachers: TeacherOption[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousOverflow = useRef<string | null>(null);
  const headingId = useId();
  function restoreScroll() {
    if (previousOverflow.current !== null) {
      document.body.style.overflow = previousOverflow.current;
      previousOverflow.current = null;
    }
  }
  useEffect(() => () => restoreScroll(), []);
  function open() {
    if (dialogRef.current?.open) return;
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.showModal();
  }
  function close() {
    dialogRef.current?.close();
    setCredentials(null);
    setStatus('');
  }
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [role, setRole] = useState('student');
  const [classroomId, setClassroomId] = useState('');
  const profile = useIntake();
  const [readerKey, setReaderKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const element = event.currentTarget;
    setBusy(true);
    setStatus('登録中…');
    const form = new FormData(element);
    // クラスなしの個別指導は、担当を決めないと誰の一覧にも出ない。
    // 先生がまだ1人も登録されていない学校では選びようがないので、その場合は通す。
    if (role === 'student' && !classroomId && teachers.length > 0 && form.getAll('teacherIds').length === 0) {
      setBusy(false);
      setStatus('担当する先生を選んでください。');
      return;
    }
    try {
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName: form.get('displayName'),
        email: role === 'student' ? undefined : form.get('email'),
        role: form.get('role'),
        ...(role === 'student' ? { teacherIds: form.getAll('teacherIds'), examAnalysisId: profile.getAnalysisId(), intake: { ...profile.intake, grade: form.get('grade'), classroomId: form.get('classroomId') || undefined } } : {}),
      }),
    });
    if (response.ok) {
      const result = await response.json();
      setCredentials(result.credentials ?? null);
      element.reset(); setClassroomId(''); profile.startAnalysis(undefined); profile.setIntake(emptyIntake); setReaderKey(current => current + 1);
      setStatus('登録しました。');
      if (dialogRef.current) dialogRef.current.scrollTop = 0;
      router.refresh();
    } else {
      const result = await response.json().catch(() => ({}));
      setStatus(result.message ?? '登録できませんでした。');
    }
    } catch { setStatus('通信に失敗しました。もう一度お試しください。'); } finally { setBusy(false); }
  }

  return <div className="mb-6">
    <button type="button" onClick={open} aria-haspopup="dialog" className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800">ユーザーを追加する</button>
    <dialog ref={dialogRef} aria-labelledby={headingId} onClose={restoreScroll} onCancel={event => { if (busy || credentials) event.preventDefault(); }} onClick={event => {
      if (event.target !== event.currentTarget || busy || credentials) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto overscroll-contain rounded-2xl border-0 bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/40 sm:p-7">
    <div className="flex items-center justify-between gap-4"><h2 id={headingId} className="text-xl font-bold">{credentials ? '登録が完了しました' : 'ユーザーを追加'}</h2><button type="button" aria-label="ユーザー追加を閉じる" disabled={busy || credentials !== null} onClick={close} className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-40">閉じる</button></div>
    {credentials ? <CredentialsReceipt credentials={credentials} onClose={close} /> : null}
    <form onSubmit={submit} className={credentials ? 'hidden' : 'mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2'}>
      <label className="text-sm font-bold">氏名<RequiredMark /><input name="displayName" required className={fieldClass} placeholder="山田 花子" /></label>
      <label className="text-sm font-bold">ロール<RequiredMark /><select name="role" value={role} onChange={event => setRole(event.target.value)} className={fieldClass}><option value="student">生徒</option><option value="teacher">先生</option><option value="admin">管理者</option></select></label>
      {role === 'student' ? <>
        <p className="rounded-xl bg-emerald-50 p-4 text-sm leading-7 text-emerald-950 sm:col-span-2">ログインIDは student1、student2… の連番で自動発行します。メールアドレスの入力も不要です。登録後にログインIDと初期パスワードをまとめてコピーできます。</p>
      </> : <>
        <label className="text-sm font-bold">メールアドレス<RequiredMark /><input name="email" required type="email" className={fieldClass} placeholder="user@example.com" autoComplete="email" /></label>
        <p className="self-center text-sm text-slate-600">初期パスワードは自動発行します。登録後にコピーできます。</p>
      </>}
      {role === 'student' ? <>
        <label className="text-sm font-bold">学年<RequiredMark /><input name="grade" required maxLength={40} placeholder="例：高校2年生" className={fieldClass} /></label>
        <label className="text-sm font-bold">クラス（任意）<select name="classroomId" value={classroomId} onChange={event => setClassroomId(event.target.value)} className={fieldClass}><option value="">クラスなし（個別指導）</option>{classrooms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {/* クラスに入れないと誰の担当にもならず、先生側の一覧に出てこない。
            個別指導クラスを作るこの場で、担当の先生を決めてもらう。 */}
        {classroomId ? null : <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:col-span-2">
          <p className="text-sm font-bold text-emerald-950">この生徒だけの「個別指導」クラスを作成します</p>
          <p className="mt-1 text-sm leading-6 text-emerald-900">担当する先生を選んでください。選ばないと、どの先生の生徒一覧にも表示されません。</p>
          <div className="mt-3"><TeacherPicker teachers={teachers}
            legend="担当の先生（複数選択可）"
            hint="選んだ先生が、この生徒の学習記録と分析を見られるようになります。あとからユーザー編集で変更できます。" /></div>
        </div>}
        <IntakeFields key={readerKey} state={profile} />
        <p className="text-sm text-emerald-900 sm:col-span-2">分析を待たずに登録できます。完了後は生徒情報と学習計画に反映します。</p>
      </> : null}
      <div className="flex items-center gap-3 sm:col-span-2"><button disabled={busy || credentials !== null} className="disabled:opacity-50 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800">登録する</button><span role="status" className="text-sm text-slate-600">{status}</span></div>
    </form>
    </dialog>
  </div>;
}
