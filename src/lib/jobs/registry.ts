import type { JobHandler } from './types';

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(kind: string, handler: JobHandler): void {
  // Next.jsの開発時ホットリロードではモジュールが再評価されるため、
  // 同じ種類の標準ハンドラを最新の実装へ差し替える。
  if (handlers.has(kind) && process.env.NODE_ENV !== 'development') {
    throw new Error(`job handler already registered: ${kind}`);
  }
  handlers.set(kind, handler);
}

export function clearJobHandlersForTests(): void {
  handlers.clear();
}

export function jobHandler(kind: string): JobHandler | undefined {
  return handlers.get(kind);
}
