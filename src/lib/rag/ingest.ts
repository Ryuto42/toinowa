import 'server-only';
import { adminDb } from '@/lib/database/admin';
import { inspectInput } from '@/lib/security/injection';
import { embedText } from './embed';
import { chunkText } from './chunk';

export async function ingestMaterialText(input: {
  tenantId: string;
  materialId: string;
  lessonId?: string | null;
  text: string;
}): Promise<{ inserted: number; quarantined: number }> {
  const chunks = chunkText(input.text);
  let quarantined = 0;
  const rows = [];
  for (const chunk of chunks) {
    const inspection = inspectInput(chunk.content);
    const isQuarantined = inspection.risk === 'high';
    if (isQuarantined) quarantined += 1;
    let embedding: number[] | null = null;
    if (!isQuarantined) {
      try {
        embedding = await embedText(chunk.content);
      } catch {
        // ベクトル無しでも全文検索で利用できる。
      }
    }
    rows.push({
      tenant_id: input.tenantId,
      material_id: input.materialId,
      lesson_id: input.lessonId ?? null,
      chunk_index: chunk.index,
      content: chunk.content,
      token_count: chunk.tokenCount,
      embedding: embedding as never,
      embedding_model: embedding ? 'openai/text-embedding-3-small' : null,
      safety_flags: { risk: inspection.risk, categories: inspection.categories },
      quarantined: isQuarantined,
    });
  }

  if (rows.length === 0) return { inserted: 0, quarantined: 0 };
  const { error } = await adminDb()
    .from('material_chunks')
    .upsert(rows, { onConflict: 'material_id,chunk_index' });
  if (error) throw new Error(`教材チャンク保存に失敗しました: ${error.message}`);
  return { inserted: rows.length, quarantined };
}
