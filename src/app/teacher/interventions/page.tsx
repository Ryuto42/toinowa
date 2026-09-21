import { requireRole } from '@/lib/auth/guard';
import { OpsAutoRefresh } from '@/components/teacher/ops-auto-refresh';
import { createClient } from '@/lib/database/server';
import { EmptyState, MetricCard, PageTitle, Panel } from '@/components/dashboard';
import { InterventionList } from '@/components/teacher/intervention-list';
import { GuardEventFeed } from '@/components/guard-event-feed';
import { recentGuardEvents } from '@/lib/security/guard-feed';

export default async function InterventionsPage() {
  const context = await requireRole('teacher', 'admin');
  const db = await createClient();
  const { data } = await db.from('escalations').select('*,users!escalations_student_id_fkey(display_name)').eq('tenant_id', context.tenantId).in('status', ['open', 'acknowledged']).order('created_at', { ascending: true });
  const rows = data ?? [];
  // RLS で絞られた在籍から担当生徒を取り、その範囲の遮断記録だけを出す。
  const { data: enrollments } = await db.from('enrollments').select('user_id').eq('tenant_id', context.tenantId).eq('role', 'student').eq('active', true);
  const studentIds = context.role === 'admin' ? null : [...new Set((enrollments ?? []).map((row) => row.user_id))];
  const guardEvents = await recentGuardEvents(context.tenantId, studentIds);

  return <div>
    <OpsAutoRefresh />
    <PageTitle title="要フォロー" description="安全上の懸念、継続する誤概念、学習停滞を優先度順に確認します。" />
    <div className="mb-6 grid gap-4 sm:grid-cols-4">
      <MetricCard label="緊急" value={rows.filter(v => v.priority === 'urgent').length} tone="rose" />
      <MetricCard label="高" value={rows.filter(v => v.priority === 'high').length} tone="rose" />
      <MetricCard label="中" value={rows.filter(v => v.priority === 'medium').length} tone="amber" />
      <MetricCard label="低" value={rows.filter(v => v.priority === 'low').length} tone="slate" />
    </div>
    <Panel>{rows.length ? <InterventionList initial={rows} /> : <EmptyState>いま要フォローの生徒はいません</EmptyState>}</Panel>
    <div className="mt-6">
      <Panel title="安全性・相談の記録" description="相談への対応と言葉遣いへの注意、危険な指示の遮断を区別して表示します。対応が必要な相談は要フォローも確認してください。">
        <GuardEventFeed rows={guardEvents} />
      </Panel>
    </div>
  </div>;
}
