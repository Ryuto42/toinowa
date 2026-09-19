import type { JobHandler } from './types';

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(kind: string, handler: JobHandler): void {
  if (handlers.has(kind)) throw new Error(`job handler already registered: ${kind}`);
  handlers.set(kind, handler);
}

export function clearJobHandlersForTests(): void {
  handlers.clear();
}

export function jobHandler(kind: string): JobHandler | undefined {
  return handlers.get(kind);
}
