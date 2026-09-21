'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * お題を自分で書いて課題を作る。
 *
 * 相手と期限は上の授業記録フォームで選んだものをそのまま使う。
 * ここで同じ項目をもう一度選ばせると、どちらが効いているのか分からなくなる。
 *
 * 作られるのは下書きで、「先生の確認待ち」に入る。授業記録から作った場合と
 * 同じ確認を通してから配信する。
 */
export function ManualTopicForm({ classroomId, studentId, dueAt, onDone }: {
  classroomId: string;
  studentId: string | null;
  dueAt: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function submit() {
    if (busy || !topic.trim()) return;
    setBusy(true); setStatus('作成しています…');
    try {
      const response = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'publish', publish: false, classroomId, content: '',
          // 課題名は自動。確認画面で編集できる。
          title: topic.trim().slice(0, 40), body: topic.trim(), difficulty: 2,
          ...(studentId ? { studentId } : {}),
          ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? '作成できませんでした');
      setTopic(''); setStatus('');
      router.refresh();
      onDone?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '通信に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  return <div>
    <label className="block text-sm font-bold text-slate-700">お題
      <textarea disabled={busy} rows={4} maxLength={4000} value={topic}
        onChange={(event) => setTopic(event.target.value)}
        placeholder="例：光合成と呼吸の関係を、図を使わずに言葉だけで説明してください。"
        className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm leading-6 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" />
    </label>
    <div className="mt-4 flex flex-wrap items-center gap-4">
      <button type="button" onClick={submit} disabled={busy || !topic.trim() || !classroomId}
        className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50">
        {busy ? '作成中…' : 'お題をもとに作成'}
      </button>
      {!classroomId ? <p className="text-xs text-slate-500">上で渡す相手を選んでください。</p> : null}
      {status ? <p role="status" className="text-sm">{status}</p> : null}
    </div>
  </div>;
}
