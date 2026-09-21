/**
 * トップページの機能紹介。
 *
 * 画面写真は撮り直しの手間と、生徒の実データが写る問題がある。
 * ここも実際の配色・部品に合わせて組んだ表示専用の図。
 */

function Frame({ children }: { children: React.ReactNode }) {
  return <div aria-hidden="true"
    className="select-none rounded-2xl border border-[#e9edf2] bg-white p-5 shadow-[0_20px_50px_-34px_rgba(23,35,61,0.5)]">
    {children}
  </div>;
}

/** 授業メモ1つから、生徒ごとの課題が並ぶまで。 */
function ShotPlanning() {
  const drafts: Array<[string, string]> = [
    ['佐藤 みなみ', '傾きが負のとき、グラフはどうなる？'],
    ['田中 りく', '傾きと切片のちがいを説明して'],
    ['鈴木 かえで', '式からグラフを描く手順は？'],
  ];
  return <Frame>
    <p className="text-[0.6rem] font-bold text-[#8090a5]">先生が渡した授業メモ</p>
    <p className="mt-2 rounded-xl bg-[#f6f8fa] p-3 text-[0.72rem] leading-6 text-slate-700">
      今日は一次関数の傾きと切片。式からグラフを描く練習をした。文章題はまだ。
    </p>
    <div className="my-3 flex items-center gap-2">
      <span className="h-px flex-1 bg-[#e9edf2]" />
      <span className="rounded-full bg-[#e8f8f3] px-2.5 py-1 text-[0.6rem] font-bold text-[#217d6e]">AIが生徒ごとに用意</span>
      <span className="h-px flex-1 bg-[#e9edf2]" />
    </div>
    <div className="space-y-2">
      {drafts.map(([name, task]) => <div key={name} className="flex items-center gap-3 rounded-xl border border-[#eef1f5] px-3 py-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#def3ed] text-[0.6rem] font-bold text-[#217d6e]">{name.charAt(0)}</span>
        <div className="min-w-0">
          <p className="truncate text-[0.6rem] text-[#8090a5]">{name}</p>
          <p className="truncate text-[0.72rem] font-semibold text-[#17233d]">{task}</p>
        </div>
      </div>)}
    </div>
  </Frame>;
}

/** 配信前の確認カード。 */
function ShotReview() {
  return <Frame>
    <div className="rounded-xl border border-[#eef1f5] p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-[#edf2ff] px-2.5 py-1 text-[0.6rem] font-bold text-[#5865ba]">先生の確認待ち</span>
        <span className="rounded-full bg-[#f1f5f9] px-2.5 py-1 text-[0.6rem] font-bold text-[#64748b]">Lv.2</span>
        <span className="ml-auto text-[0.75rem] text-[#a6b0c0]">✎　🗑</span>
      </div>
      <p className="mt-3 text-[0.88rem] font-bold leading-6 text-[#17233d]">傾きが負のとき、グラフはどうなる？</p>
      <p className="mt-2 text-[0.65rem] text-[#8090a5]">2年B組・9名　期限 9/28 18:00</p>
      <button type="button" tabIndex={-1} aria-hidden="true"
        className="mt-4 w-full rounded-xl bg-emerald-700 py-2.5 text-[0.75rem] font-bold text-white">確認して配信</button>
    </div>
    <p className="mt-3 text-center text-[0.65rem] text-[#8090a5]">押すまで、生徒の画面には出ません</p>
  </Frame>;
}

/** 声で説明しているところ。 */
function ShotVoice() {
  const bars = [30, 62, 44, 88, 56, 74, 38, 66, 48, 82, 34, 58];
  return <Frame>
    <div className="space-y-2">
      <p className="max-w-[85%] rounded-2xl rounded-tl-md bg-slate-100 px-3 py-2 text-[0.72rem] leading-6 text-slate-700">
        傾きって、何を表している数なの？
      </p>
      <p className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-emerald-700 px-3 py-2 text-[0.72rem] leading-6 text-white">
        横に1進んだとき、縦がどれだけ増えるか…
      </p>
    </div>
    <div className="mt-4 flex items-center gap-3 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
          <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      </span>
      <span className="flex h-6 flex-1 items-center gap-[0.15rem]">
        {bars.map((height, index) => <span key={index} className="flex-1 rounded-full bg-emerald-400" style={{ height: `${height}%` }} />)}
      </span>
      <span className="shrink-0 text-[0.62rem] font-bold text-emerald-700">書き起こし中</span>
    </div>
  </Frame>;
}

/** 説明のあとに残る根拠。 */
function ShotEvidence() {
  const dimensions: Array<[string, number]> = [['概念の定義', 82], ['論理のつながり', 64], ['具体例', 45]];
  return <Frame>
    <div className="flex items-center justify-between">
      <p className="text-[0.62rem] font-bold text-[#8090a5]">この説明の評価</p>
      <span className="rounded-full bg-[#e8f8f3] px-2.5 py-1 text-[0.6rem] font-bold text-[#217d6e]">本人の説明とみられます</span>
    </div>
    <p className="mt-2 text-2xl font-bold tabular-nums text-[#17233d]">72<span className="ml-0.5 text-sm text-[#8090a5]">点</span></p>
    <div className="mt-3 space-y-2">
      {dimensions.map(([label, value]) => <div key={label} className="flex items-center gap-3">
        <span className="w-24 shrink-0 text-[0.65rem] text-[#69748b]">{label}</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#edf2f2]">
          <span className="block h-full rounded-full bg-[#238878]" style={{ width: `${value}%` }} />
        </span>
      </div>)}
    </div>
    <div className="mt-4 rounded-xl bg-[#f6f8fa] p-3">
      <p className="text-[0.62rem] font-bold text-[#8a5e12]">次に確認したいこと</p>
      <p className="mt-1.5 text-[0.7rem] leading-6 text-slate-700">
        「傾きが負のとき」の説明で言いよどみがありました。具体例を1つ挙げてもらうと確かめられます。
      </p>
    </div>
  </Frame>;
}

export const LANDING_FEATURES: Array<{ title: string; body: string; shot: () => React.ReactElement }> = [
  {
    title: '授業メモひとつで、生徒ごとの課題ができる',
    body: '教えた内容を書くか、資料を選ぶだけ。過去の説明と模試の結果から、その生徒に合った問いをAIが用意します。全員分の問題文を考える必要はありません。',
    shot: ShotPlanning,
  },
  {
    title: '配信するかどうかは、先生が決める',
    body: 'AIが作るのは候補まで。文面と期限を確認して押すまで、生徒の画面には出ません。次々に自動配信する作りにはしていません。',
    shot: ShotReview,
  },
  {
    title: '書くのが苦手でも、声で説明できる',
    body: 'マイクを押して話すだけで、その場で会話に書き起こされます。人に教えるつもりで声に出すと、自分がどこで詰まるのかがはっきりします。',
    shot: ShotVoice,
  },
  {
    title: '「なんとなく理解している」で終わらせない',
    body: '観点ごとの理解度と、そう判断した根拠の発言が残ります。言いよどみや書く速さから、本人の言葉かどうかの手がかりも添えます。',
    shot: ShotEvidence,
  },
];
