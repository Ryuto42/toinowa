'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoutButton } from '@/components/logout-button';

export type NavIconName = 'dashboard' | 'book' | 'users' | 'bolt' | 'check' | 'screen' | 'home' | 'chat' | 'chart';

export interface SidebarNavItem {
  href: string;
  label: string;
  icon?: NavIconName;
  badge?: number;
}

function NavIcon({ name }: { name: NavIconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'dashboard') return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><rect {...common} x="4" y="4" width="6" height="6" rx="1" /><rect {...common} x="14" y="4" width="6" height="6" rx="1" /><rect {...common} x="4" y="14" width="6" height="6" rx="1" /><rect {...common} x="14" y="14" width="6" height="6" rx="1" /></svg>;
  if (name === 'book') return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><path {...common} d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" /><path {...common} d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20M8 7h8M8 11h6" /></svg>;
  if (name === 'users') return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><circle {...common} cx="9" cy="8" r="3" /><path {...common} d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.5a2.5 2.5 0 0 1 0 5M17 14a4.5 4.5 0 0 1 3.5 4" /></svg>;
  if (name === 'bolt') return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><path {...common} d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" /></svg>;
  if (name === 'check') return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><circle {...common} cx="12" cy="12" r="8.5" /><path {...common} d="m8.5 12 2.3 2.3 4.8-5" /></svg>;
  if (name === 'screen') return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><rect {...common} x="3.5" y="4" width="17" height="12" rx="1.5" /><path {...common} d="M8 20h8M12 16v4" /></svg>;
  if (name === 'chat') return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><path {...common} d="M5 18.5 3.5 21l4.2-1.7A8.5 8.5 0 1 0 5 18.5Z" /><path {...common} d="M8 10h8M8 13h5" /></svg>;
  if (name === 'chart') return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><path {...common} d="M4 19V5M4 19h17" /><path {...common} d="m7 15 3-4 3 2 5-6" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><path {...common} d="m4 11 8-7 8 7" /><path {...common} d="M6 10v9h12v-9M10 19v-5h4v5" /></svg>;
}

export function SidebarNav({ items, homeHref, userName }: { items: SidebarNavItem[]; homeHref: string; userName: string }) {
  const pathname = usePathname();
  const initial = userName.trim().charAt(0) || 'U';
  return <>
    <nav aria-label="メインナビゲーション" className="space-y-1.5">
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== homeHref && pathname.startsWith(`${item.href}/`));
        return <Link key={item.href} href={item.href} className={`group flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-semibold transition ${active ? 'bg-white text-slate-900 shadow-[0_8px_22px_-18px_rgba(15,23,42,0.45)]' : 'text-[#527b78] hover:bg-white/70 hover:text-[#006f68]'}`}>
          <span className={active ? 'text-[#008477]' : 'text-[#6f9792]'}><NavIcon name={item.icon ?? 'dashboard'} /></span>
          <span className="flex-1">{item.label}</span>
          {item.badge ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">{item.badge}</span> : null}
        </Link>;
      })}
    </nav>
    <div className="mt-auto pt-8">
      <div className="flex items-center gap-3 px-2 pb-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1f2b45] text-sm font-bold text-white">{initial}</span>
        <div className="min-w-0"><p className="text-[11px] text-[#78928f]">ログイン中</p><p className="truncate text-sm font-bold text-slate-900">{userName}</p></div>
      </div>
      <LogoutButton />
    </div>
  </>;
}

/** スマホでは左のサイドバーが出せないため、下部タブとして同じ導線を出す。 */
export function MobileNav({ items, homeHref }: { items: SidebarNavItem[]; homeHref: string }) {
  const pathname = usePathname();
  return <nav
    aria-label="メインナビゲーション"
    className="fixed inset-x-0 bottom-0 z-30 border-t border-[#cfe6e1] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
  >
    <ul className="flex items-stretch">
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== homeHref && pathname.startsWith(`${item.href}/`));
        return <li key={item.href} className="flex-1">
          <Link
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`relative flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-bold leading-tight ${active ? 'text-[#008477]' : 'text-[#6f8a87]'}`}
          >
            <NavIcon name={item.icon ?? 'dashboard'} />
            <span className="text-center">{item.label}</span>
            {item.badge ? <span className="absolute right-[18%] top-1.5 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold text-white">{item.badge}</span> : null}
          </Link>
        </li>;
      })}
    </ul>
  </nav>;
}

export { NavIcon };
