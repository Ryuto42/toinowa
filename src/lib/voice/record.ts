/** 書き起こしに使うサンプリングレート。これ以上細かくしても精度は上がらず、量だけ増える。 */
export const TARGET_RATE = 16_000;
/**
 * 区切りの設計。
 *
 * 精度を支えているのは「区切りの長さ」ではなく、書き起こしに渡す文脈のほう。
 * 文脈（お題・直前までの書き起こし）を渡すようになったので、
 * 1回を短くしても語を取り違えにくい。画面が埋まるまでの待ちを優先して短めに取る。
 *
 * それでも言いよどみ（「えーっと」）の直後で切ると単語が分断されるので、
 * 考えている間の「間」では切らない程度の余裕は残す。
 */
const MIN_CHUNK_SEC = 2.5;
/** 無音が来なくても必ず区切る長さ。話し続けても画面が止まらないようにする。 */
const MAX_CHUNK_SEC = 10;
/** これより静かなら「間」とみなす。 */
const SILENCE_RMS = 0.012;
const SILENCE_HOLD_SEC = 0.6;
// 区切り用より低い閾値にし、小声まで一律に捨てない。
const AUDIBLE_RMS = 0.003;
const MIN_AUDIBLE_SEC = 0.06;

export interface Chunk { wav: Blob; seconds: number }

/** Float32 の連結。音声は細切れで届くので、まとめる処理を1か所に持つ。 */
function concat(parts: Float32Array[], total: number): Float32Array {
  const out = new Float32Array(total);
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

/** 線形補間のダウンサンプル。音声認識の用途ではこれで十分。 */
function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i += 1) {
    const at = i * ratio;
    const low = Math.floor(at);
    const high = Math.min(low + 1, input.length - 1);
    out[i] = input[low] + (input[high] - input[low]) * (at - low);
  }
  return out;
}

/** 16bit PCM の WAV。ブラウザ既定の webm/opus は Gemini に拒否されるため、ここで作る。 */
export function encodeWav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(at + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export function rmsOf(samples: Float32Array): number {
  let sum = 0;
  for (const value of samples) sum += value * value;
  return Math.sqrt(sum / (samples.length || 1));
}

/**
 * マイクを開き、話が途切れたところで音声を区切って渡す。
 *
 * 一定の長さで機械的に切ると単語の途中で切れて書き起こしが壊れるので、
 * 「短く話した区切り」を無音で拾う。無音が来ないときだけ長さで強制的に切る。
 */
export class MicUnavailable extends Error {
  constructor(readonly reason: 'insecure' | 'unsupported' | 'denied' | 'notfound' | 'blocked' | 'unknown', message: string) {
    super(message);
    this.name = 'MicUnavailable';
  }
}

/** 何が原因でマイクを開けなかったのかを、直せる言葉にして返す。 */
function micError(error: unknown): MicUnavailable {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new MicUnavailable('denied', 'マイクの使用が許可されていません。ブラウザのアドレスバーのマイク設定で「許可」にしてください。');
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return new MicUnavailable('notfound', 'マイクが見つかりませんでした。端末にマイクがつながっているか確認してください。');
  }
  if (name === 'NotReadableError') {
    return new MicUnavailable('blocked', 'マイクを他のアプリが使っています。そちらを閉じてからもう一度お試しください。');
  }
  return new MicUnavailable('unknown', 'マイクを開けませんでした。文字で入力してください。');
}

export async function startRecorder(handlers: {
  onChunk: (chunk: Chunk) => void;
  onLevel: (level: number) => void;
}): Promise<() => Promise<void>> {
  // http:// では mediaDevices 自体が生えない。設定を見に行っても直らないので分けて伝える。
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new MicUnavailable('insecure', 'この接続ではマイクを使えません。https:// か localhost で開いてください。');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MicUnavailable('unsupported', 'このブラウザは音声入力に対応していません。文字で入力してください。');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (error) {
    throw micError(error);
  }
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;

  // Blob URL だと CSP の script-src に blob: を足すことになる。
  // 静的ファイルなら 'self' のまま読めるので、CSP を緩めずに済む。
  await context.audioWorklet.addModule('/voice-worklet.js');

  const tap = new AudioWorkletNode(context, 'tap');
  source.connect(analyser);
  analyser.connect(tap);

  let parts: Float32Array[] = [];
  let total = 0;
  let quietFor = 0;
  let audibleFor = 0;
  let stopped = false;

  const flush = () => {
    if (!total) return;
    const raw = concat(parts, total);
    const audible = audibleFor >= MIN_AUDIBLE_SEC;
    parts = []; total = 0; quietFor = 0;
    audibleFor = 0;
    // 話し終わりの無音から、モデルが参考文や定型句を生成するのを防ぐ。
    if (!audible) return;
    const samples = downsample(raw, context.sampleRate, TARGET_RATE);
    handlers.onChunk({ wav: encodeWav(samples, TARGET_RATE), seconds: raw.length / context.sampleRate });
  };

  tap.port.onmessage = (event: MessageEvent<Float32Array>) => {
    if (stopped) return;
    const frame = event.data;
    parts.push(frame);
    total += frame.length;
    const level = rmsOf(frame);
    if (level >= AUDIBLE_RMS) audibleFor += frame.length / context.sampleRate;
    handlers.onLevel(level);
    const seconds = total / context.sampleRate;
    quietFor = level < SILENCE_RMS ? quietFor + frame.length / context.sampleRate : 0;
    if (seconds >= MAX_CHUNK_SEC || (seconds >= MIN_CHUNK_SEC && quietFor >= SILENCE_HOLD_SEC)) flush();
  };

  return async () => {
    if (stopped) return;
    stopped = true;
    tap.port.onmessage = null;
    // 止める前に、残っている分を最後のチャンクとして出す。
    flush();
    tap.disconnect();
    analyser.disconnect();
    source.disconnect();
    for (const track of stream.getTracks()) track.stop();
    await context.close();
  };
}
