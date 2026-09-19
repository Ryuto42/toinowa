import type { ConvState, Channel } from '@/lib/database/types';

export type ConversationIntent =
  | 'greeting'
  | 'next_task'
  | 'mastery'
  | 'deadline'
  | 'hint'
  | 'assessment'
  | 'teacher_question'
  | 'learning_support'
  | 'escalation';

export interface RouteDecision {
  intent: ConversationIntent;
  agent: 'learning-support' | 'assessment' | 'orchestrator';
  fastPath: boolean;
  reason: string;
}

/** 会話ルーティングは決定的に行い、教材・入力文を実行命令として解釈しない。 */
export function classifyIntent(message: string): ConversationIntent {
  const text = message.trim().toLowerCase();
  if (/^(こんにちは|こんばんは|おはよう|hello|hi)[！!。．. ]*$/.test(text)) return 'greeting';
  if (/(次の課題|今日.*何|やること|next task|宿題)/u.test(text)) return 'next_task';
  if (/(理解度|どれくらい.*でき|mastery|成績)/u.test(text)) return 'mastery';
  if (/(いつまで|締切|期限|deadline|提出)/u.test(text)) return 'deadline';
  if (/(ヒント|hint|分からない|わからない|教えて)/u.test(text)) return 'hint';
  if (/(答え|採点|正しい|評価して|score)/u.test(text)) return 'assessment';
  if (/(先生|せんせい|聞いてほしい|相談)/u.test(text)) return 'teacher_question';
  return 'learning_support';
}

export function routeConversation(input: {
  message: string;
  state: ConvState;
  channel: Channel;
}): RouteDecision {
  if (input.state === 'escalated') {
    return { intent: 'escalation', agent: 'orchestrator', fastPath: true, reason: 'conversation_escalated' };
  }
  const intent = classifyIntent(input.message);
  if (intent === 'greeting' || intent === 'next_task' || intent === 'mastery' || intent === 'deadline') {
    return { intent, agent: 'orchestrator', fastPath: true, reason: 'deterministic_template' };
  }
  if (intent === 'assessment') {
    return { intent, agent: 'assessment', fastPath: false, reason: 'requires_structured_evaluation' };
  }
  return { intent, agent: 'learning-support', fastPath: false, reason: `channel_${input.channel}` };
}

export function fastPathMessage(intent: ConversationIntent): string | null {
  switch (intent) {
    case 'greeting': return 'こんにちは。今日の学習を一緒に進めましょう。分からないところを一つ送ってください。';
    case 'next_task': return '今日の課題を確認します。まず、いちばん近い締切の課題から始めましょう。';
    case 'mastery': return '理解度は回答と考え方の記録から更新されます。課題を一問解くと、根拠と一緒に確認できます。';
    case 'deadline': return '締切を確認するため、課題一覧を開きます。余裕を持って一問ずつ進めましょう。';
    case 'escalation': return '先生への相談に切り替えています。これまでの会話と根拠を先生に渡します。';
    default: return null;
  }
}
