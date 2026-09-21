'use client';

import { useMemo, useState } from 'react';

export interface DataColumn<T> {
  key: string;
  label: string;
  /** 並べ替えの基準。省略した列は並べ替えできない。 */
  sortBy?: (row: T) => string | number | null;
  render: (row: T) => React.ReactNode;
  align?: 'left' | 'right';
  /** 狭い画面では隠す列。主要な情報には付けない。 */
  hideOnMobile?: boolean;
}

export interface DataFilter<T> {
  key: string;
  label: string;
  /** 先頭に「すべて」を出す。value が '' のときは絞り込まない。 */
  options: { value: string; label: string }[];
  match: (row: T, value: string) => boolean;
  /** 初期値。既定は '' （すべて）。 */
  initial?: string;
}

type Direction = 'asc' | 'desc';

const controlClass = 'h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100';

function compare(a: string | number | null, b: string | number | null): number {
  if (a === null && b === null) return 0;
  // 値が無い行は、昇順・降順のどちらでも末尾に置く。並べ替えるたびに
  // 空欄が先頭へ来ると、一覧の見え方が落ち着かない。
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'ja');
}

/**
 * 一覧の共通表示。検索・絞り込み・並べ替えを同じ操作でできるようにする。
 *
 * 行の描画はページ側の関数に任せる（リンクや状態バッジは一覧ごとに違うため）。
 * サーバーコンポーネントからは関数を渡せないので、使う側はクライアント側に置く。
 */
export function DataTable<T>({
  rows, columns, getKey, searchIn, searchPlaceholder = '名前などで検索', filters = [],
  initialSort, empty = '該当する項目はありません', unit = '件', toolbar, renderCard,
}: {
  rows: T[];
  /** カード表示のときは、並べ替えの選択肢としてだけ使う。 */
  columns: DataColumn<T>[];
  getKey: (row: T) => string;
  /** 検索対象の文字列。複数の列をまとめて返してよい。 */
  searchIn?: (row: T) => string;
  searchPlaceholder?: string;
  filters?: DataFilter<T>[];
  initialSort?: { key: string; direction?: Direction };
  empty?: string;
  unit?: string;
  toolbar?: React.ReactNode;
  /** 渡すと表ではなくカードで並べる。件数が少なく、1件ずつ読ませたい一覧向け。 */
  renderCard?: (row: T) => React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>(
    () => Object.fromEntries(filters.map((filter) => [filter.key, filter.initial ?? ''])),
  );
  const [sort, setSort] = useState<{ key: string; direction: Direction } | null>(
    initialSort ? { key: initialSort.key, direction: initialSort.direction ?? 'asc' } : null,
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let result = rows.filter((row) => {
      for (const filter of filters) {
        const value = selected[filter.key] ?? '';
        if (value && !filter.match(row, value)) return false;
      }
      if (!needle || !searchIn) return true;
      return searchIn(row).toLowerCase().includes(needle);
    });
    const column = sort ? columns.find((item) => item.key === sort.key) : null;
    if (sort && column?.sortBy) {
      const by = column.sortBy;
      result = [...result].sort((a, b) => (sort.direction === 'asc' ? 1 : -1) * compare(by(a), by(b)));
    }
    return result;
    // filters/columns は描画ごとに新しい配列になるため依存に入れない（入れると毎回再計算になる）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, selected, sort]);

  const sortable = columns.filter((column) => column.sortBy);

  function toggleSort(key: string) {
    setSort((current) => current?.key === key
      ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' });
  }

  return <div>
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {searchIn ? <input
        type="search" value={query} onChange={(event) => setQuery(event.target.value)}
        placeholder={searchPlaceholder} aria-label={searchPlaceholder}
        className={`${controlClass} min-w-0 flex-1 sm:max-w-xs`}
      /> : null}
      {filters.map((filter) => <label key={filter.key} className="text-xs font-bold text-slate-500">
        <span className="sr-only">{filter.label}</span>
        <select
          value={selected[filter.key] ?? ''} aria-label={filter.label}
          onChange={(event) => setSelected((current) => ({ ...current, [filter.key]: event.target.value }))}
          className={controlClass}
        >
          <option value="">{filter.label}：すべて</option>
          {filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>)}
      {/* カードには見出し行が無いので、並べ替えはプルダウンで出す。 */}
      {renderCard && sortable.length ? <label className="text-xs font-bold text-slate-500">
        <span className="sr-only">並べ替え</span>
        <select value={sort ? `${sort.key}:${sort.direction}` : ''} aria-label="並べ替え"
          onChange={(event) => {
            const [key, direction] = event.target.value.split(':');
            setSort(key ? { key, direction: direction as Direction } : null);
          }}
          className={controlClass}
        >
          {sortable.flatMap((column) => [
            <option key={`${column.key}:asc`} value={`${column.key}:asc`}>{column.label}（昇順）</option>,
            <option key={`${column.key}:desc`} value={`${column.key}:desc`}>{column.label}（降順）</option>,
          ])}
        </select>
      </label> : null}
      {toolbar}
      <p className="ml-auto text-sm text-slate-500" role="status">
        {visible.length === rows.length ? `${rows.length}${unit}` : `${visible.length}${unit} / 全${rows.length}${unit}`}
      </p>
    </div>

    {visible.length && renderCard ? <div className="space-y-3">
      {visible.map((row) => <div key={getKey(row)}>{renderCard(row)}</div>)}
    </div> : null}

    {visible.length && !renderCard ? <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-slate-500">
          <tr className="border-b border-slate-200">
            {columns.map((column) => {
              const active = sort?.key === column.key;
              return <th key={column.key} scope="col"
                aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                className={`whitespace-nowrap py-2 pr-4 font-semibold ${column.align === 'right' ? 'text-right' : ''} ${column.hideOnMobile ? 'hidden sm:table-cell' : ''}`}>
                {column.sortBy
                  ? <button type="button" onClick={() => toggleSort(column.key)}
                      className="inline-flex items-center gap-1 font-semibold text-slate-500 hover:text-[#237d75]">
                      {column.label}
                      <span aria-hidden="true" className={active ? 'text-[#237d75]' : 'text-slate-300'}>
                        {active && sort.direction === 'desc' ? '▼' : '▲'}
                      </span>
                    </button>
                  : column.label}
              </th>;
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {visible.map((row) => <tr key={getKey(row)}>
            {columns.map((column) => <td key={column.key}
              className={`py-3 pr-4 align-middle ${column.align === 'right' ? 'text-right tabular-nums' : ''} ${column.hideOnMobile ? 'hidden sm:table-cell' : ''}`}>
              {column.render(row)}
            </td>)}
          </tr>)}
        </tbody>
      </table>
    </div> : null}

    {visible.length ? null : <p className="rounded-xl bg-[#f7faf9] p-6 text-center text-sm text-slate-500">{empty}</p>}
  </div>;
}
