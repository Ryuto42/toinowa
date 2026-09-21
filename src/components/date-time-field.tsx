'use client';

import { useEffect, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { ja } from 'react-day-picker/locale';
import 'react-day-picker/style.css';

const TIME_PRESETS = ['17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function pad(value: number): string { return String(value).padStart(2, '0'); }
function toDateKey(date: Date): string { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }

/** `YYYY-MM-DD` を現地時間の Date にする。`new Date('2026-01-05')` は UTC 解釈になり1日ずれる。 */
function fromDateKey(key: string): Date | undefined {
  const parts = key.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return undefined;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function label(value: string): string {
  const [datePart, timePart] = value.split('T');
  const date = fromDateKey(datePart ?? '');
  if (!date || !timePart) return '';
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${WEEKDAYS[date.getDay()]}) ${timePart}`;
}

/**
 * 期限の入力。
 *
 * <input type="datetime-local"> はブラウザごとに見た目も操作も違い、
 * 「今日から何日後か」が読み取れない。カレンダーで日を選び、
 * よく使う時刻を並べて1〜2タップで決められるようにする。
 *
 * 値の形式は datetime-local と同じ `YYYY-MM-DDTHH:mm` のまま扱う。
 * 送信側（new Date(value).toISOString()）を変えずに差し替えられる。
 */
export function DateTimeField({ value, onChange, disabled, required, placeholder = '日付と時刻を選ぶ' }: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(new Date());
  const wrapper = useRef<HTMLDivElement>(null);
  const [datePart, timePart] = value ? value.split('T') : ['', ''];
  const selected = datePart ? fromDateKey(datePart) : undefined;
  const time = timePart || '19:00';

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) { if (event.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onPointerDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function pick(date: Date | undefined, nextTime = time) {
    if (!date) return;
    onChange(`${toDateKey(date)}T${nextTime}`);
  }
  function shiftDays(days: number) {
    const base = new Date();
    base.setDate(base.getDate() + days);
    pick(base);
  }

  const text = label(value);

  return <div ref={wrapper} className="relative mt-2">
    <button type="button" disabled={disabled}
      onClick={() => { if (!open && selected) setMonth(selected); setOpen((current) => !current); }}
      aria-haspopup="dialog" aria-expanded={open}
      className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-white px-3 py-3 text-left text-sm font-normal transition disabled:opacity-50 ${
        open ? 'border-emerald-600 ring-4 ring-emerald-100' : 'border-slate-300 hover:border-emerald-400'}`}>
      <span className={text ? 'text-slate-900' : 'text-slate-400'}>{text || placeholder}</span>
      <span aria-hidden="true" className="text-slate-400">▾</span>
    </button>
    {/* フォーム側の required 判定を壊さないよう、実際の値は隠し入力で持つ */}
    <input type="hidden" value={value} required={required} readOnly />

    {open ? <div role="dialog" aria-label="期限を選ぶ"
      className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[min(22rem,calc(100vw-3rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.45)]">
      <div className="flex flex-wrap gap-2">
        {[['今日', 0], ['明日', 1], ['1週間後', 7]].map(([name, days]) => <button key={name as string} type="button"
          onClick={() => shiftDays(days as number)}
          className="rounded-full border border-slate-300 px-3 py-1 text-xs font-bold text-slate-600 transition hover:border-emerald-500 hover:text-emerald-800">
          {name as string}
        </button>)}
      </div>

      <div className="mt-3"
        style={{
          '--rdp-accent-color': '#047857',
          '--rdp-accent-background-color': '#ecfdf5',
          '--rdp-today-color': '#047857',
          '--rdp-day-height': '2.25rem',
          '--rdp-day-width': '2.25rem',
        } as React.CSSProperties}>
        <DayPicker
          mode="single" locale={ja} showOutsideDays
          selected={selected} onSelect={(date) => pick(date)}
          month={month} onMonthChange={setMonth}
          disabled={{ before: new Date() }}
          className="text-sm"
        />
      </div>

      <div className="mt-2 border-t border-slate-200 pt-3">
        <p className="text-xs font-bold text-slate-500">時刻</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TIME_PRESETS.map((preset) => <button key={preset} type="button"
            onClick={() => { if (selected) pick(selected, preset); else onChange(`${toDateKey(new Date())}T${preset}`); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              time === preset ? 'bg-emerald-700 text-white' : 'border border-slate-300 text-slate-600 hover:border-emerald-500'}`}>
            {preset}
          </button>)}
          <input type="time" value={time} aria-label="時刻を直接入力"
            onChange={(event) => { if (event.target.value) pick(selected ?? new Date(), event.target.value); }}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
        </div>
      </div>

      <div className="mt-4 flex justify-between">
        <button type="button" onClick={() => { onChange(''); setOpen(false); }}
          className="text-xs font-bold text-slate-500 hover:text-slate-800">クリア</button>
        <button type="button" onClick={() => setOpen(false)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white">決定</button>
      </div>
    </div> : null}
  </div>;
}
