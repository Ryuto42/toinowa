/** 1チャンクの上限。16kHz モノラル WAV（32KB/秒）でおよそ16秒ぶん。 */
export const MAX_AUDIO_BYTES = 520_000;
/** 1ターンで話せる合計の長さ。取り込み過ぎを防ぐ。 */
export const MAX_TURN_SECONDS = 120;

export type AudioFormat = 'wav' | 'mp3';

/**
 * 受け取ったバイト列が本当に名乗った形式か確かめる。
 *
 * 中身を見ずに base64 をそのまま上流へ流すと、
 * このエンドポイントが「他人の課金で動く変換器」として使われうる。
 */
export function looksLikeAudio(bytes: Uint8Array, format: AudioFormat): boolean {
  if (format === 'wav') {
    return bytes.length > 44
      && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 // RIFF
      && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45; // WAVE
  }
  // ID3 タグ、または MPEG フレーム同期
  return bytes.length > 4
    && ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)
      || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
}
