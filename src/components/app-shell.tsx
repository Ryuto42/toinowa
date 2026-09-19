import Link from 'next/link';
import { BRAND } from '@/lib/shared/branding';

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

export function AppShell(props: {
  roleLabel: string;
  userName: string;
  homeHref: string;
  nav: NavItem[];
  children: React.ReactNode;
  modelTier?: string;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href={props.homeHref} className="text-base font-bold tracking-tight text-emerald-800">{BRAND.shortName}</Link>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{props.roleLabel}</span>
            {props.modelTier ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{props.modelTier === 'production' ? '本番モデル' : '開発モデル'}</span> : null}
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span className="hidden sm:inline">{props.userName}</span>
            <form action="/api/auth/logout" method="post"><button className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50">ログアウト</button></form>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[220px_1fr]">
        <aside className="border-b border-slate-200 bg-white px-3 py-3 lg:min-h-[calc(100vh-4rem)] lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
          <nav aria-label="メインナビゲーション" className="flex gap-1 overflow-x-auto lg:flex-col">
            {props.nav.map((item) => (
              <Link key={item.href} href={item.href} className="flex shrink-0 items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-800">
                <span>{item.label}</span>{item.badge ? <span className="ml-2 rounded-full bg-rose-100 px-2 text-xs text-rose-700">{item.badge}</span> : null}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{props.children}</main>
      </div>
    </div>
  );
}
