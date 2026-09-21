import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { ModelControl, type ModelRow } from '@/components/admin/model-control';
import { MODEL_TIER } from '@/lib/shared/env.server';
import { FALLBACK_CHAIN, PRIMARY } from '@/lib/orcarouter/routers';

const ROUTER_LABELS: Record<string, string> = {
  studentChat: '生徒との対話', assessment: '説明の評価', curriculum: '学習計画', safety: '安全性チェック',
};

/**
 * 並べるモデルは設定（ROUTERS）から引く。画面用に別で持つと、
 * 設定を変えたときに表示と実際の挙動がずれる。
 */
export async function ModelStatus() {
  const context = await requireRole('admin');
  const since = new Date(new Date().getTime() - 3_600_000).toISOString();
  const [recent, paused] = await Promise.all([
    adminDb().from('agent_runs').select('resolved_model').eq('tenant_id', context.tenantId).gte('created_at', since),
    adminDb().from('model_disables').select('model').eq('tenant_id', context.tenantId).is('released_at', null),
  ]);
  const hour = recent.data ?? [];
  const pausedModels = new Set((paused.data ?? []).map((row) => row.model));
  const tier = MODEL_TIER === 'production' ? 'production' : 'dev';
  const rows: ModelRow[] = [...new Set([
    ...Object.values(PRIMARY[tier]),
    ...Object.values(FALLBACK_CHAIN[tier]).flat(),
  ])].map((model) => ({
    model,
    paused: pausedModels.has(model),
    used: hour.filter((run) => run.resolved_model === model).length,
  }));

  return <ModelControl
    models={rows}
    tierLabel={MODEL_TIER === 'production' ? '本番モデル' : '開発モデル'}
    primary={Object.entries(PRIMARY[tier]).map(([key, model]) => ({ label: ROUTER_LABELS[key] ?? key, model }))}
  />;
}
