'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * 説明ワークの取り組み状況を裏で記録する。
 *
 * 記録するもの:
 *   ・画面を開いていた実時間（タブが背面のときは数えない）
 *   ・1つ1つの回答にかかった時間、打鍵数、貼り付け回数、実際に打っていた時間
 *
 * 生徒には何も見せない。評価の補助情報と、AI生成の疑いの判断材料に使う。
 * 計測が失敗しても学習の妨げにならないよう、送信エラーは握りつぶす。
 */

const HEARTBEAT_MS = 30_000;
/** 打鍵が途切れてからこれ以上空いたら「打っていない時間」として数えない */
const TYPING_IDLE_MS = 3_000;

export interface AnswerTelemetry {
  elapsedSec: number;
  typingMs: number;
  keystrokes: number;
  pasteCount: number;
}

export function useWorkTelemetry(assignmentId: string | undefined) {
  // ── 画面の滞在時間 ──
  const visibleSince = useRef<number | null>(null);
  const unsent = useRef(0);

  const flush = useCallback((useBeacon: boolean) => {
    if (!assignmentId) return;
    if (visibleSince.current !== null) {
      unsent.current += (Date.now() - visibleSince.current) / 1000;
      visibleSince.current = Date.now();
    }
    const seconds = Math.round(unsent.current);
    if (seconds <= 0) return;
    unsent.current -= seconds;
    const body = JSON.stringify({ event: 'heartbeat', activeSeconds: seconds });
    const url = `/api/assignments/${assignmentId}/progress`;
    // ページ離脱時は fetch が中断されるので sendBeacon を使う
    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body }).catch(() => {});
  }, [assignmentId]);

  useEffect(() => {
    if (!assignmentId) return;
    void fetch(`/api/assignments/${assignmentId}/progress`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'open', activeSeconds: 0 }),
    }).catch(() => {});

    if (document.visibilityState === 'visible') visibleSince.current = Date.now();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        visibleSince.current = Date.now();
      } else {
        flush(true);
        visibleSince.current = null;
      }
    };
    const timer = setInterval(() => flush(false), HEARTBEAT_MS);
    const onHide = () => flush(true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      flush(true);
    };
  }, [assignmentId, flush]);

  // ── 1回答ごとの計測 ──
  const answerStart = useRef(0);
  useEffect(() => { answerStart.current = Date.now(); }, []);
  const keystrokes = useRef(0);
  const pasteCount = useRef(0);
  const typingMs = useRef(0);
  const lastKey = useRef<number | null>(null);

  const onKeyDown = useCallback(() => {
    const now = Date.now();
    keystrokes.current += 1;
    if (lastKey.current !== null) {
      const gap = now - lastKey.current;
      // 手が止まっていた時間は「打っていた時間」に含めない
      if (gap < TYPING_IDLE_MS) typingMs.current += gap;
    }
    lastKey.current = now;
  }, []);

  const onPaste = useCallback(() => { pasteCount.current += 1; }, []);

  /** 送信時に呼ぶ。計測値を返してリセットする。 */
  const consume = useCallback((): AnswerTelemetry => {
    const value: AnswerTelemetry = {
      elapsedSec: Math.round((Date.now() - answerStart.current) / 1000),
      typingMs: Math.round(typingMs.current),
      keystrokes: keystrokes.current,
      pasteCount: pasteCount.current,
    };
    answerStart.current = Date.now();
    keystrokes.current = 0;
    pasteCount.current = 0;
    typingMs.current = 0;
    lastKey.current = null;
    return value;
  }, []);

  return { onKeyDown, onPaste, consume };
}
