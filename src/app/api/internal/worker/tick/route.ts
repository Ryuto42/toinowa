import { timingSafeEqual } from 'node:crypto';
import { serverEnv } from '@/lib/shared/env.server';
import { runWorkerTick } from '@/lib/jobs/worker';

function secretMatches(value: string | null): boolean {
  if (!value) return false;
  const expected = Buffer.from(serverEnv.WORKER_SECRET);
  const actual = Buffer.from(value);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: Request) {
  if (!secretMatches(request.headers.get('x-worker-secret'))) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const result = await runWorkerTick();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error('[worker] tick failed:', error);
    return Response.json({ error: 'worker_failed' }, { status: 500 });
  }
}
