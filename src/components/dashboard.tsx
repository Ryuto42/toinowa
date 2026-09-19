export function PageTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div>{eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">{eyebrow}</p> : null}<h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>{description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p> : null}</div>{action}</header>;
}

export function MetricCard({ label, value, note, tone = 'emerald' }: { label: string; value: string | number; note?: string; tone?: 'emerald' | 'amber' | 'rose' | 'slate' }) {
  const colors = { emerald: 'text-emerald-700 bg-emerald-50', amber: 'text-amber-700 bg-amber-50', rose: 'text-rose-700 bg-rose-50', slate: 'text-slate-700 bg-slate-100' };
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-500">{label}</p><div className={`mt-4 inline-flex rounded-xl px-3 py-1 text-2xl font-bold ${colors[tone]}`}>{value}</div>{note ? <p className="mt-3 text-xs leading-5 text-slate-500">{note}</p> : null}</article>;
}

export function Panel({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="flex items-start justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold">{title}</h2>{description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}</div>{action}</header><div className="p-5">{children}</div></section>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">{children}</div>;
}

export function StatusPill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'emerald' | 'amber' | 'rose' | 'slate' | 'blue' }) {
  const colors = { emerald: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-800', rose: 'bg-rose-50 text-rose-700', slate: 'bg-slate-100 text-slate-700', blue: 'bg-blue-50 text-blue-700' };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${colors[tone]}`}>{children}</span>;
}

export function ScoreBar({ value }: { value: number | null }) {
  const percent = value === null ? 0 : Math.round(value * 100);
  return <div className="flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} /></div><span className="w-11 text-right text-sm font-bold tabular-nums">{value === null ? '—' : `${percent}%`}</span></div>;
}
