import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import type { Json } from '@/lib/database/types';
import { json, parseJson, routeError } from '@/lib/api/http';

const schema = z.object({
  resourceType: z.enum(['lesson', 'assignment', 'assessment', 'plan', 'broadcast', 'intervention']),
  resourceId: z.uuid(),
  requestedBy: z.string().trim().max(100).default('agent'),
  proposal: z.record(z.string(), z.unknown()).default({}),
});

export async function GET() {
  try {
    const context = await requireRole('teacher', 'admin');
    const { data, error } = await adminDb().from('approvals').select('*').eq('tenant_id', context.tenantId)
      .is('decision', null).order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return json({ approvals: data ?? [] });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireRole('teacher', 'admin');
    const body = await parseJson(request, schema);
    const { data, error } = await adminDb().from('approvals').insert({
      tenant_id: context.tenantId,
      resource_type: body.resourceType,
      resource_id: body.resourceId,
      requested_by: body.requestedBy,
      proposal: body.proposal as unknown as Json,
    }).select('*').single();
    if (error || !data) throw new Error(error?.message ?? 'approval create failed');
    return json({ approval: data }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
