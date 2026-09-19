import { requireAuth } from '@/lib/auth/guard'; import { json, routeError } from '@/lib/api/http'; import { serverEnv } from '@/lib/shared/env.server';
export async function GET(){try{await requireAuth();return json({publicKey:serverEnv.VAPID_PUBLIC_KEY||null})}catch(error){return routeError(error)}}
