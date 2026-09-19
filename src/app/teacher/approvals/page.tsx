import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { PageTitle, Panel } from '@/components/dashboard';
import { ApprovalQueue } from '@/components/teacher/approval-queue';

export default async function ApprovalsPage() {
  const context = await requireRole('teacher','admin');
  const { data } = await (await createClient()).from('approvals').select('*').eq('tenant_id',context.tenantId).is('decision',null).order('created_at');
  return <div><PageTitle eyebrow="Human in the Loop" title="AI提案の承認" description="教材公開、一斉配信、低確信度評価など、影響が大きい操作は先生が最終判断します。"/><Panel title="確認待ち"><ApprovalQueue initial={data??[]}/></Panel></div>;
}
