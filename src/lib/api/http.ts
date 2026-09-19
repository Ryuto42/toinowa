import { z } from 'zod';
import { authErrorResponse, AuthRequiredError, ForbiddenError } from '@/lib/auth/errors';
import { BudgetExceeded, SafetyBlocked, SchemaRepairFailed } from '@/lib/orcarouter/errors';

export class ApiInputError extends Error {
  readonly status = 400;

  constructor(message = '入力が不正です') {
    super(message);
    this.name = 'ApiInputError';
  }
}

export async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiInputError('JSON body が必要です');
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiInputError(z.prettifyError(parsed.error));
  }
  return parsed.data;
}

export function json<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, {
    headers: { 'Cache-Control': 'no-store', ...(init?.headers ?? {}) },
    ...init,
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
  return request.headers.get('x-trace-id') ?? crypto.randomUUID();
}
