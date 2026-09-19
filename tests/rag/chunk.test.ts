import { describe, expect, it } from 'vitest';
import { chunkText, countTokens } from '@/lib/rag/chunk';
import { materialExcerpt } from '@/lib/rag/excerpt';

describe('RAG chunking', () => {
  it('日本語の文境界を保ち、上限を超える本文を捨てない', () => {
    const text = Array.from({ length: 20 }, (_, i) => `第${i + 1}文です。`).join('');
    const chunks = chunkText(text, { maxTokens: 30, overlapTokens: 5 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.content).join('')).toContain('第20文です。');
    expect(chunks.every((chunk) => chunk.tokenCount <= 30)).toBe(true);
  });

  it('トークン数が再現可能である', () => {
    expect(countTokens('一次関数の傾き')).toBeGreaterThan(0);
    expect(countTokens('')).toBe(0);
  });
});

describe('material excerpts', () => {
  it('systemではなくmaterial_excerptとして囲む', () => {
    const result = materialExcerpt([
      { id: 'c1', materialId: 'm1', content: '傾きはxの係数です。', chunkIndex: 0, score: 0.9 },
    ]);
    expect(result).toContain('<material_excerpt>');
    expect(result).toContain('source="c1"');
  });
});
