import type { RetrievedChunk } from './retrieve-types';

export function materialExcerpt(chunks: RetrievedChunk[], maxTokens = 2500): string {
  let used = 0;
  const selected: string[] = [];
  for (const chunk of chunks) {
    const estimated = Math.ceil(chunk.content.length / 2);
    if (selected.length > 0 && used + estimated > maxTokens) break;
    selected.push(`<excerpt source="${chunk.id}">${chunk.content}</excerpt>`);
    used += estimated;
  }
  return selected.length === 0 ? '' : `<material_excerpt>\n${selected.join('\n')}\n</material_excerpt>`;
}
