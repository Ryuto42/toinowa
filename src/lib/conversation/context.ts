import { countTokens } from '@/lib/rag/chunk';

interface ContextMessage { actor: string; content_redacted: string; seq?: number }

/** 無料枠のプロンプト上限を超えないよう、要約と直近発話をトークン数で切り出す。 */
export function buildConversationContext(summary: string | null | undefined, messages: ContextMessage[], maxTokens = 2500): string {
  const head = summary?.trim() ? `<conversation_summary>\n${summary.trim()}\n</conversation_summary>\n` : '';
  const selected: string[] = [];
  let used = countTokens(head);
  for (const message of [...messages].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)).reverse()) {
    const line = `${message.actor}: ${message.content_redacted}`;
    const tokens = countTokens(line);
    if (selected.length > 0 && used + tokens > maxTokens) break;
    selected.unshift(line);
    used += tokens;
  }
  return `${head}<recent_messages>\n${selected.join('\n')}\n</recent_messages>`;
}
