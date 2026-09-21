import 'server-only';
import { adminDb } from '@/lib/database/admin';
import { tutorialAudienceForGrade } from './content';

export async function studentTutorialAudience(tenantId: string, studentId: string) {
  const profile = await adminDb().from('student_profiles').select('grade')
    .eq('tenant_id', tenantId).eq('user_id', studentId).maybeSingle();
  if (profile.error) throw new Error(profile.error.message);
  return tutorialAudienceForGrade(profile.data?.grade);
}
