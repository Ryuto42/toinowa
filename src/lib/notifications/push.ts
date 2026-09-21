import 'server-only';
import webpush from 'web-push';
import { adminDb } from '@/lib/database/admin';
import { BRAND } from '@/lib/shared/branding';
import { isWebPushConfigured, serverEnv } from '@/lib/shared/env.server';

let configured = false;
function ensureConfigured(): boolean {
  if (!isWebPushConfigured) return false;
  if (!configured) {
    webpush.setVapidDetails(
      serverEnv.VAPID_SUBJECT || 'mailto:noreply@example.com',
      serverEnv.VAPID_PUBLIC_KEY,
      serverEnv.VAPID_PRIVATE_KEY,
    );
    configured = true;
  }
  return true;
}

/**
 * 1件の通知をその生徒の端末へ届ける。
 *
 * 期限切れの購読（404/410）はその場で削除する。放っておくと
 * 毎回失敗し続け、送信の成否が見分けられなくなる。
 * 戻り値は「1台でも届いたか」。
 */
export async function pushToStudent(input: {
  tenantId: string; studentId: string; title: string; body: string; href?: string | null;
}): Promise<boolean> {
  if (!ensureConfigured()) return false;
  const db = adminDb();
  const subscriptions = await db.from('push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .eq('tenant_id', input.tenantId).eq('user_id', input.studentId);
  if (subscriptions.error) throw new Error(subscriptions.error.message);
  if (!subscriptions.data?.length) return false;

  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    // アプリ名は1箇所から引く（改名しても通知文が古いままにならない）
    tag: BRAND.shortName,
    // public/sw.js が読むキー名に合わせる
    href: input.href ?? '/student/home',
  });

  let delivered = false;
  const expired: string[] = [];
  await Promise.all(subscriptions.data.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload);
      delivered = true;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) expired.push(subscription.id);
      else console.error('[push] 送信に失敗:', status ?? error);
    }
  }));

  if (expired.length) {
    await db.from('push_subscriptions').delete().in('id', expired);
  }
  return delivered;
}
