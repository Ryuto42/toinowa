import Link from 'next/link';
import { createClient } from '@/lib/database/server';
export async function TutorialEntry({ studentId, tenantId }: { studentId:string; tenantId:string }) {
  const result=await (await createClient()).from('conversations').select('id,state').eq('tenant_id',tenantId).eq('student_id',studentId).eq('purpose','tutorial').maybeSingle();
  if(result.error) throw new Error(result.error.message);
  if(result.data?.state==='completed') return null;
  return <section className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><p className="text-xs font-bold text-emerald-800">はじめての方へ · 自分のペースで話そう</p><h2 className="mt-1 text-lg font-bold text-emerald-950">まずは、好きなことをAIに教えてみよう</h2><p className="mt-2 text-sm leading-7 text-slate-700">好きなことから、得意・苦手な勉強や、できるようになりたいことへ。話せる範囲で、チャットの使い方を練習できます。正解や点数はありません。</p><Link href="/student/tutorial" className="mt-3 inline-block rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white">{result.data ? '練習の続きから' : 'AIと話す練習をする'}</Link></section>;
}
