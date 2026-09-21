import { LoginForm } from '@/components/login-form';

type LoginPageProps = {
  searchParams: Promise<{ loggedOut?: string; next?: string | string[]; notice?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = Array.isArray(params.next) ? params.next[0] : params.next;
  return <LoginForm loggedOut={params.loggedOut === '1'} next={next} notice={params.notice === 'password-changed' ? 'パスワードを変更しました。新しいパスワードでログインしてください' : undefined} />;
}
