import { requireRole } from '@/lib/auth/guard';
import { createClient } from '@/lib/database/server';
import { PageTitle } from '@/components/dashboard';
import { SettingsForm } from '@/components/student/settings-form';
import { PushToggle } from '@/components/student/push-toggle';

export default async function StudentSettingsPage() {
  const context = await requireRole('student');
  const profile = await (await createClient()).from('student_profiles').select('*').eq('user_id', context.userId).single();
  if (!profile.data) throw new Error(profile.error?.message ?? 'profile not found');
  return <div className="max-w-3xl"><PageTitle eyebrow="Settings" title="設定" description="学習の好みは固定的な能力ラベルではなく、いつでも変更できる傾向として扱います。"/><SettingsForm initial={{ dailyTimeLimitMin: profile.data.daily_time_limit_min, learningPreferences: profile.data.learning_preferences, notificationSettings: profile.data.notification_settings, consentStatus: profile.data.consent_status }}/><div className="mt-6"><PushToggle/></div></div>;
}
