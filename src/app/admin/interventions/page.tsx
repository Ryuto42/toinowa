import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { EmptyState, MetricCard, PageTitle, Panel } from '@/components/dashboard';
import { InterventionList } from '@/components/teacher/intervention-list';

export default async function AdminInterventionsPage() {
  const context = await requireRole('admin');
  const { data, error } = await (await createClient())
    .from('escalations')
    .select('*,users!escalations_student_id_fkey(display_name)')
    .eq('tenant_id', context.tenantId)
    .in('status', ['open', 'acknowledged'])
    .order('priority')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const byKind = (kind: string) => rows.filter((row) => row.kind === kind).length;

  return <div>
    <PageTitle title="要フォロー" />
    <p className="-mt-6 mb-8 text-sm text-[#60708d]">
      安全上の懸念、生成AIの疑い、繰り返すつまずき、学習停滞をまとめて確認します。
    </p>
    <div className="mb-6 grid gap-4 sm:grid-cols-4">
      <MetricCard label="緊急" value={rows.filter((row) => row.priority === 'urgent').length}
        tone="rose" note="安全上の懸念" />
      <MetricCard label="生成AIの疑い" value={byKind('ai_suspected')}
        tone={byKind('ai_suspected') ? 'amber' : 'emerald'} note="要確認の提出" />
      <MetricCard label="繰り返すつまずき" value={byKind('repeated_failure')}
        tone={byKind('repeated_failure') ? 'amber' : 'emerald'} note="同じ誤概念が継続" />
      <MetricCard label="学習停滞" value={byKind('stalled')}
        tone="slate" note="未着手・途中で停止" />
    </div>
    <Panel>
      {rows.length ? <InterventionList initial={rows} studentBase="/admin/students" /> : <EmptyState>いま要フォローの生徒はいません</EmptyState>}
    </Panel>
  </div>;
}
