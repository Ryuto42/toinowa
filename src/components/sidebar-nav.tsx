'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LogoutButton } from '@/components/logout-button';

export type NavIconName = 'dashboard' | 'book' | 'users' | 'bolt' | 'check' | 'screen' | 'home' | 'chat' | 'chart' | 'handoff' | 'settings' | 'key' | 'bell';

export interface SidebarNavItem {
  href: string;
  label: string;
  icon?: NavIconName;
  /** まだ確認していない件数。0 のときは出さない。 */
  badge?: number;
  /** バッジを消すためのキー。開いた時点でサーバーへ既読を送る。 */
  badgeKey?: string;
}

/**
 * 開いているタブのバッジは、その場で消す。
 *
 * サーバーの既読を待って次の遷移で消すと、
 * 「見ているのに未確認と言われる」状態が1画面ぶん残る。
 * 表示は現在地から導き、既読の保存が終わってからサーバーの件数を取り直す。
 */
function useSeenBadges(items: SidebarNavItem[], activeHref: string | null, persist: boolean) {
  const router = useRouter();
  const active = items.find((item) => item.href === activeHref);
  const activeKey = active?.badgeKey;
  const hasBadge = Boolean(active?.badge);

  useEffect(() => {
    // サイドバーと下部タブは同時に描画される。保存は片方だけに任せ、二重送信を避ける。
    if (!persist || !activeKey || !hasBadge) return;
    let cancelled = false;
    void fetch('/api/nav-seen', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: activeKey }),
    }).then(() => { if (!cancelled) router.refresh(); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [activeKey, hasBadge, persist, router]);

  return (item: SidebarNavItem) => (item.href === activeHref ? 0 : item.badge ?? 0);
}

function NavIcon({ name }: { name: NavIconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'dashboard') return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><rect {...common} x="4" y="4" width="6" height="6" rx="1" /><rect {...common} x="14" y="4" width="6" height="6" rx="1" /><rect {...common} x="4" y="14" width="6" height="6" rx="1" /><rect {...common} x="14" y="14" width="6" height="6" rx="1" /></svg>;
  if (name === 'book') return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><path {...common} d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" /><path {...common} d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20M8 7h8M8 11h6" /></svg>;
  if (name === 'users') return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><circle {...common} cx="9" cy="8" r="3" /><path {...common} d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.5a2.5 2.5 0 0 1 0 5M17 14a4.5 4.5 0 0 1 3.5 4" /></svg>;
  if (name === 'bolt') return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><path {...common} d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" /></svg>;
  if (name === 'settings') return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><circle {...common} cx="12" cy="12" r="3" /><path {...common} d="M19.4 14a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 18.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H2.8a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.1 7L4 6.9a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1A1.7 1.7 0 0 0 10 2.9v-.1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1.1Z" /></svg>;
  if (name === 'key') return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><circle {...common} cx="8" cy="12" r="4" /><path {...common} d="M12 12h9M18 12v3M15.5 12v2.5" /></svg>;
  if (name === 'bell') return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><path {...common} d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z" /><path {...common} d="M10 19a2 2 0 0 0 4 0" /></svg>;
  if (name === 'handoff') return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><circle {...common} cx="6.5" cy="7" r="2.5" /><circle {...common} cx="17.5" cy="7" r="2.5" /><path {...common} d="M3 19a3.5 3.5 0 0 1 7 0M14 19a3.5 3.5 0 0 1 7 0M9.5 13h5m0 0-1.8-1.8M14.5 13l-1.8 1.8" /></svg>;
  if (name === 'check') return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><circle {...common} cx="12" cy="12" r="8.5" /><path {...common} d="m8.5 12 2.3 2.3 4.8-5" /></svg>;
  if (name === 'screen') return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><rect {...common} x="3.5" y="4" width="17" height="12" rx="1.5" /><path {...common} d="M8 20h8M12 16v4" /></svg>;
  if (name === 'chat') return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><path {...common} d="M5 18.5 3.5 21l4.2-1.7A8.5 8.5 0 1 0 5 18.5Z" /><path {...common} d="M8 10h8M8 13h5" /></svg>;
  if (name === 'chart') return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><path {...common} d="M4 19V5M4 19h17" /><path {...common} d="m7 15 3-4 3 2 5-6" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><path {...common} d="m4 11 8-7 8 7" /><path {...common} d="M6 10v9h12v-9M10 19v-5h4v5" /></svg>;
}

export function SidebarNav({ items, homeHref, userName }: { items: SidebarNavItem[]; homeHref: string; userName: string }) {
  const pathname = usePathname();
  const initial = userName.trim().charAt(0) || 'U';
  const activeHref = items.find((item) => pathname === item.href || (item.href !== homeHref && pathname.startsWith(`${item.href}/`)))?.href ?? null;
  const badgeOf = useSeenBadges(items, activeHref, true);
  return <>
    <nav aria-label="メインナビゲーション" className="space-y-1.5">
      {items.map((item) => {
        const active = item.href === activeHref;
        const badge = badgeOf(item);
        // 現在地の切り替えも動きでつなぐ。瞬時に入れ替わると、どこからどこへ移ったのかが残らない。
        return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
          className={`nav-item group flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-semibold ${active ? 'bg-white text-slate-900 shadow-[0_8px_22px_-18px_rgba(15,23,42,0.45)]' : 'text-[#527b78] shadow-none hover:bg-white/70 hover:text-[#006f68]'}`}>
          <span className={`transition-colors duration-300 ${active ? 'text-[#008477]' : 'text-[#6f9792]'}`}><NavIcon name={item.icon ?? 'dashboard'} /></span>
          <span className="flex-1">{item.label}</span>
          {badge ? <span aria-label={`未確認 ${badge}件`} className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">{badge}</span> : null}
        </Link>;
      })}
    </nav>
    <div className="mt-auto flex items-center gap-3 px-2 pt-8">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1f2b45] text-sm font-bold text-white">{initial}</span>
      <div className="min-w-0 flex-1"><p className="text-[11px] text-[#78928f]">ログイン中</p><p className="truncate text-sm font-bold text-slate-900">{userName}</p></div>
      <LogoutButton />
    </div>
  </>;
}

/** スマホでは左のサイドバーが出せないため、下部タブとして同じ導線を出す。 */
export function MobileNav({ items, homeHref }: { items: SidebarNavItem[]; homeHref: string }) {
  const pathname = usePathname();
  const activeHref = items.find((item) => pathname === item.href || (item.href !== homeHref && pathname.startsWith(`${item.href}/`)))?.href ?? null;
  const badgeOf = useSeenBadges(items, activeHref, false);
  return <nav
    data-shell-mobile-nav
    aria-label="メインナビゲーション"
    className="fixed inset-x-0 bottom-0 z-30 border-t border-[#cfe6e1] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
  >
    <ul className="flex items-stretch">
      {items.map((item) => {
        const active = item.href === activeHref;
        const badge = badgeOf(item);
        return <li key={item.href} className="flex-1">
          <Link
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`nav-item relative flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-bold leading-tight ${active ? 'text-[#008477]' : 'text-[#6f8a87]'}`}
          >
            <NavIcon name={item.icon ?? 'dashboard'} />
            <span className="text-center">{item.label}</span>
            {badge ? <span aria-label={`未確認 ${badge}件`} className="absolute right-[18%] top-1.5 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold text-white">{badge}</span> : null}
          </Link>
        </li>;
      })}
    </ul>
  </nav>;
}

export { NavIcon };
