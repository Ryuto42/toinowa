import Link from 'next/link';

export type IconName =
  | 'edit' | 'insights' | 'visibility' | 'archive' | 'unarchive' | 'delete' | 'swap_horiz';

/** Material Symbols（Google Fonts）。読み込むアイコン名は app/layout.tsx で指定している。 */
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <span aria-hidden="true" translate="no"
    className={`material-symbols-outlined select-none leading-none ${className}`}>{name}</span>;
}

const base = 'inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-[#237d75] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#237d75] disabled:opacity-40';

/**
 * アイコンだけのボタン。
 *
 * 見た目は記号だけなので、`label` は必須にして読み上げとツールチップの両方に使う。
 * ここを省くと、スクリーンリーダーでは何のボタンか分からなくなる。
 */
export function IconButton({ icon, label, onClick, disabled, tone = 'default', type = 'button' }: {
  icon: IconName;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  type?: 'button' | 'submit';
}) {
  return <button type={type} onClick={onClick} disabled={disabled} aria-label={label} title={label}
    className={`${base} ${tone === 'danger' ? 'hover:bg-rose-50 hover:text-rose-700' : ''}`}>
    <Icon name={icon} className="text-[20px]" />
  </button>;
}

export function IconLink({ icon, label, href }: { icon: IconName; label: string; href: string }) {
  return <Link href={href} aria-label={label} title={label} className={base}>
    <Icon name={icon} className="text-[20px]" />
  </Link>;
}
