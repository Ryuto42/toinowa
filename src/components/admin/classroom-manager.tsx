'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { StatusPill } from '@/components/dashboard';

export interface ClassroomRow {
  id: string;
  name: string;
  subject: string;
  grade: string | null;
  teacherIds: string[];
  studentIds: string[];
}
export interface MemberOption { id: string; name: string; role: 'teacher' | 'student' | 'admin' }

const field = 'mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100';

function useDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const previousOverflow = useRef<string | null>(null);
  const restore = () => {
    if (previousOverflow.current !== null) {
      document.body.style.overflow = previousOverflow.current;
      previousOverflow.current = null;
    }
  };
  useEffect(() => () => restore(), []);
  return {
    ref,
    restore,
    open() {
      if (ref.current?.open) return;
      previousOverflow.current = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      ref.current?.showModal();
    },
    close() { ref.current?.close(); },
  };
}

const dialogClass = 'm-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto overscroll-contain rounded-2xl border-0 bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-950/40 sm:p-7';

export function ClassroomManager({ classrooms, members }: { classrooms: ClassroomRow[]; members: MemberOption[] }) {
  const router = useRouter();
  const teachers = members.filter((m) => m.role === 'teacher' || m.role === 'admin');
  const students = members.filter((m) => m.role === 'student');
  const nameById = new Map(members.map((m) => [m.id, m.name]));

  return <div className="space-y-6">
    <div className="flex justify-end"><CreateClassroom onDone={() => router.refresh()} /></div>
    {classrooms.length ? <div className="space-y-3">{classrooms.map((classroom) => (
      <ClassroomCard
        key={classroom.id}
        classroom={classroom}
        teachers={teachers}
        students={students}
        nameById={nameById}
        onDone={() => router.refresh()}
      />
    ))}</div> : (
      <p className="rounded-2xl border border-dashed border-[#b9dcd5] bg-[#fbfdfd] p-8 text-center text-sm text-[#8ca0bb]">
        クラスがまだありません。「クラスを追加」から作成してください。
      </p>
    )}
  </div>;
}

function CreateClassroom({ onDone }: { onDone: () => void }) {
  const { ref: dialogRef, open: openDialog, close: closeDialog, restore: restoreDialog } = useDialog();
  const headingId = useId();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');

  async function submit() {
    if (busy) return;
    setBusy(true); setStatus('作成しています…');
    try {
      const response = await fetch('/api/admin/classrooms', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, subject, grade }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? '作成できませんでした');
      setName(''); setSubject(''); setGrade(''); setStatus('');
      closeDialog();
      onDone();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '通信に失敗しました');
    } finally { setBusy(false); }
  }

  return <>
    <button type="button" onClick={openDialog} aria-haspopup="dialog"
      className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800">
      クラスを追加
    </button>
    <dialog ref={dialogRef} aria-labelledby={headingId} onClose={restoreDialog} className={dialogClass}>
      <div className="flex items-start justify-between gap-4">
        <h2 id={headingId} className="text-xl font-bold">クラスを追加</h2>
        <button type="button" onClick={closeDialog} disabled={busy}
          className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-40">閉じる</button>
      </div>
      <div className="mt-6 space-y-4">
        <label className="block text-sm font-bold">クラス名
          <input className={field} maxLength={80} value={name} disabled={busy}
            onChange={(e) => setName(e.target.value)} placeholder="例：数学1-A" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold">科目
            <input className={field} maxLength={40} value={subject} disabled={busy}
              onChange={(e) => setSubject(e.target.value)} placeholder="例：数学" />
          </label>
          <label className="text-sm font-bold">学年
            <input className={field} maxLength={40} value={grade} disabled={busy}
              onChange={(e) => setGrade(e.target.value)} placeholder="例：中学1年" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={submit} disabled={busy || !name.trim() || !subject.trim()}
            className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-50">作成する</button>
          {status ? <span role="status" className="text-sm">{status}</span> : null}
        </div>
      </div>
    </dialog>
  </>;
}

function ClassroomCard({ classroom, teachers, students, nameById, onDone }: {
  classroom: ClassroomRow;
  teachers: MemberOption[];
  students: MemberOption[];
  nameById: Map<string, string>;
  onDone: () => void;
}) {
  const { ref: dialogRef, open: openDialog, close: closeDialog, restore: restoreDialog } = useDialog();
  const headingId = useId();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [teacherIds, setTeacherIds] = useState<string[]>(classroom.teacherIds);
  const [studentIds, setStudentIds] = useState<string[]>(classroom.studentIds);

  function openEditor() {
    setTeacherIds(classroom.teacherIds);
    setStudentIds(classroom.studentIds);
    setStatus('');
    openDialog();
  }

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function save() {
    if (busy) return;
    setBusy(true); setStatus('保存しています…');
    try {
      const response = await fetch(`/api/admin/classrooms/${classroom.id}/members`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ teacherIds, studentIds }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? '保存できませんでした');
      closeDialog();
      onDone();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '通信に失敗しました');
    } finally { setBusy(false); }
  }

  const teacherNames = classroom.teacherIds.map((id) => nameById.get(id) ?? '（不明）');

  return <article className="rounded-xl border border-slate-200 p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold">{classroom.name}</p>
          <StatusPill tone="blue">{classroom.subject}</StatusPill>
          {classroom.grade ? <span className="text-xs text-slate-500">{classroom.grade}</span> : null}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          担当: {teacherNames.length ? teacherNames.join('、') : <span className="font-bold text-rose-600">未設定</span>}
          {' · '}生徒 {classroom.studentIds.length}人
        </p>
        {!teacherNames.length ? <p className="mt-1 text-xs text-rose-600">
          担当の先生がいないと、このクラスのお題を作れません。
        </p> : null}
      </div>
      <button type="button" onClick={openEditor} aria-haspopup="dialog"
        className="shrink-0 rounded-xl border border-emerald-700 px-4 py-2 text-sm font-bold text-emerald-800 transition hover:bg-emerald-50">
        担当・在籍を編集
      </button>
    </div>

    <dialog ref={dialogRef} aria-labelledby={headingId} onClose={restoreDialog}
      onCancel={(e) => { if (busy) e.preventDefault(); }} className={dialogClass}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={headingId} className="text-xl font-bold">{classroom.name} の担当・在籍</h2>
          <p className="mt-1 text-sm text-slate-500">チェックを外した人は在籍が無効になります（履歴は残ります）。</p>
        </div>
        <button type="button" onClick={closeDialog} disabled={busy}
          className="shrink-0 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-40">閉じる</button>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <MemberPicker label="担当の先生" options={teachers} selected={teacherIds}
          onToggle={(id) => toggle(teacherIds, setTeacherIds, id)} busy={busy}
          empty="先生が登録されていません。先にユーザー管理から追加してください。" />
        <MemberPicker label="在籍する生徒" options={students} selected={studentIds}
          onToggle={(id) => toggle(studentIds, setStudentIds, id)} busy={busy}
          empty="生徒が登録されていません。" />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={busy}
          className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-50">変更を保存</button>
        {status ? <span role="status" className="text-sm">{status}</span> : null}
      </div>
    </dialog>
  </article>;
}

function MemberPicker({ label, options, selected, onToggle, busy, empty }: {
  label: string;
  options: MemberOption[];
  selected: string[];
  onToggle: (id: string) => void;
  busy: boolean;
  empty: string;
}) {
  return <fieldset>
    <legend className="text-sm font-bold">{label}（{selected.length}人）</legend>
    {options.length ? <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
      {options.map((option) => <label key={option.id}
        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
        <input type="checkbox" disabled={busy} checked={selected.includes(option.id)}
          onChange={() => onToggle(option.id)} />
        <span>{option.name}</span>
        {option.role === 'admin' ? <span className="text-xs text-slate-400">管理者</span> : null}
      </label>)}
    </div> : <p className="mt-2 text-sm text-slate-500">{empty}</p>}
  </fieldset>;
}
