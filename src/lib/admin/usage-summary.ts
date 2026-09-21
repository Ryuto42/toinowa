export interface UsageRun {
  id?: string; request_type?: string;
  actor_id?: string | null; student_id?: string | null; resolved_model: string | null;
  input_tokens: number | null; output_tokens: number | null; cached_input_tokens?: number | null; estimated_cost_usd: number | null;
  safety_result?: unknown;
  status: string; fallback_count: number; created_at: string;
}
export function summarizeUsage(rows: UsageRun[], names: Record<string, string>) {
  const grouped = new Map<string, { userId: string | null; userName: string; model: string; feature: string; location: string; requestType: string; requests: number; tokens: number; costUsd: number; fallbacks: number; failures: number; lastUsed: string }>();
  for (const row of rows) {
    const userId = row.actor_id ?? row.student_id ?? null;
    const model = row.resolved_model ?? 'モデル未到達';
    const requestType = row.request_type ?? 'unknown';
    const { feature, location } = usageFeature(requestType);
    const key = JSON.stringify([userId, model, requestType]);
    const item = grouped.get(key) ?? { userId, userName: userId ? names[userId] ?? '登録ユーザー' : 'システム処理', model, feature, location, requestType, requests: 0, tokens: 0, costUsd: 0, fallbacks: 0, failures: 0, lastUsed: row.created_at };
    item.requests++;
    item.tokens += (row.input_tokens ?? 0) + (row.output_tokens ?? 0);
    item.costUsd += Number(row.estimated_cost_usd ?? 0);
    item.fallbacks += row.fallback_count;
    item.failures += ['error', 'blocked', 'degraded', 'rate_limited'].includes(row.status) ? 1 : 0;
    if (row.created_at > item.lastUsed) item.lastUsed = row.created_at;
    grouped.set(key, item);
  }
  return [...grouped.values()].sort((a, b) => b.lastUsed.localeCompare(a.lastUsed));
}

export function usageFeature(requestType: string): { feature: string; location: string } {
  const features: Record<string, [string, string]> = {
    analyze_exam_profile: ['模試からのプロフィール提案', '管理者：ユーザー登録・編集'],
    extract_exam: ['模試の読み取り', '管理者：ユーザー登録・編集'],
    extract_lesson: ['授業資料の読み取り', '先生：課題作成'],
    propose_explanation_work: ['お題の自動作成', '先生：課題作成'],
    analyze_lesson: ['授業の分析', '先生：授業資料'],
    student_tutorial: ['初回チャットの練習', '生徒：自己紹介チュートリアル'],
    learning_support: ['生徒との対話', '生徒：課題'],
    assess_answer: ['最終フィードバック', '対話完了後の自動処理'],
    build_learning_plan: ['学習計画・次回の提案', '授業記録・模試・対話完了後の個別計画'],
    teacher_insight: ['クラスの分析', '先生：クラスの状況'],
    summarize_conversation: ['対話履歴の要約', '長い対話の自動処理'],
    ai_text_judge: ['回答の整合性チェック', '生徒の説明の分析'],
    safety_classify: ['安全性チェック', '入力の安全性判定'],
    voice_transcribe: ['声での説明の書き起こし', '生徒：課題（音声入力）'],
  };
  const value = features[requestType];
  return value ? { feature: value[0], location: value[1] } : { feature: requestType === 'unknown' ? '機能未記録' : requestType, location: '自動処理' };
}
