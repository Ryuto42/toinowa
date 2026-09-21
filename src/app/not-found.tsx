import Link from 'next/link';

export default function NotFound() {
  return <main className="flex min-h-screen items-center justify-center bg-[#fbfcfb] px-6 py-16 text-[#17233d]">
    <div className="w-full max-w-md rounded-[22px] border border-[#e3eaee] bg-white p-8 text-center">
      <p className="text-sm font-bold text-[#8a9ab2]">404</p>
      <h1 className="mt-2 text-2xl font-bold">ページが見つかりません</h1>
      <p className="mt-3 text-sm leading-7 text-[#60708d]">
        URLが変わったか、削除された可能性があります。アドレスをご確認ください。
      </p>
      <Link href="/" className="mt-6 inline-block rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800">
        トップへ戻る
      </Link>
    </div>
  </main>;
}
