import 'server-only';
import { orca } from '@/lib/orcarouter/client';
import { EMBEDDING_DIMS, EMBEDDING_MODEL } from '@/lib/orcarouter/routers';

export { EMBEDDING_DIMS, EMBEDDING_MODEL };

export class EmbeddingUnavailableError extends Error {
  constructor(message = '埋め込みモデルを利用できません') {
    super(message);
    this.name = 'EmbeddingUnavailableError';
  }
}

/** OrcaRouterのOpenAI互換 embeddings を1箇所に閉じ込める。 */
export async function embedText(text: string): Promise<number[]> {
  try {
    const response = await orca.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });
    const vector = response.data[0]?.embedding;
    if (!vector || vector.length !== EMBEDDING_DIMS) {
      throw new EmbeddingUnavailableError(`埋め込み次元が${EMBEDDING_DIMS}ではありません`);
    }
    return vector;
  } catch (error) {
    if (error instanceof EmbeddingUnavailableError) throw error;
    throw new EmbeddingUnavailableError(error instanceof Error ? error.message : String(error));
  }
}
