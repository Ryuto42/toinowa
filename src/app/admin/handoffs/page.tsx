import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { EmptyState, MetricCard, PageTitle, Panel } from '@/components/dashboard';
import { HandoffList } from '@/components/teacher/handoff-list';

export default async function AdminHandoffsPage() {
  const context = await requireRole('admin');
  const db = await createClient();
  const [handoffs, users] = await Promise.all([
    db.from('handoffs').select('*').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }).limit(100),
    db.from('users').select('id,display_name').eq('tenant_id', context.tenantId),
  ]);
  const rows = handoffs.data ?? [];
  const names = Object.fromEntries((users.data ?? []).map((user) => [user.id, user.display_name]));
  const pending = rows.filter((row) => row.status === 'pending');
  const settled = rows.filter((row) => row.status !== 'pending');

  return <div>
    <PageTitle title="引き継ぎ"
      description="先生から先生へ渡された生徒の申し送りを、学校全体で確認します。" />

    <div className="mb-6 grid gap-4 sm:grid-cols-3">
      <MetricCard label="受け取り待ち" value={pending.length} tone={pending.length ? 'amber' : 'emerald'} note="相手の返事を待っています" />
      <MetricCard label="引き継ぎ済み" value={rows.filter((row) => row.status === 'accepted').length} note="受け取られた件数" />
      <MetricCard label="見送り・取り下げ" value={rows.filter((row) => row.status === 'declined' || row.status === 'cancelled').length} tone="slate" />
    </div>

    <Panel title="受け取り待ち" description="長く止まっている引き継ぎは、担当の割り当てを見直してください">
      {pending.length
        ? <HandoffList initial={pending} mode="admin" names={names} />
        : <EmptyState>受け取り待ちの引き継ぎはありません</EmptyState>}
    </Panel>

    <div className="mt-6">
      <Panel title="これまでの引き継ぎ" description="直近100件">
        {settled.length
          ? <HandoffList initial={settled} mode="admin" names={names} />
          : <EmptyState>完了した引き継ぎはまだありません</EmptyState>}
      </Panel>
    </div>
  </div>;
}
