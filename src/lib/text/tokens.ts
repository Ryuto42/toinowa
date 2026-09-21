import { getEncoding, type Tiktoken } from 'js-tiktoken';

let encoder: Tiktoken | null = null;

/** 会話履歴の切り詰め判断に使うトークン数。cl100k_base で概算する。 */
export function countTokens(text: string): number {
  encoder ??= getEncoding('cl100k_base');
  return encoder.encode(text).length;
}
