import Link from 'next/link';
import { Icon } from '@/components/icon';

export default function NotFound() {
  return <main className="flex min-h-screen items-center justify-center bg-[#fbfcfb] px-6 py-16 text-[#17233d]">
    <div className="w-full max-w-lg rounded-[22px] border border-[#e3eaee] bg-white p-8">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eff3f3] text-[#52637d]">
        <Icon name="search_off" className="text-[26px]" />
      </span>
      <p className="mt-5 text-sm font-bold text-[#8a9ab2]">404</p>
      <h1 className="mt-1 text-2xl font-bold">ページが見つかりません</h1>
      <p className="mt-3 text-sm leading-7 text-[#60708d]">
        URLが変わったか、削除された可能性があります。リンクをたどって来た場合は、学校の管理者にご連絡ください。
      </p>
      <Link href="/" className="mt-6 inline-block rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800">
        自分のホームへ戻る
      </Link>
    </div>
  </main>;
}
