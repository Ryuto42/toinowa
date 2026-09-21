'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MicUnavailable, startRecorder } from '@/lib/voice/record';

/** 1ターンで話せる長さ。これを超えたら自動で止める。 */
const MAX_SECONDS = 120;

type Status = 'idle' | 'starting' | 'recording' | 'stopping' | 'error';

async function toBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buffer.length; i += 0x8000) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * 話した端から文字にして入力欄へ足していく。
 *
 * 話し終わってからまとめて送るのではなく、間が空いたところで区切って送る。
 * 書き起こしは編集できる普通の文字として入力欄に入るので、
 * 送信のときは手で打った場合とまったく同じ経路（検査・ガードレール）を通る。
 *
 * 送信ボタンの隣に並ぶので、見た目はアイコンだけにする。
 * 状態は吹き出しで上に浮かせ、入力欄の高さを動かさない。
 */
export function VoiceInput({ conversationId, disabled, topic, previousText, onStart, onText, onStop, onHesitation }: {
  conversationId: string;
  disabled?: boolean;
  /** いま話しているお題。同音異義語の直しに効くので毎回渡す。 */
  topic?: string;
  /** 直前までの書き起こし。文の途中で区切られても続きとして読めるようにする。 */
  previousText?: () => string;
  /** 話しはじめ。仮の吹き出しを出す合図。 */
  onStart?: () => void;
  /** 区切りごとの書き起こし。音声認識の誤りを直した文が来る。 */
  onText: (text: string) => void;
  /** 話し終わり。残りの書き起こしまで終わってから呼ぶ。 */
  onStop?: () => void;
  onHesitation?: (level: number) => void;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [pending, setPending] = useState(0);
  const [message, setMessage] = useState('');

  const stopRef = useRef<(() => Promise<void>) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 区切りは順番に投げず、できた端から並行して投げる。
  // 直前の返事を待ってから次を出すと、待ち時間がそのまま積み上がる。
  const inflightRef = useRef(new Set<Promise<void>>());
  // ただし画面に出す順番は守る。到着順に足すと文が入れ替わる。
  const dispatchedRef = useRef(0);
  const nextEmitRef = useRef(0);
  const pendingTextRef = useRef(new Map<number, string>());
  const activeRef = useRef(false);
  const stoppingRef = useRef(false);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    generationRef.current += 1;
    activeRef.current = false;
    abortRef.current?.abort();
    if (timerRef.current) clearInterval(timerRef.current);
    const stopFn = stopRef.current;
    stopRef.current = null;
    void stopFn?.().catch(() => {});
  }, [conversationId]);

  const stop = useCallback(async () => {
    if (!stopRef.current || stoppingRef.current) return;
    stoppingRef.current = true;
    const generation = generationRef.current;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const stopFn = stopRef.current;
    stopRef.current = null;
    setStatus('stopping');
    setLevel(0);
    // 止めた瞬間に残りが最後のチャンクとして積まれる。
    // それを書き起こし終わる前に送ると、話の最後が丸ごと落ちる。
    try {
      await stopFn();
    } catch {
      if (generation === generationRef.current) setMessage('録音を終了しました。入力された文字を確認してください。');
    }
    while (inflightRef.current.size) await Promise.all([...inflightRef.current]);
    if (generation !== generationRef.current) return;
    onStop?.();
    activeRef.current = false;
    stoppingRef.current = false;
    setStatus('idle');
  }, [onStop]);

  const send = useCallback(async (wav: Blob, index: number, generation: number) => {
    setPending((n) => n + 1);
    let text = '';
    try {
      const response = await fetch('/api/voice/transcribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: abortRef.current?.signal,
        body: JSON.stringify({
          conversationId,
          format: 'wav',
          audio: await toBase64(wav),
          topic,
          // 直前までの文脈を渡すと、文の途中で区切られても続きとして読める。
          // これが無いと「直線の」が「直前の」に化ける（実測）。
          previousText: previousText?.().slice(-600),
        }),
      });
      const result = await response.json() as { text?: string; hesitation?: number; message?: string };
      if (generation !== generationRef.current) return;
      if (!response.ok) { setMessage(result.message ?? '聞き取れませんでした。'); return; }
      if (typeof result.hesitation === 'number') onHesitation?.(result.hesitation);
      text = result.text ?? '';
    } catch {
      if (generation === generationRef.current) setMessage('一部を聞き取れませんでした。入力された文字を確認し、足りない部分を入力してください。');
    } finally {
      if (generation === generationRef.current) {
        // HTTPエラーも空の区切りとして確定させ、後続の認識結果を止めない。
        pendingTextRef.current.set(index, text);
        // 先に返ってきても、前の区切りが揃うまで出さない。
        while (pendingTextRef.current.has(nextEmitRef.current)) {
          const text = pendingTextRef.current.get(nextEmitRef.current) ?? '';
          pendingTextRef.current.delete(nextEmitRef.current);
          nextEmitRef.current += 1;
          if (text) onText(text);
        }
        setPending((n) => n - 1);
      }
    }
  }, [conversationId, topic, previousText, onText, onHesitation]);

  async function start() {
    if (disabled || activeRef.current) return;
    activeRef.current = true;
    stoppingRef.current = false;
    const generation = ++generationRef.current;
    abortRef.current = new AbortController();
    setStatus('starting');
    setMessage('');
    setSeconds(0);
    dispatchedRef.current = 0;
    nextEmitRef.current = 0;
    pendingTextRef.current.clear();
    inflightRef.current.clear();
    setPending(0);
    try {
      const stopFn = await startRecorder({
        onLevel: value => { if (generation === generationRef.current) setLevel(value); },
        onChunk: ({ wav }) => {
          if (generation !== generationRef.current) return;
          const index = dispatchedRef.current;
          dispatchedRef.current += 1;
          const task = send(wav, index, generation).finally(() => inflightRef.current.delete(task));
          inflightRef.current.add(task);
        },
      });
      if (generation !== generationRef.current) { await stopFn(); return; }
      stopRef.current = stopFn;
      setStatus('recording');
      onStart?.();
      let elapsed = 0;
      timerRef.current = setInterval(() => {
        elapsed += 1;
        setSeconds(elapsed);
        if (elapsed >= MAX_SECONDS) void stop();
      }, 1000);
    } catch (error) {
      if (generation !== generationRef.current) return;
      activeRef.current = false;
      setStatus('error');
      // 原因によって直し方が違う。ひとまとめの文言だと、何をすればよいか分からない。
      setMessage(error instanceof MicUnavailable
        ? error.message
        : 'マイクを開けませんでした。文字で入力してください。');
    }
  }

  const recording = status === 'recording';
  const label = status === 'stopping' ? '最後の音声を文字にしています'
    : status === 'starting' ? 'マイクを準備しています'
    : recording ? `話し終わったら押す（あと${MAX_SECONDS - seconds}秒）`
      : '声で説明する';

  return <div className="relative shrink-0">
    <button
      type="button"
      onClick={() => void (recording ? stop() : start())}
      disabled={disabled || status === 'starting' || status === 'stopping'}
      aria-pressed={recording}
      aria-label={label}
      title={label}
      className={`inline-flex h-12 w-12 items-center justify-center rounded-xl transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-40 ${
        recording
          ? 'bg-rose-600 text-white hover:bg-rose-700'
          : 'bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-500'}`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
      {/* 声が届いているかを、ボタンの縁の明るさで返す。無反応だと話してよいのか分からない。 */}
      {recording ? <span aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-rose-300"
        style={{ opacity: 0.25 + Math.min(1, level * 9) * 0.75 }} /> : null}
    </button>

    {recording || pending > 0 || message
      ? <div className="absolute bottom-[calc(100%+8px)] right-0 z-10 w-max max-w-[min(18rem,70vw)] rounded-lg bg-slate-900/90 px-3 py-2 text-xs leading-5 text-white shadow-lg">
        {message
          ? <span role="alert">{message}</span>
          : <span role="status">
            {recording ? `聞いています · あと${MAX_SECONDS - seconds}秒` : null}
            {recording && pending > 0 ? ' · ' : null}
            {pending > 0 ? '文字にしています…' : null}
          </span>}
      </div>
      : null}
  </div>;
}
