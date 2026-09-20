export interface SimpleFeedback {
  id: string;
  conversationId: string;
  concept: string;
  encouragement: string;
  goodPoint: string;
  nextStep: string;
  pendingReview: boolean;
  createdAt: string;
}

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
  const pendingReview = ['pending_review', 'rejected', 'overridden'].includes(row.reviewer_status);
  const text = (key: string, fallback: string) => typeof simple[key] === 'string'
    ? (simple[key] as string).slice(0, 240) : fallback;
  return {
    id: row.id, conversationId: row.conversation_id, concept,
    encouragement: '最後まで自分の言葉で説明できたね。よく頑張ったね！',
    goodPoint: pendingReview ? '説明の内容は先生と一緒に確認しています。' : text('goodPoint', '自分の言葉で説明する練習を積み重ねられました。'),
    nextStep: pendingReview ? 'ひと休みして、先生からの確認を待とう。' : text('nextStep', '次は身近な例でも説明してみよう。'),
    pendingReview, createdAt: row.created_at,
  };
}
