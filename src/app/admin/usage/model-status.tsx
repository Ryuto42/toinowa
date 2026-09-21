import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { ModelControl, type ModelRow } from '@/components/admin/model-control';
import { MODEL_TIER, serverEnv } from '@/lib/shared/env.server';
import { EMBEDDING_MODEL, FALLBACK_CHAIN, PRIMARY } from '@/lib/orcarouter/routers';
import { modelsForClass, type ModelClass } from '@/lib/orcarouter/selection';

const ROUTER_LABELS: Record<string, string> = {
  studentChat: '生徒との対話', assessment: '説明の評価', curriculum: '学習計画', safety: '安全性チェック',
};

const CLASSES: ModelClass[] = ['economy', 'standard', 'advanced', 'vision', 'audio', 'exam'];

/** `google/gemini-2.5-flash` → `gemini-2.5-flash` */
function bare(id: string): string {
  return id.includes('/') ? id.slice(id.indexOf('/') + 1) : id;
}

/**
 * ゲートウェイが返す resolved_model は形がそろわない。
 * 直接モデルを指定したときは接頭辞なし、Named Router 経由だと
 * `google/gemini-2.5-flash` のように接頭辞つきで返る。日付版になることもある。
 *
 * 片側だけ剥がして比べると、同じモデルを「設定側」と「実績のみ」で
 * 二重に数えてしまう（React の key も衝突する）。両側を剥がしてから比べる。
 */
function matchesRequested(resolved: string, requested: string): boolean {
  const left = bare(resolved);
  const right = bare(requested);
  return left === right || left.startsWith(`${right}-`);
}

export async function ModelStatus() {
  const context = await requireRole('admin');
  const since = new Date(new Date().getTime() - 3_600_000).toISOString();
  const [recent, paused] = await Promise.all([
    adminDb().from('agent_runs').select('resolved_model').eq('tenant_id', context.tenantId).gte('created_at', since),
    adminDb().from('model_disables').select('model').eq('tenant_id', context.tenantId).is('released_at', null),
  ]);
  const hour = (recent.data ?? []).map((run) => run.resolved_model).filter((model): model is string => Boolean(model));
  const pausedModels = new Set((paused.data ?? []).map((row) => row.model));
  const tier = MODEL_TIER === 'production' ? 'production' : 'dev';

  // 難易度別の連鎖（modelsForClass）も呼び出し対象になる。
  // ここを入れないと、実際に動いているのに一覧に出ないモデルが生まれる。
  const configured = [...new Set([
    ...Object.values(PRIMARY[tier]),
    ...Object.values(FALLBACK_CHAIN[tier]).flat(),
    ...CLASSES.flatMap((kind) => modelsForClass(kind, serverEnv)),
    EMBEDDING_MODEL,
  ])];

  const rows: ModelRow[] = configured.map((model) => ({
    model,
    paused: pausedModels.has(model),
    used: hour.filter((resolved) => matchesRequested(resolved, model)).length,
    pausable: true,
  }));

  // アダプティブルーターが選んだ先は設定に現れない。実績から拾って読むだけ出す。
  // 一時停止は「要求したID」に対してかかるので、ここは操作できない。
  const resolvedOnly = [...new Set(hour)]
    .filter((resolved) => !configured.some((model) => matchesRequested(resolved, model)))
    .map((resolved) => ({
      model: resolved,
      paused: false,
      used: hour.filter((item) => item === resolved).length,
      pausable: false,
    }));

  return <ModelControl
    models={[...rows, ...resolvedOnly]}
    tierLabel={MODEL_TIER === 'production' ? '本番モデル' : '開発モデル'}
    primary={[
      ...Object.entries(PRIMARY[tier]).map(([key, model]) => ({ label: ROUTER_LABELS[key] ?? key, model })),
      { label: '難易度4〜5の自動選択', model: serverEnv.AI_ADVANCED_MODEL },
      { label: '模試の読み取り', model: serverEnv.AI_EXAM_MODEL },
    ]}
  />;
}
