export function PageTitle({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
    <div className="min-w-0">
      <h1 className="text-3xl font-bold tracking-tight text-[#17233d] sm:text-[36px]">{title}</h1>
      {description ? <p className="mt-2 max-w-2xl text-sm leading-7 text-[#60708d]">{description}</p> : null}
    </div>
    {action ? <div className="shrink-0">{action}</div> : null}
  </header>;
}

export function MetricCard({ label, value, note, tone = 'emerald' }: { label: string; value: string | number; note?: string; tone?: 'emerald' | 'amber' | 'rose' | 'slate' }) {
  const colors = { emerald: 'text-[#287f6e] bg-[#eff9f6]', amber: 'text-[#a36b22] bg-[#fff5e7]', rose: 'text-[#b34e5b] bg-[#fff0f1]', slate: 'text-[#26354e] bg-[#eff3f3]' };
  return <article className="rounded-[22px] border border-[#e3eaee] bg-white p-6"><p className="text-sm font-semibold text-[#60708d]">{label}</p><div className={`mt-4 inline-flex min-w-16 items-center justify-center rounded-2xl px-4 py-1 text-2xl font-bold ${colors[tone]}`}>{value}</div>{note ? <p className="mt-4 text-xs leading-5 text-[#8a9ab2]">{note}</p> : null}</article>;
}

/** 見出しはページ名と重なるときだけ省ける。省くと枠だけが残り、無駄な段差が出ない。 */
export function Panel({ title, description, children, action }: { title?: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="rounded-[22px] border border-[#e3eaee] bg-white">
    {title || description || action
      ? <header className="flex items-start justify-between border-b border-[#eef2f3] px-7 py-5"><div>{title ? <h2 className="font-bold text-[#17233d]">{title}</h2> : null}{description ? <p className={`text-xs text-[#8a9ab2] ${title ? 'mt-1' : ''}`}>{description}</p> : null}</div>{action}</header>
      : null}
    <div className="p-7">{children}</div>
  </section>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-44 items-center justify-center rounded-2xl border border-dashed border-[#b9dcd5] bg-[#fbfdfd] px-5 py-8 text-center text-sm text-[#8ca0bb]">{children}</div>;
}

export function StatusPill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'emerald' | 'amber' | 'rose' | 'slate' | 'blue' }) {
  const colors = { emerald: 'bg-[#e8f8f3] text-[#217d6e]', amber: 'bg-[#fff3df] text-[#a36b22]', rose: 'bg-[#fff0f1] text-[#b34e5b]', slate: 'bg-[#eff3f3] text-[#60708d]', blue: 'bg-[#edf2ff] text-[#5865ba]' };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${colors[tone]}`}>{children}</span>;
}

export function ScoreBar({ value }: { value: number | null }) {
  const percent = value === null ? 0 : Math.round(value * 100);
  return <div className="flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-[#edf2f2]"><div className="h-full rounded-full bg-[#238878]" style={{ width: `${percent}%` }} /></div><span className="w-11 text-right text-sm font-bold tabular-nums text-[#52637d]">{value === null ? '—' : `${percent}%`}</span></div>;
}
