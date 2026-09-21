import Link from 'next/link';
import { BRAND } from '@/lib/shared/branding';
import { MobileNav, SidebarNav, type SidebarNavItem } from '@/components/sidebar-nav';
import { LogoutButton } from '@/components/logout-button';
import { FlashNotice } from '@/components/flash-notice';
import { PageTransition } from '@/components/page-transition';
import { ROLE_THEME, type AppRole } from '@/components/role-theme';
// ロゴはログイン画面・トップページと同じものを使う。ここだけ別の印にしない。
import { BrandMark } from '@/components/brand-mark';

export type NavItem = SidebarNavItem;

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
      <Link href={props.homeHref} aria-label={`${BRAND.name} ${theme.title} のホームへ`}
        className="flex items-center gap-3 rounded-2xl px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#237d75]">
        <BrandMark />
        <span className="text-xl font-bold tracking-tight text-[#17233d]">{theme.title}</span>
      </Link>
      <div className="mt-8 flex min-h-0 flex-1 flex-col">
        <SidebarNav items={props.nav} homeHref={props.homeHref} userName={props.userName} role={props.role} />
      </div>
    </aside>
    <header data-shell-mobile-header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
      <Link href={props.homeHref} aria-label={`${BRAND.name} ${theme.title} のホームへ`} className="flex items-center gap-2 font-bold text-[#17233d]">
        <BrandMark />
        <span>{theme.title}</span>
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
