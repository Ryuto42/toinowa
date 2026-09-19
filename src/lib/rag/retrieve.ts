import 'server-only';
import { z } from 'zod';
import { adminDb } from '@/lib/database/admin';
import { embedText } from './embed';
import type { RetrievedChunk } from './retrieve-types';
export type { RetrievedChunk } from './retrieve-types';
export { materialExcerpt } from './excerpt';

const chunkSchema = z.object({
  id: z.string(),
  material_id: z.string(),
  content: z.string(),
  chunk_index: z.number(),
  similarity: z.number().optional(),
  rank: z.number().optional(),
});

function parseRows(value: unknown): RetrievedChunk[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    const parsed = chunkSchema.safeParse(row);
    if (!parsed.success) return [];
    return [{
      id: parsed.data.id,
      materialId: parsed.data.material_id,
      content: parsed.data.content,
      chunkIndex: parsed.data.chunk_index,
      score: parsed.data.similarity ?? parsed.data.rank ?? 0,
    }];
  });
}

export interface RetrieveOptions {
  tenantId: string;
  query: string;
  lessonId?: string | null;
  conceptId?: string | null;
  limit?: number;
  minSimilarity?: number;
}

/** ベクトルを優先し、利用不能なら全文検索へ縮退する。 */
export async function retrieveMaterialChunks(options: RetrieveOptions): Promise<RetrievedChunk[]> {
  const limit = Math.min(6, Math.max(1, options.limit ?? 6));
  try {
    const embedding = await embedText(options.query);
    const vectorResult = await adminDb().rpc('match_material_chunks', {
      p_tenant: options.tenantId,
      p_embedding: embedding,
      p_lesson: options.lessonId ?? undefined,
      p_concept: options.conceptId ?? undefined,
      p_limit: limit,
      p_min_similarity: options.minSimilarity ?? 0.35,
    });
    if (!vectorResult.error) {
      const rows = parseRows(vectorResult.data);
      if (rows.length > 0) return rows;
    }
  } catch {
    // 埋め込みが落ちても全文検索で学習を止めない。
  }

  const textResult = await adminDb().rpc('search_material_chunks_text', {
    p_tenant: options.tenantId,
    p_query: options.query,
    p_lesson: options.lessonId ?? undefined,
    p_concept: options.conceptId ?? undefined,
    p_limit: limit,
  });
  if (textResult.error) return [];
  return parseRows(textResult.data);
}
