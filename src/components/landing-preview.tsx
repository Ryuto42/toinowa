import Image from 'next/image';

/**
 * トップページのヒーローに置く画面イメージ。
 *
 * 実画面のスクリーンショットは撮り直しの手間と、生徒の実データが写る問題がある。
 * ここは実際の配色・導線に合わせて組んだ表示専用のモック。
 * 読み上げには出さない（aria-hidden）。
 */

const NAV = ['ダッシュボード', '課題', '生徒', '要フォロー'];
const STATS: Array<[string, string]> = [['今週の提出', '18'], ['確認待ち', '3'], ['要フォロー', '2']];
const ROWS: Array<[string, string, string]> = [
  ['係り結びの法則', '3年A組・12名', '配信済み'],
  ['一次関数の傾き', '2年B組・9名', '確認待ち'],
  ['現在完了と過去形', '3年A組・12名', '確認待ち'],
  ['植物細胞と動物細胞', '2年B組・9名', '配信済み'],
];

export function LandingPreview() {
  return <div aria-hidden="true" className="relative select-none pb-0 sm:pb-24 lg:pb-8">
    {/* PC：先生のダッシュボード */}
    <div className="lp-in overflow-hidden rounded-2xl border border-[#e3e7ee] bg-white shadow-[0_30px_80px_-40px_rgba(23,35,61,0.45)]"
      style={{ '--lp-delay': '340ms' } as React.CSSProperties}>
      <div className="flex items-center gap-1.5 border-b border-[#eef1f5] bg-[#f8fafb] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
      </div>
      <div className="grid grid-cols-[104px_1fr] sm:grid-cols-[132px_1fr]">
        <div className="border-r border-[#d8ebe6] bg-[#def3ed] px-2.5 py-4 sm:px-3">
          <div className="flex items-center gap-1.5 px-1">
            <Image src="/brand/logo.png" alt="" width={20} height={20} className="shrink-0" unoptimized />
            <span className="truncate text-[10px] font-bold text-[#17233d]">先生モード</span>
          </div>
          <div className="mt-4 space-y-1">
            {NAV.map((item, index) => <p key={item}
              className={`truncate rounded-lg px-2 py-1.5 text-[10px] font-semibold ${index === 0 ? 'bg-white text-slate-900 shadow-sm' : 'text-[#527b78]'}`}>
              {item}
            </p>)}
          </div>
        </div>

        <div className="min-w-0 px-4 py-4 sm:px-6 sm:py-5">
          <p className="text-[13px] font-bold text-[#17233d] sm:text-base">ダッシュボード</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {STATS.map(([label, value]) => <div key={label} className="rounded-lg border border-[#eef1f5] px-2 py-2 sm:px-3">
              <p className="truncate text-[9px] text-[#8090a5]">{label}</p>
              <p className="mt-0.5 text-base font-bold tabular-nums text-[#17233d] sm:text-lg">{value}</p>
            </div>)}
          </div>
          <div className="mt-3 rounded-xl border border-[#eef1f5]">
            {ROWS.map(([title, meta, state], index) => <div key={title}
              className={`flex items-center justify-between gap-2 px-3 py-2.5 ${index ? 'border-t border-[#f2f5f8]' : ''}`}>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-[#17233d]">{title}</p>
                <p className="truncate text-[9px] text-[#8090a5]">{meta}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${state === '確認待ち' ? 'bg-[#fff3df] text-[#a36b22]' : 'bg-[#e8f8f3] text-[#217d6e]'}`}>{state}</span>
            </div>)}
          </div>
          <div className="mt-3 hidden rounded-xl border border-[#eef1f5] px-3 py-2.5 sm:block">
            <p className="text-[9px] text-[#8090a5]">クラスの理解度</p>
            <div className="mt-2 flex h-9 items-end gap-1.5">
              {[38, 52, 46, 64, 58, 76, 70, 88].map((height, index) => <span key={index}
                className="flex-1 rounded-sm bg-[#8ed3c6]" style={{ height: `${height}%` }} />)}
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* スマホ：生徒がAIに説明しているところ */}
    {/* 狭い画面では重ねると一覧が読めなくなるので、PC側だけ見せる */}
    <div
      className="lp-in absolute -bottom-4 right-0 hidden w-[176px] rounded-[2.2rem] bg-[#1b2333] p-[0.28rem] shadow-[0_28px_70px_-22px_rgba(15,23,42,0.55)] sm:block lg:-bottom-12 lg:-right-5 lg:w-[188px]"
      style={{ '--lp-delay': '520ms' } as React.CSSProperties}
    >
      <div className="relative flex aspect-[9/19] flex-col overflow-hidden rounded-[1.95rem] bg-[#fbfcfb]">
        {/* ダイナミックアイランド */}
        <div className="absolute left-1/2 top-[0.45rem] z-10 h-[0.95rem] w-[3.1rem] -translate-x-1/2 rounded-full bg-[#1b2333]" />

        {/* ステータスバー */}
        <div className="flex items-center justify-between px-4 pb-1 pt-[0.6rem] text-[0.5rem] font-bold text-[#17233d]">
          <span className="tabular-nums">9:41</span>
          <span className="flex items-center gap-[0.15rem]">
            <svg viewBox="0 0 16 12" className="h-[0.5rem] w-[0.7rem]" fill="currentColor"><rect x="0" y="8" width="2.4" height="4" rx="0.6" /><rect x="4" y="5.5" width="2.4" height="6.5" rx="0.6" /><rect x="8" y="3" width="2.4" height="9" rx="0.6" /><rect x="12" y="0.5" width="2.4" height="11.5" rx="0.6" /></svg>
            <svg viewBox="0 0 16 12" className="h-[0.5rem] w-[0.7rem]" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M1 4.2a10 10 0 0 1 14 0M3.6 6.9a6.3 6.3 0 0 1 8.8 0" /><circle cx="8" cy="9.8" r="0.9" fill="currentColor" stroke="none" /></svg>
            <span className="ml-[0.1rem] flex h-[0.52rem] w-[0.95rem] items-center rounded-[0.15rem] border border-current px-[0.07rem]"><span className="h-[0.26rem] w-[0.62rem] rounded-[0.05rem] bg-current" /></span>
          </span>
        </div>

        <div className="flex items-center justify-between border-b border-[#eef1f5] bg-white px-3 py-2">
          <span className="text-[0.62rem] font-bold text-[#17233d]">一次関数の傾き</span>
          <span className="rounded-full bg-[#e8f8f3] px-1.5 py-0.5 text-[0.5rem] font-bold text-[#217d6e]">説明中</span>
        </div>
        <div className="flex-1 space-y-2 overflow-hidden px-3 py-3">
          <p className="max-w-[88%] rounded-2xl rounded-tl-md bg-slate-100 px-2.5 py-2 text-[0.56rem] leading-[1.5] text-slate-700">
            今日は何を教えてくれるの？
          </p>
          <p className="ml-auto max-w-[88%] rounded-2xl rounded-tr-md bg-emerald-700 px-2.5 py-2 text-[0.56rem] leading-[1.5] text-white">
            一次関数の傾きについて説明するね
          </p>
          <p className="max-w-[88%] rounded-2xl rounded-tl-md bg-slate-100 px-2.5 py-2 text-[0.56rem] leading-[1.5] text-slate-700">
            傾きって、何を表している数なの？
          </p>
          <p className="ml-auto max-w-[88%] rounded-2xl rounded-tr-md bg-emerald-700 px-2.5 py-2 text-[0.56rem] leading-[1.5] text-white">
            横に1進んだとき、縦がどれだけ増えるかだよ
          </p>
          <p className="max-w-[88%] rounded-2xl rounded-tl-md bg-slate-100 px-2.5 py-2 text-[0.56rem] leading-[1.5] text-slate-700">
            じゃあ、傾きがマイナスのときは？
          </p>
          <p className="ml-auto max-w-[88%] rounded-2xl rounded-tr-md bg-emerald-700 px-2.5 py-2 text-[0.56rem] leading-[1.5] text-white">
            えっと…横に進むと、下がっていく
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 pb-2">
          <span className="h-7 flex-1 rounded-full bg-white shadow-[inset_0_0_0_1px_#e6ebf0]" />
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </span>
        </div>
        {/* ホームインジケータ */}
        <div className="flex justify-center pb-[0.4rem]"><span className="h-[0.16rem] w-[5rem] rounded-full bg-[#17233d]/25" /></div>
      </div>
    </div>
  </div>;
}
