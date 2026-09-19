import 'server-only';
import { adminDb } from '@/lib/database/admin';

export async function getTenant(tenantId: string) {
  const { data, error } = await adminDb().from('tenants').select('*').eq('id', tenantId).single();
  if (error || !data) throw new Error(error?.message ?? 'tenant not found');
  return data;
}
