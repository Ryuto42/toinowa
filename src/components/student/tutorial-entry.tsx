import Link from 'next/link';
import { createClient } from '@/lib/database/server';
export async function TutorialEntry({ studentId, tenantId }: { studentId:string; tenantId:string }) {
  const result=await (await createClient()).from('conversations').select('id,state').eq('tenant_id',tenantId).eq('student_id',studentId).eq('purpose','tutorial').maybeSingle();
  if(result.error) throw new Error(result.error.message);
  if(result.data?.state==='completed') return null;
  return <section className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
    <p className="mb-2 text-xs font-bold text-emerald-700">はじめての方へ</p>
    <h2 className="text-lg font-bold text-emerald-950">まずは、好きなことをAIに教えてみよう</h2>
    <p className="mt-2 text-sm leading-7 text-slate-700">このアプリでは、あなたがAIに教える側になります。まずは簡単なやり取りで練習してみましょう。正解も点数もありません。</p>
    <Link href="/student/tutorial" className="mt-3 inline-block rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white">練習をはじめる</Link>
  </section>;
}
