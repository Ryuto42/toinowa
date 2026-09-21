import { requireRole } from '@/lib/auth/guard';
import { OpsAutoRefresh } from '@/components/teacher/ops-auto-refresh';
import { createClient } from '@/lib/database/server';
import { EmptyState, MetricCard, PageTitle, Panel } from '@/components/dashboard';
import { InterventionList } from '@/components/teacher/intervention-list';

export default async function InterventionsPage() {
  const context = await requireRole('teacher', 'admin');
  const { data } = await (await createClient()).from('escalations').select('*,users!escalations_student_id_fkey(display_name)').eq('tenant_id', context.tenantId).in('status', ['open', 'acknowledged']).order('created_at', { ascending: true });
  const rows = data ?? [];
  return <div><OpsAutoRefresh /><PageTitle title="要フォロー" description="安全上の懸念、継続する誤概念、学習停滞を優先度順に確認します。"/><div className="mb-6 grid gap-4 sm:grid-cols-4"><MetricCard label="緊急" value={rows.filter(v=>v.priority==='urgent').length} tone="rose"/><MetricCard label="高" value={rows.filter(v=>v.priority==='high').length} tone="rose"/><MetricCard label="中" value={rows.filter(v=>v.priority==='medium').length} tone="amber"/><MetricCard label="低" value={rows.filter(v=>v.priority==='low').length} tone="slate"/></div><Panel title="未対応">{rows.length?<InterventionList initial={rows}/>:<EmptyState>いま要フォローの生徒はいません</EmptyState>}</Panel></div>;
}
