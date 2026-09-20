import Link from 'next/link';
import { BRAND } from '@/lib/shared/branding';
import { SidebarNav, type SidebarNavItem } from '@/components/sidebar-nav';
import { LogoutButton } from '@/components/logout-button';

export type NavItem = SidebarNavItem;

function BrandMark() {
  return <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#087c73] text-lg font-bold text-white shadow-sm">{BRAND.shortName.charAt(0) || 'S'}</span>;
}

export function AppShell(props: {
  roleLabel: string;
  userName: string;
  homeHref: string;
  nav: NavItem[];
  children: React.ReactNode;
  modelTier?: string;
}) {
  return <div className="min-h-screen bg-[#fbfcfb] text-[#17233d]">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[286px] flex-col border-r border-[#cfe6e1] bg-[#def3ed] px-5 py-6 lg:flex">
      <Link href={props.homeHref} className="flex items-center gap-3 px-1">
        <BrandMark />
        <span className="text-2xl font-bold tracking-tight text-[#17233d]">{BRAND.shortName}</span>
      </Link>
      <div className="mt-5 flex flex-wrap gap-2 px-1">
        <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-[#237d75]">{props.roleLabel}</span>
        {props.modelTier ? <span className="rounded-full bg-[#fff0d7] px-3 py-1 text-xs font-bold text-[#b76b12]">{props.modelTier === 'production' ? '本番モデル' : '開発モデル'}</span> : null}
      </div>
      <div className="mt-9 flex min-h-0 flex-1 flex-col"><SidebarNav items={props.nav} homeHref={props.homeHref} userName={props.userName} /></div>
    </aside>
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
      <Link href={props.homeHref} className="flex items-center gap-2 font-bold text-[#17233d]"><BrandMark /><span>{BRAND.shortName}</span></Link>
      <div className="flex items-center gap-2"><span className="rounded-full bg-[#def3ed] px-3 py-1 text-xs font-bold text-[#237d75]">{props.roleLabel}</span><LogoutButton /></div>
    </header>
    <main className="min-h-screen lg:ml-[286px]">
      <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10 lg:py-12">{props.children}</div>
    </main>
  </div>;
}
