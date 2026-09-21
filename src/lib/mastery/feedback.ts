export interface SimpleFeedback {
  id: string;
  conversationId: string;
  concept: string;
  encouragement: string;
  goodPoint: string;
  nextStep: string;
  /** 先生の確認が済んでいない、または先生が修正した評価 */
  pendingReview: boolean;
  createdAt: string;
}

/** AIの所見をそのまま生徒に見せてよい状態。 */
const CONFIRMED = new Set(['approved', 'auto_approved']);

/** 許可した項目のみ返す。点数・誤概念・先生向け所見・証拠は生徒へ渡さない。 */
export function simplifyFeedback(row: {
  id: string; conversation_id: string | null; is_final: boolean; component_scores: unknown;
  reviewer_status: string; created_at: string;
}, concept: string, completed: boolean): SimpleFeedback | null {
  if (!completed || !row.is_final || !row.conversation_id) return null;
  const detail = row.component_scores && typeof row.component_scores === 'object'
    ? row.component_scores as Record<string, unknown> : {};
  const simple = detail.studentFeedback && typeof detail.studentFeedback === 'object'
    ? detail.studentFeedback as Record<string, unknown> : {};
  // 確認前・却下・先生が修正済みの評価は、AIの所見をそのまま渡さない。
  // 生徒が「先生の判断と食い違う助言」を先に読んでしまうのを防ぐ。
  const confirmed = CONFIRMED.has(row.reviewer_status);
  const text = (key: string, fallback: string) => confirmed && typeof simple[key] === 'string'
    ? (simple[key] as string).slice(0, 240) : fallback;
  return {
    id: row.id, conversationId: row.conversation_id, concept,
    encouragement: '最後まで自分の言葉で説明できたね。よく頑張ったね！',
    goodPoint: text('goodPoint', '自分の言葉で説明する練習を積み重ねられました。'),
    nextStep: text('nextStep', '次は身近な例でも説明してみよう。'),
    pendingReview: !confirmed,
    createdAt: row.created_at,
  };
}
