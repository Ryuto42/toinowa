import { createClient } from '@/lib/database/server';

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return Response.json({ ok: true });
}
