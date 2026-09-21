'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
type Analysis = { id: string; status: string; error_message: string | null; users: { display_name: string } | null };
const labels: Record<string, string> = { uploading: 'アップロード中', queued: '解析待ち', processing: '解析中・再試行待ち', review_required: '確認が必要', completed: '解析完了', failed: '解析失敗' };
export function ExamAnalysisList() {
  const [items, setItems] = useState<Analysis[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch('/api/admin/exam-analyses');
        if (!response.ok) throw new Error('模試の分析状況を取得できませんでした');
        const data = await response.json();
        if (active) { setItems(data.analyses); setError(''); }
      } catch { if (active) setError('模試の分析状況を取得できませんでした'); }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 5000);
    const started = () => void refresh(); window.addEventListener('exam-analysis-started', started);
    return () => { active = false; clearInterval(timer); window.removeEventListener('exam-analysis-started', started); };
  }, []);
  if (!items.length && !error) return null;
  return <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-bold">模試の分析状況</h2>
    {error ? <p role="status" className="mt-2 text-sm text-amber-800">{error}</p> : null}
    <ul className="divide-y divide-slate-100">{items.map(item => <li key={item.id} className="py-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><span>{item.users?.display_name ?? '登録前の資料'} · {labels[item.status] ?? item.status}</span>
        {item.status === 'review_required' ? <Link href={`/admin/exam-analyses/${item.id}`} className="font-bold text-emerald-800 underline">確認・修正する</Link> : null}</div>
      {item.error_message ? <p className="mt-1 text-amber-800">{item.error_message}</p> : null}
    </li>)}</ul></section>;
}
