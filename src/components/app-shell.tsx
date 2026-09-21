import Link from 'next/link';
import { BRAND } from '@/lib/shared/branding';
import { MobileNav, SidebarNav, type SidebarNavItem } from '@/components/sidebar-nav';
import { LogoutButton } from '@/components/logout-button';
import { FlashNotice } from '@/components/flash-notice';
import { PageTransition } from '@/components/page-transition';
import { ROLE_THEME, type AppRole } from '@/components/role-theme';

export type NavItem = SidebarNavItem;

/**
 * ブランドマーク。
 *
 * サービス名を並べて書くと、同じ「ト」が2つ続いて見た目が重くなるので、
 * マークだけを置き、隣にはいま何として見ているのかを出す。
 * サービス名はタブのタイトル・ログイン画面・トップページに出る。
 *
 * ここはロールで色を変えない。サービスの印としていつも同じ色にしておき、
 * ロールの見分けは下のユーザーアバターで付ける。
 */
function BrandMark() {
  return <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#087c73] text-lg font-bold text-white shadow-sm">{BRAND.shortName.charAt(0) || 'S'}</span>;
}

export function AppShell(props: {
  role: AppRole;
  userName: string;
  homeHref: string;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const theme = ROLE_THEME[props.role];
  return <div className="min-h-screen bg-[#fbfcfb] text-[#17233d]">
    <FlashNotice />
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[286px] flex-col border-r border-[#cfe6e1] bg-[#def3ed] px-5 py-6 lg:flex">
      <Link href={props.homeHref} aria-label={`${BRAND.name} ${theme.label}モード のホームへ`}
        className="flex items-center gap-3 rounded-2xl px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#237d75]">
        <BrandMark />
        <span className="text-xl font-bold tracking-tight text-[#17233d]">{theme.label}モード</span>
      </Link>
      <div className="mt-8 flex min-h-0 flex-1 flex-col">
        <SidebarNav items={props.nav} homeHref={props.homeHref} userName={props.userName} role={props.role} />
      </div>
    </aside>
    <header data-shell-mobile-header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
      <Link href={props.homeHref} aria-label={`${BRAND.name} ${theme.label}モード のホームへ`} className="flex items-center gap-2 font-bold text-[#17233d]">
        <BrandMark />
        <span>{theme.label}モード</span>
      </Link>
      <LogoutButton />
    </header>
    <main className="min-h-screen lg:ml-[286px]">
      <div className="mx-auto max-w-[1440px] px-5 pb-28 pt-8 sm:px-8 lg:px-10 lg:pb-12 lg:pt-12">
        <div data-shell-guide className="mb-5 flex justify-end">
          <Link href={theme.guideHref} className="text-sm font-semibold text-[#237d75] underline underline-offset-4">使い方ガイド</Link>
        </div>
        <PageTransition>{props.children}</PageTransition>
      </div>
    </main>
    <MobileNav items={props.nav} homeHref={props.homeHref} />
  </div>;
}
