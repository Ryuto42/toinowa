import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BRAND } from '@/lib/shared/branding';
import { roleFromClaims } from '@/lib/auth/claims';
import { createClient } from '@/lib/database/server';
import { BrandMark } from '@/components/brand-mark';

const subjects = ['国語', '英語', '数学', '理科', '社会'];

export default async function Home() {
  const { data } = await (await createClient()).auth.getClaims();
  const role = roleFromClaims(data?.claims?.app_role);
  if (role === 'student') redirect('/student/home');
  if (role === 'teacher') redirect('/teacher/dashboard');
  if (role === 'admin') redirect('/admin/overview');

  return <div className="min-h-screen bg-[#faf9ff] text-[#17233d]">
    <div className="h-1 bg-[#7167f6]" />
    <header className="border-b border-[#eceaf4] bg-white/90">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-6 lg:px-10">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-[#096f68]"><BrandMark />{BRAND.shortName}</Link>
        <nav className="hidden items-center gap-8 text-xs font-semibold text-[#4b5369] sm:flex">
          <a href="#process" className="rounded-full bg-[#e9edff] px-4 py-2 text-[#4e5bc5]">学びのプロセス</a>
          <Link href="/login" className="hover:text-[#087c73]">ログイン</Link>
        </nav>
        <Link href="/login" aria-label="ログイン" className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3d35c8] text-white shadow-sm"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg></Link>
      </div>
    </header>

    <main>
      <section className="mx-auto grid max-w-[1440px] items-center gap-12 px-6 py-16 sm:px-10 lg:grid-cols-[1.02fr_0.82fr] lg:px-14 lg:py-20">
        <div className="max-w-[650px]">
          <p className="text-sm font-bold tracking-[0.2em] text-[#087c73]">対話で理解を深める学習</p>
          <h1 className="mt-7 text-4xl font-bold leading-[1.25] tracking-tight text-[#17233d] sm:text-[56px]">その「わかった」、<br /><span className="text-[#087c73]">本物ですか。</span></h1>
          <p className="mt-7 max-w-xl text-base leading-8 text-[#59647a] sm:text-lg">正解を急がせない、対話から深める学び。<br />授業のあとの小さなつまずきを、確かな理解へ。</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full bg-[#087c73] px-6 py-3 text-sm font-bold text-white shadow-[0_8px_16px_-10px_rgba(0,100,90,0.7)] transition hover:bg-[#05675f]">授業の対話を体験する <span aria-hidden="true">→</span></Link>
            <a href="#process" className="rounded-full border border-[#e6e5ed] bg-white px-6 py-3 text-sm font-bold text-[#4a5369] shadow-sm transition hover:border-[#b9dcd5]">学びのプロセスを見る</a>
          </div>
          <div className="mt-8 flex flex-wrap gap-2 text-xs font-semibold text-[#66807d]">{subjects.map((subject) => <span key={subject} className="rounded-full bg-[#e7f5f1] px-3 py-1.5">{subject}</span>)}</div>
        </div>

        <div className="rounded-[30px] bg-white p-6 shadow-[0_18px_55px_-34px_rgba(40,52,90,0.38)] sm:p-7">
          <div className="flex items-center justify-between rounded-full bg-[#fafaff] px-4 py-3 text-[11px] text-[#727b92]"><span><b className="text-[#167a70]">現代文 論理文読解 #08</b> · 高校国語</span><span className="rounded-full bg-[#d6f5ee] px-3 py-1 text-[#298d80]">対話中</span></div>
          <p className="mt-5 text-[11px] text-[#768098]">探究テーマ</p><p className="mt-1 text-sm font-bold">「筆者の主張と具体例の見分け方」</p>
          <div className="mt-5 space-y-3">
            <div className="flex gap-3 bg-[#f0f1ff] p-4 text-xs leading-5"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#087c73] text-white">◉</span><p><span className="block text-[10px] text-[#69809b]">問いかけ</span>「この段落の『しかし』のあと、筆者は何を一番伝えたかったのかな？」</p></div>
            <div className="flex gap-3 bg-[#e7faf6] p-4 text-xs leading-5"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[#087c73]">≡</span><p><span className="block text-[10px] text-[#69809b]">生徒の気づき</span>「これまでの具体例を否定して、新しい対比の視点を出しているところ！」</p></div>
            <div className="flex gap-3 bg-[#f0f1ff] p-4 text-xs leading-5"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#087c73] text-white">✓</span><p><span className="block text-[10px] text-[#69809b]">伴走フィードバック</span>「鋭い！形式段落の接続詞から筆者の意図を見抜けているね。」</p></div>
          </div>
          <div className="mt-6 flex items-center justify-between text-[10px] text-[#5d8983]"><span>● 思考ログを先生のダッシュボードへ共有完了</span><span aria-hidden="true">♧</span></div>
        </div>
      </section>

      <section id="process" className="mx-auto grid max-w-[1440px] gap-4 px-6 pb-20 sm:px-10 lg:grid-cols-3 lg:px-14">
        {[
          ['01', '対話で理解を可視化', '学んだ概念を自分の言葉で説明し、どの部分が伝わっているかを根拠とともに記録します。', '◉ 概念説明の記録'],
          ['02', '分からないところを問い返す', 'AIが知らない聞き手として、説明のつながりや曖昧な箇所を一つずつ質問します。', '△ 説明を深める個別問いかけ'],
          ['03', '先生へ根拠ある気づきを届ける', '表面的なテストの点数では見えない、生徒の概念理解と初学者への伝わりやすさを指導に還元します。', '⌁ 指導カルテとの自動連携'],
        ].map(([number, title, description, note]) => <article key={number} className="rounded-[22px] border border-[#e8e8ee] bg-white p-7"><p className="text-xs font-bold tracking-[0.18em] text-[#087c73]">{number}</p><h2 className="mt-5 text-base font-bold">{title}</h2><p className="mt-3 text-sm leading-6 text-[#69748b]">{description}</p><p className="mt-5 text-[10px] font-semibold text-[#47857d]">{note}</p></article>)}
      </section>
    </main>
    <footer className="border-t border-[#e7e8f1] bg-[#f1f3ff]"><div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-7 text-[11px] text-[#69738d] sm:px-10 lg:px-14"><span className="flex items-center gap-2 font-semibold text-[#087c73]"><BrandMark />{BRAND.shortName}</span><span>© {new Date().getFullYear()} {BRAND.name}. 問いからはじまる、深い学びを。</span></div></footer>
  </div>;
}
