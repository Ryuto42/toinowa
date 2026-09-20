import { requireRole } from '@/lib/auth/guard';
import { visibleApprovals } from '@/lib/approvals/scope';
import { ApprovalQueue } from '@/components/teacher/approval-queue';
import { PageTitle } from '@/components/dashboard';
export default async function ApprovalsPage() {
  const context = await requireRole('teacher', 'admin');
  return <div><PageTitle title="確認が必要な提案" description="担当生徒の分析や次のお題を確認してください。" /><ApprovalQueue initial={await visibleApprovals(context)} /></div>;
}
