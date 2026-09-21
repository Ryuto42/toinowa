/** 読み込み中の骨組み。実際の画面と同じ配置にして、出来上がったときに位置が飛ばないようにする。 */
export function PageSkeleton({ metrics = 4, rows = 6 }: { metrics?: number; rows?: number }) {
  return <div aria-busy="true" aria-live="polite">
    <span className="sr-only">読み込んでいます</span>
    <div className="mb-8">
      <div className="skeleton h-9 w-56" />
      <div className="skeleton mt-3 h-4 w-80 max-w-full" />
    </div>
    {metrics ? <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: metrics }).map((_, index) => <div key={index} className="skeleton h-24 rounded-[18px]" />)}
    </div> : null}
    <div className="rounded-[22px] border border-[#e3eaee] bg-white p-7">
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="skeleton h-10 w-64 max-w-full" />
        <div className="skeleton h-10 w-32" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => <div key={index}
          className="skeleton h-12"
          // 下の行ほど薄くして、続きがあることを示す
          style={{ opacity: 1 - index * (0.6 / Math.max(rows, 1)) }} />)}
      </div>
    </div>
  </div>;
}
