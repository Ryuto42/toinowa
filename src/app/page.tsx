import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BRAND } from '@/lib/shared/branding';
import { roleFromClaims } from '@/lib/auth/claims';
import { createClient } from '@/lib/database/server';
import { BrandMark } from '@/components/brand-mark';
import { LandingPreview } from '@/components/landing-preview';
import { LANDING_FEATURES } from '@/components/landing-features';

export default async function Home() {
  const { data } = await (await createClient()).auth.getClaims();
  const role = roleFromClaims(data?.claims?.app_role);
  if (role === 'student') redirect('/student/home');
  if (role === 'teacher') redirect('/teacher/dashboard');
  if (role === 'admin') redirect('/admin/overview');

  return <div className="min-h-screen bg-white text-[#17233d]">
    <header className="sticky top-0 z-20 border-b border-[#eef1f5] bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2 text-[0.95rem] font-bold text-[#17233d]">
          <BrandMark size={28} />{BRAND.shortName}
        </Link>
        <div className="flex items-center gap-2">
          <a href="#features" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-[#59647a] transition hover:text-[#087c73] sm:block">できること</a>
          <Link href="/login" className="rounded-full bg-[#17233d] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#2b3a5c]">ログイン</Link>
        </div>
      </div>
    </header>

    <main>
      {/* ヒーロー */}
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-40 h-[520px] bg-[radial-gradient(60%_60%_at_70%_40%,#d9f2ec_0%,transparent_70%)]" />
        <div className="relative mx-auto grid max-w-[1180px] items-center gap-12 px-5 pb-24 pt-14 sm:px-8 lg:grid-cols-[1fr_1.04fr] lg:gap-8 lg:pb-32 lg:pt-20">
          <div>
            <h1 className="lp-in text-[2.1rem] font-bold leading-[1.3] tracking-tight sm:text-[2.7rem] lg:text-[2.95rem]">
              「解けた」は、<br />「わかった」じゃない。
            </h1>
            <p className="lp-in mt-6 max-w-[30rem] text-[0.95rem] leading-8 text-[#59647a] sm:text-base"
              style={{ '--lp-delay': '110ms' } as React.CSSProperties}>
              先生は授業の記録を渡すだけ。AIが生徒ごとの復習を準備し、生徒の説明から理解を確かめ、次の学習計画につなげます。先生は内容を確認して配信し、必要な指導に集中できます。
            </p>
            <div className="lp-in mt-9 flex flex-wrap items-center gap-3"
              style={{ '--lp-delay': '220ms' } as React.CSSProperties}>
              <Link href="/login" className="inline-flex items-center gap-2 rounded-full bg-[#087c73] px-6 py-3.5 text-sm font-bold text-white shadow-[0_12px_24px_-14px_rgba(8,124,115,0.9)] transition hover:bg-[#05675f]">
                はじめる <span aria-hidden="true">→</span>
              </Link>
              <a href="#features" className="rounded-full border border-[#e3e7ee] px-6 py-3.5 text-sm font-bold text-[#4a5369] transition hover:border-[#b9dcd5]">できることを見る</a>
            </div>
          </div>
          <LandingPreview />
        </div>
      </section>

      {/* 機能紹介 */}
      <section id="features" className="scroll-mt-20 border-t border-[#eef1f5] bg-[#fbfcfb]">
        <div className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 sm:py-24">
          <h2 className="max-w-lg text-2xl font-bold leading-[1.45] tracking-tight sm:text-[2rem]">
            授業のあとを、<br />先生ひとりで抱えない。
          </h2>
          <div className="mt-14 space-y-16 sm:mt-16 sm:space-y-24">
            {LANDING_FEATURES.map((feature, index) => {
              const Shot = feature.shot;
              return <div key={feature.title} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
                <div className={index % 2 ? 'lg:order-2' : undefined}>
                  <h3 className="text-xl font-bold leading-[1.5] tracking-tight sm:text-[1.5rem]">{feature.title}</h3>
                  <p className="mt-4 max-w-md text-[0.95rem] leading-8 text-[#69748b]">{feature.body}</p>
                </div>
                <div className={index % 2 ? 'lg:order-1' : undefined}><Shot /></div>
              </div>;
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[1180px] px-5 pb-24 sm:px-8">
        <div className="overflow-hidden rounded-3xl bg-[#0f766a] px-8 py-14 text-center sm:px-14">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-[1.9rem]">教えるほど、わかる。</h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-[#c5e8e2]">
            所属コードとIDでログインして、そのまま試せます。
          </p>
          <Link href="/login" className="mt-8 inline-flex rounded-full bg-white px-7 py-3.5 text-sm font-bold text-[#0f766a] transition hover:bg-[#e8f8f3]">ログイン</Link>
        </div>
      </section>
    </main>

    <footer className="border-t border-[#eef1f5]">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-5 py-8 text-xs text-[#8090a5] sm:px-8">
        <span className="flex items-center gap-2 font-bold text-[#17233d]"><BrandMark size={22} />{BRAND.shortName}</span>
        <span>© {new Date().getFullYear()} {BRAND.name}</span>
      </div>
    </footer>
  </div>;
}
