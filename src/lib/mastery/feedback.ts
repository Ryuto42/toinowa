export interface SimpleFeedback {
  id: string;
  conversationId: string;
  /** 説明したテーマ。カードの見出しになる。 */
  concept: string;
  /** どの授業の課題だったか。個別指導などで授業が無ければ null。 */
  lesson: string | null;
  /** 先生の確認が済むまでは null。定型文で埋めず、確認中と分かるようにする。 */
  goodPoint: string | null;
  nextStep: string | null;
  /** confirmed=そのまま見せてよい / pending=先生の確認待ち / revised=先生が判断を修正した */
  review: 'confirmed' | 'pending' | 'revised';
  /** 今回の説明がどのくらいだったか。点数そのものは渡さず、3段階の手応えだけにする。 */
  level: 'strong' | 'steady' | 'retry' | null;
  completedAt: string | null;
  createdAt: string;
}

/** AIの所見をそのまま生徒に見せてよい状態。 */
const CONFIRMED = new Set(['approved', 'auto_approved']);

/** 許可した項目のみ返す。点数・誤概念・先生向け所見・証拠は生徒へ渡さない。 */
export function simplifyFeedback(row: {
  id: string; conversation_id: string | null; is_final: boolean; component_scores: unknown;
  reviewer_status: string; created_at: string;
  score?: number | null; override_score?: number | null;
}, concept: string, completed: boolean, source: { lesson?: string | null; completedAt?: string | null } = {}): SimpleFeedback | null {
  if (!completed || !row.is_final || !row.conversation_id) return null;
  const detail = row.component_scores && typeof row.component_scores === 'object'
    ? row.component_scores as Record<string, unknown> : {};
  const simple = detail.studentFeedback && typeof detail.studentFeedback === 'object'
    ? detail.studentFeedback as Record<string, unknown> : {};
  // 確認前・却下・先生が修正済みの評価は、AIの所見をそのまま渡さない。
  // 生徒が「先生の判断と食い違う助言」を先に読んでしまうのを防ぐ。
  const confirmed = CONFIRMED.has(row.reviewer_status);
  const review = confirmed ? 'confirmed' as const : row.reviewer_status === 'overridden' ? 'revised' as const : 'pending' as const;
  const text = (key: string) => confirmed && typeof simple[key] === 'string' && simple[key]
    ? (simple[key] as string).slice(0, 240) : null;
  // 確認待ちの点数はまだ先生の判断を通っていないので出さない。
  // 修正済みなら先生がつけ直した点数なので、そちらを手応えの根拠にする。
  const effective = review === 'pending' ? null : row.override_score ?? row.score ?? null;
  return {
    id: row.id, conversationId: row.conversation_id, concept,
    lesson: source.lesson ?? null,
    goodPoint: text('goodPoint'),
    nextStep: text('nextStep'),
    review,
    level: effective === null ? null : effective >= 0.8 ? 'strong' : effective >= 0.5 ? 'steady' : 'retry',
    completedAt: source.completedAt ?? null,
    createdAt: row.created_at,
  };
}
