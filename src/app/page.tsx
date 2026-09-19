import { BRAND } from "@/lib/shared/branding";
import Link from "next/link";
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/database/server';
import { roleFromClaims } from '@/lib/auth/claims';

export default async function Home() {
  // ログイン済みでトップへ戻った場合は、権限に対応する画面へ送る。
  const { data } = await (await createClient()).auth.getClaims();
  const role = roleFromClaims(data?.claims?.app_role);
  if (role === 'student') redirect('/student/home');
  if (role === 'teacher') redirect('/teacher/dashboard');
  if (role === 'admin') redirect('/admin/tenant');

  return (
    <main className="min-h-full bg-[#f6f8f7] text-slate-900">
      <section className="mx-auto flex min-h-[620px] w-full max-w-6xl flex-col px-6 py-8 sm:px-10 lg:px-16">
        <header className="flex items-center justify-between">
          <Link className="text-lg font-semibold tracking-tight" href="/">
            {BRAND.shortName}
          </Link>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              Web版
            </span>
            <Link
              href="/login"
              className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
            >
              ログイン
            </Link>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-14 py-20 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="mb-5 text-sm font-semibold tracking-[0.18em] text-emerald-700">
              LEARNING, ONE STEP AT A TIME
            </p>
            <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
              授業のあとを、
              <span className="text-emerald-700">一緒に設計する。</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-slate-600 sm:text-lg">
              {BRAND.name} は、授業の理解度とつまずきを丁寧に読み取り、
              次に取り組む一歩を生徒と先生に届けます。
            </p>
            <div className="mt-9 flex flex-wrap gap-3 text-sm font-medium">
              <a
                href="#overview"
                className="rounded-full bg-emerald-700 px-5 py-3 text-white transition hover:bg-emerald-800"
              >
                できることを見る
              </a>
              <Link
                href="/login"
                className="rounded-full border border-slate-300 bg-white px-5 py-3 text-slate-700 transition hover:border-emerald-400 hover:text-emerald-800"
              >
                生徒・先生としてログイン
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)]">
            <div className="rounded-2xl bg-slate-900 p-6 text-white">
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>今日の学び</span>
                <span className="rounded-full bg-white/10 px-2 py-1 text-xs">preview</span>
              </div>
              <p className="mt-10 text-2xl font-medium leading-relaxed">
                「傾き」と「切片」の違いを、
                <br />
                自分の言葉で説明できるようにする
              </p>
              <div className="mt-8 h-2 overflow-hidden rounded-full bg-white/15">
                <div className="h-full w-2/3 rounded-full bg-emerald-400" />
              </div>
              <p className="mt-3 text-sm text-slate-300">次の一歩まであと少し</p>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-5 text-center text-xs text-slate-500">
              <div><span className="mb-1 block text-lg">01</span>理解する</div>
              <div><span className="mb-1 block text-lg">02</span>解いてみる</div>
              <div><span className="mb-1 block text-lg">03</span>振り返る</div>
            </div>
          </div>
        </div>
      </section>

      <section id="overview" className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-16 sm:px-10 lg:grid-cols-3 lg:px-16">
          {[
            ['理解の変化を見つける', '正答だけでなく、考え方やヒントの使い方まで記録します。'],
            ['次にやることを決める', 'つまずきに合わせて、無理のない復習の一歩を提案します。'],
            ['先生に根拠を届ける', '生徒の変化とAIの判断材料を、先生が確認できる形にします。'],
          ].map(([title, description], index) => (
            <article key={title} className="rounded-2xl border border-slate-200 p-6">
              <p className="text-sm font-semibold text-emerald-700">0{index + 1}</p>
              <h2 className="mt-5 text-lg font-semibold">{title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>
      <footer className="mx-auto w-full max-w-6xl px-6 py-8 text-xs text-slate-500 sm:px-10 lg:px-16">
        {BRAND.name} · 学びの過程を、次の一歩につなげる
      </footer>
    </main>
  );
}
