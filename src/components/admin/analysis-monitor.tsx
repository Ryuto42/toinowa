'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
interface Analysis { id: string; status: string; student_id: string | null; error_message: string | null; users: { display_name: string } | null }
export function AnalysisMonitor() {
  const [items, setItems] = useState<Analysis[]>([]);
  const previous = useRef(new Map<string, string>());
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      clearTimeout(timer);
      try {
        const response = await fetch('/api/admin/exam-analyses');
        if (response.ok) {
          const result = await response.json();
          if (!stopped) {
            const analyses: Analysis[] = result.analyses;
            if (analyses.some(item => item.status === 'completed' && previous.current.has(item.id) && previous.current.get(item.id) !== 'completed')) router.refresh();
            previous.current = new Map(analyses.map(item => [item.id, item.status]));
            setItems(analyses);
          }
        }
      } catch { /* 一時的な接続断は次回更新で回復する。分析自体はサーバーで継続する。 */ }
      if (!stopped) timer = setTimeout(refresh, 5000);
    }
    void refresh();
    window.addEventListener('exam-analysis-started', refresh);
    return () => { stopped = true; clearTimeout(timer); window.removeEventListener('exam-analysis-started', refresh); };
  }, [router]);
  if (!items.length) return null;
  const pending = items.filter(item => !['completed','failed'].includes(item.status)).length;
  return <details className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm"><summary className="cursor-pointer font-bold">模試の自動分析 {pending ? `：${pending}件を処理中` : '：直近の結果'}</summary><ul className="mt-3 space-y-2">{items.map(item => <li key={item.id}><span className="font-semibold">{item.users?.display_name ?? '登録前の資料'}：</span>{({ uploading: 'アップロード待ち', queued: '分析待ち', processing: '分析中', completed: '分析完了（入力済みの変更は保持）', failed: '分析できませんでした。再アップロードか手入力をご利用ください。' })[item.status]}{item.student_id ? <Link className="ml-3 text-emerald-800 underline" href={`/admin/users/${item.student_id}`}>生徒情報を確認</Link> : null}</li>)}</ul></details>;
}
