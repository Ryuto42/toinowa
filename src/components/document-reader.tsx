'use client';
import { useState } from 'react';

async function imageData(file: File): Promise<string[]> {
  if (file.size > 15 * 1024 * 1024) throw new Error('15MB以内のファイルを選んでください。');
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    const loading = pdfjs.getDocument({ data: await file.arrayBuffer() });
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

export function DocumentReader({ purpose, onRead }: { purpose: 'exam' | 'lesson'; onRead: (text: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [uncertainties, setUncertainties] = useState<string[]>([]);
  async function read() {
    if (!file || busy) return;
    setBusy(true); setStatus('資料を読み取っています…'); setUncertainties([]);
    try {
      const images = await imageData(file);
      if (images.reduce((sum, item) => sum + item.length, 0) > 3_500_000) throw new Error('画像が大きいため、ページを分けてアップロードしてください。');
      const response = await fetch('/api/materials/extract', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purpose, images }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? '読み取れませんでした。再試行するか、内容を手入力してください。');
      onRead(result.text); setUncertainties(result.uncertainties ?? []);
      setStatus('読み取りました。数値・内容を確認し、必要なら下の入力欄で修正してください。');
    } catch (error) { setStatus(error instanceof Error ? error.message : '読み取れませんでした。'); }
    finally { setBusy(false); }
  }
  return <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 p-4">
    <p className="text-sm font-bold">{purpose === 'exam' ? '模試結果' : '授業資料'}をPDF・写真から入力</p>
    <p className="mt-1 text-xs leading-6 text-slate-600">PDF（8ページ以内）・JPEG・PNG・WebP／15MB以内。画像をOrcaRouterへ送信して読み取ります。氏名など不要な個人情報は画像から除いてください。</p>
    <div className="mt-3 flex flex-wrap gap-3"><input aria-label="読み取る資料" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} onChange={event => setFile(event.target.files?.[0] ?? null)} className="max-w-full text-sm" /><button type="button" disabled={!file || busy} onClick={read} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? '読み取り中…' : 'AIで読み取る'}</button></div>
    {status ? <p role="status" className="mt-3 text-sm leading-6">{status}</p> : null}
    {uncertainties.length ? <ul className="mt-2 list-disc pl-5 text-sm text-amber-800">{uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}
  </div>;
}
