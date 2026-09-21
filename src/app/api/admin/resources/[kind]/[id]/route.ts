import { z } from 'zod';
import { requireRole } from '@/lib/auth/guard';
import { adminDb } from '@/lib/database/admin';
import { json, parseJson, routeError, uuidParam, ApiInputError } from '@/lib/api/http';
type Route = { params: Promise<{ kind: string; id: string }> };
async function scope(route: Route) {
  const context = await requireRole('admin');
  const params = await route.params;
  const kind = z.enum(['student','classroom']).safeParse(params.kind);
  if(!kind.success) throw new ApiInputError('対象が不正です');
  return { p_tenant:context.tenantId,p_actor:context.userId,p_kind:kind.data,p_id:uuidParam(params.id) };
}
export async function GET(_request: Request, route: Route) {
  try {
    const result = await adminDb().rpc('managed_resource_preview',await scope(route));
    if(result.error) throw new ApiInputError(result.error.code === 'P0001' ? result.error.message : '影響を確認できませんでした');
    return json(result.data);
  } catch(error) { return routeError(error); }
}
export async function POST(request: Request, route: Route) {
  try {
    const args = await scope(route);
    const input = await parseJson(request,z.object({ action:z.enum(['archive','restore','delete']),confirmation:z.string().max(200).default(''),fingerprint:z.string().max(100).default('') }));
    const result = await adminDb().rpc('manage_resource',{...args,p_action:input.action,p_confirmation:input.confirmation,p_fingerprint:input.fingerprint});
    if(result.error) throw new ApiInputError(result.error.code === 'P0001' ? result.error.message : '変更できませんでした。関連データを確認してください');
    return json({ok:true});
  } catch(error) { return routeError(error); }
}
