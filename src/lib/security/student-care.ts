import { z } from 'zod';
import { detectWellbeing } from './wellbeing';

export const careSchema = z.object({
  category: z.enum(['normal', 'distress', 'child_safety', 'self_harm', 'danger', 'hostility', 'unavailable']),
  evidence: z.string().max(240),
  reason: z.string().max(240),
  resumeLearning: z.boolean(),
});
export type CareDecision = z.infer<typeof careSchema>;
export interface CareMessage { actor: string; content_redacted: string; safety_flags?: unknown }
export const CARE_TITLES = {
  distress: '生徒からつらさ・助けを求める相談がありました',
  child_safety: '生徒の安全について確認が必要な相談がありました',
  self_harm: '生徒の命・安全について至急の確認が必要です',
  danger: '差し迫った危険をうかがわせる相談がありました',
  hostility: '攻撃的な言葉が繰り返されています',
};

export function careTag(message: CareMessage): string | undefined {
  const flags = message.safety_flags;
  if (!flags || typeof flags !== 'object' || !('student_care' in flags)) return;
  const value = flags.student_care;
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined;
}

/** 相談は会話ログには残すが、学力評価・会話回数・学習の要約には使わない。 */
export function isLearningMessage(message: CareMessage): boolean { return !careTag(message); }

export function activeCare(history: CareMessage[]): CareDecision['category'] | null {
  for (const message of [...history].reverse()) {
    const tag = careTag(message);
    if (tag === 'resume') return null;
    if (tag === 'distress' || tag === 'child_safety' || tag === 'self_harm' || tag === 'danger') return tag;
  }
  return null;
}

/** 再開意思はモデルの意味判定を使う。表現一致や引用文字列の一致では制限しない。 */
export function canResumeLearning(decision: CareDecision): boolean {
  return decision.category === 'normal' && decision.resumeLearning === true;
}

/** 明確なSOSの即時経路。教材の引用・否定は意味分類へ回す。 */
export function immediateCare(input: string): CareDecision | null {
  const text = input.normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069]/g, '');
  if (/「|」|『|』|"|“|”|という(文|言葉|表現|台詞)|登場人物|小説|歌詞|死にたいわけではない|いじめられていない/u.test(text)) return null;
  if (/今.{0,8}(殴られて|襲われて|血が止まらない)|今から.{0,8}(飛び降り|自分を傷つけ)/u.test(text)) {
    return { category: 'danger', evidence: text.slice(0, 240), reason: '差し迫った危険を示す発言。至急の確認が必要です。', resumeLearning: false };
  }
  const signal = detectWellbeing(text);
  if (signal) return { category: signal.category, evidence: text.slice(0, 240), reason: '明確な安全・相談の合図。事実関係は先生の確認が必要です。', resumeLearning: false };
  if (/(学校|家|教室).{0,12}(行きたくない|帰りたくない|こわい|怖い)|助けて|たすけて/u.test(text)
    && !/(問題|宿題|解き方|計算|数式|数学|英語).{0,10}(助けて|たすけて)/u.test(text)) {
    return { category: 'distress', evidence: text.slice(0, 240), reason: '助けを求める発言を学習より優先しました。', resumeLearning: false };
  }
  return null;
}

export function fallbackCare(text: string): CareDecision {
  const immediate = immediateCare(text);
  if (immediate) return immediate;
  if (/^(ば[ー〜～]*か[、。!！\s]*|バ[ー〜～]*カ[、。!！\s]*|馬鹿[、。!！\s]*)+$/u.test(text.trim())) {
    return { category: 'hostility', evidence: text.slice(0, 240), reason: '相手を傷つける言葉への境界を伝えます。', resumeLearning: false };
  }
  return { category: 'unavailable', evidence: '', reason: '意味の判定を完了できませんでした。', resumeLearning: false };
}

export function carePriority(category: CareDecision['category']): 'urgent' | 'high' | 'medium' {
  return category === 'self_harm' || category === 'danger' ? 'urgent' : category === 'hostility' ? 'medium' : 'high';
}

/** 相談の返事はLLMに任せず、学習への誘導や未実行の連絡の約束を防ぐ。 */
export function careReply(category: CareDecision['category'], continued = false, currentMessage = ''): string {
  if (category === 'hostility') return '相手を傷つける言葉は使わずに話しましょう。嫌なことや、困っていることがあれば、その気持ちを言葉にして伝えてください。';
  if (category === 'unavailable') return '今は返事をうまく作れませんでした。送ってくれた内容は保存されています。少し時間をおいて、もう一度送ってください。急いで助けが必要なときは、この返事を待たず近くの信頼できる大人に伝えてください。';
  // 通常の相談に内部処理の説明を挟まない。ただし共有範囲を聞かれたら隠さない。
  if (category !== 'self_harm' && category !== 'danger' && /(?:先生|管理者|誰|だれ).{0,12}(?:見|読|伝わ|伝え|知|知ら|話)|(?:秘密|内緒|ないしょ)|(?:伝え|言わ|いわ)ないで/u.test(currentMessage)) {
    return 'このチャットは、担当の先生や管理者が確認できる仕組みです。ここだけの秘密と約束することはできません。話したくないことまで書く必要はありません。';
  }
  if (category === 'self_harm' || category === 'danger') {
    return '話してくれてありがとう。今は勉強より、あなたの安全を大切にしたいです。ひとりで抱えず、近くの信頼できる大人に今すぐ助けを求めてください。今すぐ危険がある、けがをしている場合は110や119に連絡してください。';
  }
  if (continued) return '無理に詳しく話したり、勉強を続けたりしなくて大丈夫です。安心して話せる大人に相談してみてください。また勉強を再開したくなったら、「勉強に戻ろうかな」など、あなたの言葉で教えてください。';
  return '話してくれてありがとう。今は勉強を休んで大丈夫です。今、安心できる場所にいますか？ ひとりで抱えず、信頼できる大人にも相談してみてください。';
}
