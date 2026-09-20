'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Lesson = { id: string; title: string };
type Classroom = { id: string; name: string; subject: string };
type Question = { id: string; lessonId: string; body: string; difficulty: number; conceptName: string };

export function AssignmentForm({ lessons, classrooms, questions }: { lessons: Lesson[]; classrooms: Classroom[]; questions: Question[] }) {
  const router = useRouter();
  const [lessonId, setLessonId] = useState(lessons[0]?.id ?? '');
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id ?? '');
  const [selected, setSelected] = useState<string[]>(questions.filter((q) => q.lessonId === lessons[0]?.id).slice(0, 1).map((q) => q.id));
  const [dueAt, setDueAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const lessonQuestions = useMemo(() => questions.filter((question) => question.lessonId === lessonId), [questions, lessonId]);

  function changeLesson(value: string) {
    setLessonId(value);
    setSelected(questions.filter((q) => q.lessonId === value).slice(0, 1).map((q) => q.id));
  }

  function toggleQuestion(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lessonId || !classroomId || selected.length === 0) return;
    setBusy(true);
    setMessage('');
    const response = await fetch('/api/assignments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lessonId,
        classroomId,
        questionIds: selected,
        dueAt: dueAt ? new Date(`${dueAt}T23:59:59`).toISOString() : undefined,
      }),
    });
    setBusy(false);
    if (!response.ok) {
      setMessage('説明ワークを登録できませんでした。入力内容を確認してください。');
      return;
    }
    setMessage('説明ワークを登録し、生徒へ公開しました。');
    router.refresh();
  }

  return <form onSubmit={submit} className="grid gap-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-bold">授業・学習テーマ
        <select value={lessonId} onChange={(event) => changeLesson(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5">
          {lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
        </select>
      </label>
      <label className="text-sm font-bold">対象クラス
        <select value={classroomId} onChange={(event) => setClassroomId(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5">
          {classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.subject} · {classroom.name}</option>)}
        </select>
      </label>
    </div>
    <label className="text-sm font-bold">期限（任意）
      <input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 sm:max-w-xs" />
    </label>
    <fieldset>
      <legend className="text-sm font-bold">説明する概念</legend>
      <div className="mt-2 space-y-2">
        {lessonQuestions.length ? lessonQuestions.map((question) => <label key={question.id} className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-3 text-sm hover:border-emerald-400">
          <input type="checkbox" checked={selected.includes(question.id)} onChange={() => toggleQuestion(question.id)} className="mt-1" />
          <span><span className="font-semibold">{question.conceptName}</span><span className="mt-1 block text-slate-600">説明の観点：{question.body}</span></span>
        </label>) : <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">この授業には説明する概念がありません。</p>}
      </div>
    </fieldset>
    {message ? <p role="status" className="text-sm text-emerald-700">{message}</p> : null}
    <button disabled={busy || selected.length === 0} className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white disabled:opacity-50 sm:w-fit">{busy ? '登録中…' : '説明ワークを公開する'}</button>
  </form>;
}
