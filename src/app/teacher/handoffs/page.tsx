import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { EmptyState, MetricCard, PageTitle, Panel } from '@/components/dashboard';
import { HandoffList } from '@/components/teacher/handoff-list';

export default async function TeacherHandoffsPage() {
  const context = await requireRole('teacher', 'admin');
  const db = await createClient();
  // RLS で当事者の行しか返らないので、受信・送信はアプリ側で分ける。
  const [handoffs, users] = await Promise.all([
    db.from('handoffs').select('*').eq('tenant_id', context.tenantId).order('created_at', { ascending: false }),
    db.from('users').select('id,display_name').eq('tenant_id', context.tenantId),
  ]);
  const rows = handoffs.data ?? [];
  const names = Object.fromEntries((users.data ?? []).map((user) => [user.id, user.display_name]));
  const inbox = rows.filter((row) => row.to_user === context.userId);
  const outbox = rows.filter((row) => row.from_user === context.userId);
  const waiting = inbox.filter((row) => row.status === 'pending').length;

  return <div>
    <PageTitle title="引き継ぎ"
      description="担当替えや代講のときに、生徒の様子と申し送りを次の先生へ渡します。" />

    <div className="mb-6 grid gap-4 sm:grid-cols-3">
      <MetricCard label="受け取り待ち" value={waiting} tone={waiting ? 'amber' : 'emerald'} note="あなた宛て" />
      <MetricCard label="引き受けた生徒" value={inbox.filter((row) => row.status === 'accepted').length} note="これまでの累計" />
      <MetricCard label="送った引き継ぎ" value={outbox.length} tone="slate" note="返事待ちを含む" />
    </div>

    <Panel title="受け取った引き継ぎ" description="引き受けると、その生徒の申し送りがあなたの記録に残ります">
      {inbox.length
        ? <HandoffList initial={inbox} mode="inbox" names={names} />
        : <EmptyState>あなた宛ての引き継ぎはありません</EmptyState>}
    </Panel>

    <div className="mt-6">
      <Panel title="送った引き継ぎ" description="生徒のページから引き継ぎを作れます">
        {outbox.length
          ? <HandoffList initial={outbox} mode="outbox" names={names} />
          : <EmptyState>まだ引き継ぎを送っていません</EmptyState>}
      </Panel>
    </div>
  </div>;
}
