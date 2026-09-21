import { after } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/guard';
import { ForbiddenError } from '@/lib/auth/errors';
import { json, parseJson, routeError, traceIdFrom } from '@/lib/api/http';
import { adminDb } from '@/lib/database/admin';
import { preCheck } from '@/lib/security/guard';
import { reportSafetyBlock } from '@/lib/security/escalate';
import { SafetyBlocked } from '@/lib/orcarouter/errors';
import { MAX_AUDIO_BYTES, looksLikeAudio } from '@/lib/voice/audio';
import { transcribeChunk } from '@/lib/voice/transcribe';

/** 1分あたりの書き起こし回数。3.5秒ごとに1回送る想定の倍を上限にする。 */
const MAX_CHUNKS_PER_MINUTE = 40;

const bodySchema = z.object({
  conversationId: z.uuid(),
  format: z.enum(['wav', 'mp3']),
  /** base64。生のバイト長は MAX_AUDIO_BYTES で別途確かめる。 */
  audio: z.string().min(64).max(Math.ceil(MAX_AUDIO_BYTES * 4 / 3) + 1024),
  /** いま話しているお題。同音異義語の直しに効く。 */
  topic: z.string().max(600).optional(),
  /** 直前までの書き起こし。文の途中で区切られても続きとして読める。 */
  previousText: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  try {
    const context = await requireAuth();
    // 話すのは生徒だけ。先生・管理者の画面に音声の入り口は無い。
    if (context.role !== 'student') throw new ForbiddenError('音声入力を使えるのは生徒だけです');

    const body = await parseJson(request, bodySchema);
    const bytes = Buffer.from(body.audio, 'base64');
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES) {
      return json({ message: '音声が長すぎます。短く区切って話してください。' }, { status: 413 });
    }
    if (!looksLikeAudio(bytes, body.format)) {
      return json({ message: '音声として読み取れませんでした。' }, { status: 400 });
    }

    // 音声は1回ごとに課金される。予算ガードの手前に、回数そのものの蓋を置く。
    const since = new Date(new Date().getTime() - 60_000).toISOString();
    const { count } = await adminDb().from('agent_runs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', context.tenantId).eq('actor_id', context.userId)
      .eq('agent_name', 'voice-input').gte('created_at', since);
    if ((count ?? 0) >= MAX_CHUNKS_PER_MINUTE) {
      return json({ message: '音声入力が混み合っています。少し待ってからもう一度お試しください。' }, { status: 429 });
    }

    const traceId = traceIdFrom(request);
    const result = await transcribeChunk({
      audioBase64: body.audio,
      format: body.format,
      topic: body.topic,
      previousText: body.previousText,
      trace: {
        traceId, tenantId: context.tenantId, userId: context.userId,
        studentId: context.userId, conversationId: body.conversationId,
        modelClass: 'audio', routingReason: 'voice_input',
      },
    });

    // ここが要。書き起こしは「生徒が打った文字」と同じ扱いにし、
    // 通常のテキストと同じ検査に通してから画面へ返す。
    // 音声はゲートウェイのガードレールを通り抜けるので、ここが唯一の関門になる。
    const text = result.data.text.trim();
    if (!text) return json({ text: '', hesitation: 0 });

    return json({ text: preCheck(text).masked.text, hesitation: result.data.hesitation });
  } catch (error) {
    if (error instanceof SafetyBlocked) {
      const context = await requireAuth().catch(() => null);
      if (context) {
        const { tenantId, userId } = context;
        after(() => reportSafetyBlock({ error, tenantId, studentId: userId }));
      }
      return json({ message: '読み上げた内容は送れませんでした。先生に確認をお願いしています。' }, { status: 400 });
    }
    return routeError(error);
  }
}
