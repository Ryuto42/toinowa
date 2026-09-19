import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { json, routeError } from '@/lib/api/http';

export async function GET() {
  try {
    const context = await requireRole('student');
    const db = await createClient();
    const { data, error } = await db.from('assignments').select('*, lessons(title), questions(*)')
      .eq('tenant_id', context.tenantId).eq('student_id', context.userId)
      .in('status', ['published', 'completed']).order('due_at', { ascending: true });
    if (error) throw new Error(error.message);
    return json({ tasks: data ?? [] });
  } catch (error) {
    return routeError(error);
  }
}
