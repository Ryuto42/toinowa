import { z } from 'zod';
import { authErrorResponse, AuthRequiredError, ForbiddenError } from '@/lib/auth/errors';
import { BudgetExceeded, SafetyBlocked, SchemaRepairFailed } from '@/lib/orcarouter/errors';

export class ApiInputError extends Error {
  readonly status: number;

  constructor(message = '入力が不正です', status = 400) {
    super(message);
    this.name = 'ApiInputError';
    this.status = status;
  }
}

/** 回数制限。実際に数えるのは lib/api/rate-limit（server-only）側。 */
export class TooManyRequests extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TooManyRequests';
  }
}


export async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  // Content-Lengthだけに依存せずストリームの実サイズも制限する。
  // 画像8枚の既存上限を含めて12MiB。無制限のJSONパースを避ける。
  const maxBytes = 12 * 1024 * 1024;
  if (Number(request.headers.get('content-length')) > maxBytes) throw new ApiInputError('入力サイズが上限を超えています', 413);
  let value: unknown;
  const reader = request.body?.getReader();
  if (!reader) throw new ApiInputError('JSON body が必要です');
  try {
    const decoder = new TextDecoder();
    let total = 0;
    let text = '';
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ApiInputError('入力サイズが上限を超えています', 413);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    value = JSON.parse(text + decoder.decode());
  } catch (error) {
    if (error instanceof ApiInputError) throw error;
    throw new ApiInputError('JSON body が必要です');
  } finally { reader.releaseLock(); }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiInputError(z.prettifyError(parsed.error));
  }
  return parsed.data;
}

export function json<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, {
    ...init,
    headers: (() => { const headers = new Headers(init?.headers); headers.set('Cache-Control', 'no-store'); return headers; })(),
  });
}

export function routeError(error: unknown): Response {
  if (error instanceof AuthRequiredError || error instanceof ForbiddenError) {
    return authErrorResponse(error);
  }
  if (error instanceof ApiInputError) {
    return json({ error: error.name, message: error.message }, { status: error.status });
  }
  if (error instanceof SafetyBlocked) {
    return json(
      { error: 'safety_blocked', message: '安全性チェックで処理を止めました', rule: error.rule },
      { status: 422 },
    );
  }
  if (error instanceof TooManyRequests) {
    return json({ error: 'rate_limited', message: error.message }, { status: 429 });
  }
  if (error instanceof BudgetExceeded) {
    return json({ error: 'budget_exceeded', message: error.message }, { status: 429 });
  }
  if (error instanceof SchemaRepairFailed) {
    return json({ error: 'schema_unavailable', message: 'AIの応答を検証できませんでした' }, { status: 503 });
  }
  console.error('[api] unhandled route error:', error);
  return json({ error: 'internal_error', message: 'サーバーで処理できませんでした' }, { status: 500 });
}

export function uuidParam(value: string, label = 'id'): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new ApiInputError(`${label} が不正です`);
  return parsed.data;
}

export function traceIdFrom(request: Request): string {
  const parsed = z.uuid().safeParse(request.headers.get('x-trace-id'));
  return parsed.success ? parsed.data : crypto.randomUUID();
}
