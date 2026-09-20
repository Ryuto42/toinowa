import { requireAuth } from '@/lib/auth/guard';
import { PasswordChangeForm } from '@/components/password-change-form';
import { AuthRequiredError } from '@/lib/auth/errors';
import { redirect } from 'next/navigation';
export default async function ChangePasswordPage() {
  try { await requireAuth({ allowPasswordChange: true }); }
  catch (error) { if (error instanceof AuthRequiredError) redirect('/login'); throw error; }
  return <PasswordChangeForm />;
}
