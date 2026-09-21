import Link from 'next/link';
import { requireRole } from '@/lib/auth/guard';
import { PageTitle } from '@/components/dashboard';
import { UsageMonitor } from '@/components/admin/usage-monitor';
import { ModelStatus } from './model-status';

export default async function UsagePage() {
  await requireRole('admin');
  return <div>
    <PageTitle
      title="AI利用状況"
      description="誰が、どのモデルを、どれくらい使ったかを確認できます。"
      action={<Link href="/admin/usage/security" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700">安全性イベント</Link>}
    />
    <UsageMonitor modelStatus={<ModelStatus />} />
  </div>;
}
