import { z } from 'zod';
import { createClient } from '@/lib/database/server';
import { resolveStudentEmail } from '@/lib/shared/env.server';
import { roleFromClaims } from '@/lib/auth/claims';

const loginSchema = z.object({
  schoolCode: z.string().trim().min(1).max(32),
  identifier: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: school, error: schoolError } = await supabase
    .from('school_codes')
    .select('code')
    .eq('code', parsed.data.schoolCode)
    .eq('active', true)
    .maybeSingle();
  if (schoolError || !school) {
    return Response.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  const email = parsed.data.identifier.includes('@')
    ? parsed.data.identifier
    : resolveStudentEmail(parsed.data.schoolCode, parsed.data.identifier);
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });
  if (error) return Response.json({ error: 'invalid_credentials' }, { status: 401 });

  const { data: claimsData } = await supabase.auth.getClaims();
  const role = roleFromClaims(claimsData?.claims?.app_role);
  const redirectTo = role === 'student'
    ? '/student/home'
    : role === 'teacher'
      ? '/teacher/dashboard'
      : role === 'admin'
        ? '/admin/tenant'
        : '/';
  return Response.json({ ok: true, redirectTo });
}
