import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { createClient } from '@/lib/database/server';
import { preCheck } from '@/lib/security/guard';
import { recordAudit } from '@/lib/security/audit';
import { json, parseJson, routeError } from '@/lib/api/http';

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  subject: z.string().trim().min(1).max(40),
  grade: z.string().trim().max(40).default(''),
});

export async function GET() {
  try {
    const context = await requireRole('admin');
    const { data, error } = await (await createClient())
      .from('classrooms').select('id,name,subject,grade')
      .eq('tenant_id', context.tenantId).order('name');
    if (error) throw new Error(error.message);
    return json({ classrooms: data ?? [] });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireRole('admin');
    const body = await parseJson(request, schema);
    const { data, error } = await adminDb().from('classrooms').insert({
      tenant_id: context.tenantId,
      name: preCheck(body.name).masked.text,
      subject: preCheck(body.subject).masked.text,
      grade: body.grade ? preCheck(body.grade).masked.text : null,
    }).select('id,name,subject,grade').single();
    if (error) throw new Error(error.message);
    recordAudit({
      tenantId: context.tenantId, actorId: context.userId, actorRole: 'admin',
      action: 'classroom.create', resourceType: 'classroom', resourceId: data.id, result: 'allow',
    });
    return json({ classroom: data }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
