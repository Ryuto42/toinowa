import { getEncoding, type Tiktoken } from 'js-tiktoken';

export interface TextChunk {
  index: number;
  content: string;
  tokenCount: number;
}

let encoder: Tiktoken | null = null;
function tokenEncoder(): Tiktoken {
  encoder ??= getEncoding('cl100k_base');
  return encoder;
}

export function countTokens(text: string): number {
  return tokenEncoder().encode(text).length;
}

function sentencesOf(text: string): string[] {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('ja', { granularity: 'sentence' });
    return Array.from(segmenter.segment(text), (item) => item.segment).filter(Boolean);
  }
  return text.split(/(?<=[。！？.!?])\s*/u).filter(Boolean);
}

/** 日本語の文境界を優先した、上限＋オーバーラップ付きチャンク化。 */
export function chunkText(
  text: string,
  options: { maxTokens?: number; overlapTokens?: number } = {},
): TextChunk[] {
  const maxTokens = Math.max(32, options.maxTokens ?? 600);
  const overlapTokens = Math.min(maxTokens - 1, Math.max(0, options.overlapTokens ?? 80));
  const sentences = sentencesOf(text.replace(/\r\n?/g, '\n').trim());
  const chunks: TextChunk[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  const flush = () => {
    if (current.length === 0) return;
    const content = current.join('').trim();
    chunks.push({ index: chunks.length, content, tokenCount: countTokens(content) });
  };

  for (const sentence of sentences) {
    const sentenceTokens = countTokens(sentence);
    if (current.length > 0 && currentTokens + sentenceTokens > maxTokens) {
      flush();
      const overlap: string[] = [];
      let overlapCount = 0;
      for (let i = current.length - 1; i >= 0 && overlapCount < overlapTokens; i -= 1) {
        overlap.unshift(current[i]);
        overlapCount += countTokens(current[i]);
      }
      current = overlap;
      currentTokens = overlapCount;
    }
    // 1文が上限を超える場合でも捨てず、文字列を分割して保存する。
    if (sentenceTokens > maxTokens && current.length === 0) {
      const encoded = tokenEncoder().encode(sentence);
      for (let start = 0; start < encoded.length; start += maxTokens - overlapTokens) {
        const part = tokenEncoder().decode(encoded.slice(start, start + maxTokens));
        if (part) chunks.push({ index: chunks.length, content: part, tokenCount: countTokens(part) });
        if (start + maxTokens >= encoded.length) break;
      }
      continue;
    }
    current.push(sentence);
    currentTokens += sentenceTokens;
  }
  flush();
  return chunks;
}
