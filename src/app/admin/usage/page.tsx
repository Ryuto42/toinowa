import { requireRole } from '@/lib/auth/guard';
import { PageTitle } from '@/components/dashboard';
import { UsageMonitor } from '@/components/admin/usage-monitor';
export default async function UsagePage() {
  await requireRole('admin');
  return <div><PageTitle title="AI利用状況" description="誰が、どのモデルを、どれくらい使ったかを確認できます。" /><UsageMonitor /></div>;
}
