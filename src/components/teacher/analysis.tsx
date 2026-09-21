/**
 * 分析結果を「読む」より先に「見る」ためのパーツ。
 *
 * 先生は短い時間で大勢を見る。長い所見を読ませる前に、
 * どこが弱いか・誰が止まっているかが図で分かるようにする。
 */

export function jsonItems(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : [];
}
export function jsonRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function stringItems(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

export const DIMENSION_LABELS: Record<string, string> = {
  definition: '概念の定義',
  logic: '論理のつながり',
  example: '具体例・たとえ',
  accuracy: '正確さ',
  clarity: '伝わりやすさ',
};

export const MASTERY_LABELS: Record<string, string> = {
  recent: '今回の説明',
  history: '過去の説明',
  transfer: '応用への転移',
  delayed: '時間を置いた定着',
  selfCalib: '自己評価との一致',
};

/** 0..1 を色分けする。3段階までにして、色だけに意味を持たせない。 */
function band(value: number): { stroke: string; text: string; bg: string; label: string } {
  if (value >= 0.8) return { stroke: '#238878', text: 'text-[#1c6e60]', bg: 'bg-[#e8f8f3]', label: '説明できている' };
  if (value >= 0.5) return { stroke: '#c08422', text: 'text-[#8a5e12]', bg: 'bg-[#fff3df]', label: 'あと少し' };
  return { stroke: '#b34e5b', text: 'text-[#8f3b46]', bg: 'bg-[#fff0f1]', label: '要フォロー' };
}

/** 理解度のドーナツ。数値・色・ラベルの3つで表し、色だけに頼らない。 */
export function ScoreRing({ value, size = 96, caption }: { value: number | null; size?: number; caption?: string }) {
  const percent = value === null ? 0 : Math.round(value * 100);
  const tone = band(value ?? 0);
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  return <div className="flex items-center gap-4">
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={value === null ? '評価なし' : `理解度 ${percent}パーセント`}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#edf2f2" strokeWidth={10} />
      {value === null ? null : <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={tone.stroke} strokeWidth={10} strokeLinecap="round"
        strokeDasharray={`${(circumference * percent) / 100} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />}
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        className="fill-[#17233d] font-bold" style={{ fontSize: size * 0.26 }}>
        {value === null ? '—' : `${percent}`}
      </text>
    </svg>
    <div>
      <p className={`text-sm font-bold ${tone.text}`}>{value === null ? '評価はまだありません' : tone.label}</p>
      {caption ? <p className="mt-1 text-xs leading-5 text-[#8a9ab2]">{caption}</p> : null}
    </div>
  </div>;
}

/** 観点別のバー。5本を同じ軸で並べ、どの観点が弱いかを一目で見せる。 */
export function DimensionBars({ dimensions, labels = DIMENSION_LABELS }: { dimensions: Record<string, unknown>; labels?: Record<string, string> }) {
  const rows = Object.entries(labels)
    .map(([key, label]) => ({ key, label, value: Number(dimensions[key] ?? 0) }))
    .filter((row) => Number.isFinite(row.value));
  if (!rows.length) return null;
  return <ul className="space-y-2.5">
    {rows.map((row) => {
      const percent = Math.round(Math.max(0, Math.min(1, row.value)) * 100);
      const tone = band(row.value);
      return <li key={row.key} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3 text-sm">
        <span className="truncate text-[#52637d]">{row.label}</span>
        <span className="h-2.5 overflow-hidden rounded-full bg-[#edf2f2]">
          <span className="block h-full rounded-full" style={{ width: `${percent}%`, background: tone.stroke }} />
        </span>
        <span className="text-right font-bold tabular-nums text-[#52637d]">{percent}%</span>
      </li>;
    })}
  </ul>;
}

/** つまずきをタグで出す。本文に埋めると読み飛ばされる。 */
export function MisconceptionChips({ items }: { items: Array<Record<string, unknown>> }) {
  if (!items.length) return null;
  return <ul className="flex flex-wrap gap-2">
    {items.map((item, index) => <li key={index}
      className="rounded-full bg-[#fff0f1] px-3 py-1.5 text-xs font-bold text-[#8f3b46]"
      title={typeof item.evidence === 'string' ? item.evidence : undefined}>
      {String(item.label ?? item.code ?? '確認したい点')}
    </li>)}
  </ul>;
}

/** できた点・課題を、短い箇条書きのタグとして出す。 */
export function PointChips({ items, tone }: { items: string[]; tone: 'good' | 'attention' }) {
  if (!items.length) return null;
  const style = tone === 'good' ? 'bg-[#e8f8f3] text-[#1c6e60]' : 'bg-[#fff3df] text-[#8a5e12]';
  return <ul className="flex flex-wrap gap-2">
    {items.slice(0, 6).map((item, index) => <li key={index} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold leading-5 ${style}`}>{item}</li>)}
  </ul>;
}

/** 提出状況の帯。人数の内訳を色と数字の両方で出す。 */
export function ProgressBar({ counts }: { counts: { completed: number; inProgress: number; notStarted: number } }) {
  const total = counts.completed + counts.inProgress + counts.notStarted;
  if (!total) return null;
  const segments = [
    { key: 'completed', label: '完了', value: counts.completed, color: '#238878' },
    { key: 'inProgress', label: '進行中', value: counts.inProgress, color: '#3f7fd0' },
    { key: 'notStarted', label: '未着手', value: counts.notStarted, color: '#d5dee0' },
  ].filter((segment) => segment.value > 0);
  return <div>
    <div className="flex h-3 overflow-hidden rounded-full bg-[#edf2f2]">
      {segments.map((segment) => <span key={segment.key} style={{ width: `${(segment.value / total) * 100}%`, background: segment.color }} />)}
    </div>
    <ul className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-[#52637d]">
      {segments.map((segment) => <li key={segment.key} className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: segment.color }} />
        {segment.label} {segment.value}人
      </li>)}
    </ul>
  </div>;
}

/** 理解度の推移。直近が右。点が少ないうちは折れ線にせず、丸を並べる。 */
export function ScoreTrend({ points }: { points: Array<{ label: string; value: number | null }> }) {
  if (points.length < 2) return null;
  return <ul className="flex items-end gap-2 overflow-x-auto pb-1">
    {points.map((point, index) => {
      const percent = point.value === null ? 0 : Math.round(point.value * 100);
      const tone = band(point.value ?? 0);
      return <li key={index} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
        <span className="text-[11px] font-bold tabular-nums text-[#52637d]">{point.value === null ? '—' : `${percent}%`}</span>
        <span className="flex h-24 w-full items-end rounded-lg bg-[#f3f7f7]">
          <span className="w-full rounded-lg" style={{ height: `${Math.max(6, percent)}%`, background: tone.stroke }} />
        </span>
        <span className="w-full truncate text-center text-[10px] text-[#8a9ab2]" title={point.label}>{point.label}</span>
      </li>;
    })}
  </ul>;
}

/** 今後の学習。文章ではなく、順番のある短いカードで出す。 */
export function PlanTimeline({ tasks }: { tasks: Array<{ concept?: unknown; goal?: unknown; difficulty?: unknown; day?: unknown }> }) {
  if (!tasks.length) return null;
  return <ol className="space-y-2">
    {tasks.slice(0, 6).map((task, index) => <li key={index} className="flex gap-3 rounded-xl border border-[#e3eaee] p-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e8f8f3] text-xs font-bold text-[#1c6e60]">{index + 1}</span>
      <div className="min-w-0">
        <p className="truncate font-bold">{String(task.concept ?? '次のテーマ')}</p>
        <p className="mt-0.5 text-xs leading-5 text-[#60708d]">{String(task.goal ?? '')}</p>
      </div>
      {task.difficulty ? <span className="ml-auto shrink-0 self-start rounded-full bg-[#eff3f3] px-2 py-0.5 text-[11px] font-bold text-[#52637d]">Lv.{String(task.difficulty)}</span> : null}
    </li>)}
  </ol>;
}
