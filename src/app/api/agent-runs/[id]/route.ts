import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { json, routeError, uuidParam } from '@/lib/api/http';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, route: Context) {
  try {
    const context = await requireRole('teacher', 'admin');
    const runId = uuidParam((await route.params).id, 'runId');
    const db = adminDb();
    const run = await db.from('agent_runs').select('*').eq('tenant_id', context.tenantId).eq('id', runId).maybeSingle();
    if (run.error) throw new Error(run.error.message);
    if (!run.data) return json({ error: 'not_found' }, { status: 404 });
    const attempts = await db.from('agent_run_attempts').select('*').eq('agent_run_id', runId).order('attempt_no');
    if (attempts.error) throw new Error(attempts.error.message);
    return json({ run: run.data, attempts: attempts.data ?? [] });
  } catch (error) {
    return routeError(error);
  }
}
