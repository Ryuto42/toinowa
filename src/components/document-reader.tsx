'use client';
import { useEffect, useRef, useState } from 'react';
import type { ExamBaseline, ExamAnalysisResult } from '@/lib/materials/exam-analysis';

async function imageData(file: File): Promise<string[]> {
  if (file.size > 15 * 1024 * 1024) throw new Error('15MB以内のファイルを選んでください。');
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    // eval を使わせない。本番 CSP から 'unsafe-eval' を外すための条件。
    const loading = pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false });
    const document = await loading.promise;
    try {
      if (document.numPages > 8) throw new Error('PDFは8ページ以内に分けてください。');
      const images = [];
      for (let i = 1; i <= document.numPages; i++) {
        const page = await document.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(2, 1600 / Math.max(base.width, base.height)) });
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        images.push(canvas.toDataURL('image/jpeg', 0.85));
        canvas.width = canvas.height = 0;
      }
      return images;
    } finally { await loading.destroy(); }
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('PDF・JPEG・PNG・WebPに対応しています。');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('画像を処理できませんでした。');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return [canvas.toDataURL('image/jpeg', 0.85)];
  } finally { bitmap.close(); }
}

export function DocumentReader({ purpose, onRead, baseline, onAnalysisStarted, onAnalyzed, onBusyChange }: {
  onBusyChange?: (busy: boolean) => void;
  purpose: 'exam' | 'lesson'; onRead: (text: string) => void;
  baseline?: ExamBaseline; onAnalysisStarted?: (id: string) => void | Promise<void>;
  onAnalyzed?: (id: string, result: ExamAnalysisResult, baseline: ExamBaseline) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [uncertainties, setUncertainties] = useState<string[]>([]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function read(file: File) {
    if (busy) return;
    const id = crypto.randomUUID();
    const snapshot = baseline ?? { learningGoal: '', weakAreas: '', examResults: '', dailyTimeLimitMin: null };
    setBusy(true); onBusyChange?.(true); setStatus(purpose === 'exam' ? 'ファイルをアップロードしています。登録はそのまま進められます。' : '授業資料を読み取っています。読み取り完了まで、この画面を開いておいてください。'); setUncertainties([]);
    try {
      // IDを変換・アップロード前に通知し、先に登録されても同じ分析に結びつける。
      if (purpose === 'exam') await onAnalysisStarted?.(id);
      const images = await imageData(file);
      if (images.reduce((sum, item) => sum + item.length, 0) > 3_500_000) throw new Error('画像が大きいため、ページを分けてアップロードしてください。');
      const response = await fetch(purpose === 'exam' ? '/api/admin/exam-analyses' : '/api/materials/extract', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(purpose === 'exam' ? { id, images, baseline: snapshot } : { purpose, images }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'アップロードできませんでした。再選択するか手入力してください。');
      if (purpose === 'lesson') {
        if (mounted.current) { onRead(result.text); setUncertainties(result.uncertainties ?? []); setStatus('読み取り結果を反映しました。必要に応じて編集してください。'); }
        return;
      }
      if (mounted.current) setStatus('バックグラウンドで分析中です。登録後や別の画面へ移動した後も処理を続けます。');
      window.dispatchEvent(new Event('exam-analysis-started'));
      while (mounted.current) {
        await new Promise(resolve => setTimeout(resolve, 2500));
        if (!mounted.current) break;
        const poll = await fetch(`/api/admin/exam-analyses/${id}`);
        if (!poll.ok) throw new Error('分析状況を取得できません。登録後は画面下の分析状況から確認できます。');
        const current = await poll.json();
        if (current.status === 'failed') throw new Error(current.error_message);
        if (current.status === 'completed') {
          onAnalyzed?.(id, current.result, snapshot);
          setUncertainties(current.result.uncertainties ?? []);
          setStatus('分析結果を反映しました。目標・苦手範囲・学習時間はAIの提案です。手入力で変更した項目は保持します。');
          break;
        }
      }
    } catch (error) {
      if (purpose === 'exam') void fetch(`/api/admin/exam-analyses/${id}`, { method: 'PATCH' }).catch(() => undefined);
      if (mounted.current) setStatus(error instanceof Error ? error.message : '読み取れませんでした。'); }
    finally { if (mounted.current) { setBusy(false); onBusyChange?.(false); } }
  }
  return <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 p-4">
    <p className="text-sm font-bold">{purpose === 'exam' ? '模試結果（任意）' : '授業資料'}をPDF・写真から入力</p>
    <p className="mt-1 text-xs leading-6 text-slate-600">PDF（8ページ以内）・JPEG・PNG・WebP／15MB以内。選択後、自動で分析します。画像をOrcaRouterへ送信するため、不要な氏名・連絡先は除いてください。</p>
    <input aria-label="読み取る資料" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void read(file); }} className="mt-3 max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-700 file:px-4 file:py-2 file:font-bold file:text-white hover:file:bg-emerald-800 disabled:opacity-50" />
    {status ? <p role="status" className="mt-3 text-sm leading-6">{status}</p> : null}
    {uncertainties.length ? <ul className="mt-2 list-disc pl-5 text-sm text-amber-800">{uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}
  </div>;
}
