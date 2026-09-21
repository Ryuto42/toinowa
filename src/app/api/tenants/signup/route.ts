import { z } from 'zod';
import { adminDb } from '@/lib/database/admin';
import { generateInitialPassword } from '@/lib/auth/student-credentials';
import { recordAudit } from '@/lib/security/audit';
import { json, parseJson, ApiInputError, TooManyRequests, routeError, traceIdFrom } from '@/lib/api/http';

/**
 * ログイン画面からの所属の新規申請。**認証なしで呼べる唯一の作成系API**。
 *
 * 誰でも所属と管理者アカウントを作れる入口なので、次の3つで絞っている。
 *   1. 同じIPからの申請回数（10分で3件）
 *   2. 同じメールアドレスからの申請回数（10分で2件）
 *   3. 予約語のコードを拒否
 *
 * メールアドレスは確認していない。到達確認は行っていないので、
 * ここで作られた所属を「本人のもの」として扱わない。
 */

const RESERVED = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'help', 'api', 'www',
  'app', 'login', 'signup', 'test', 'demo', 'staff', 'teacher', 'student',
  'toinowa', 'null', 'undefined',
]);

const MAX_PER_ADDRESS = 3;
const MAX_PER_EMAIL = 2;

const codeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{2,31}$/, '所属コードは3〜32文字の半角英数字とハイフンで入力してください');

const signupSchema = z.object({
  email: z.email('メールアドレスの形式が正しくありません').max(254),
  code: codeSchema,
});

function addressOf(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return (forwarded?.split(',')[0] ?? request.headers.get('x-real-ip') ?? 'unknown').trim();
}

export async function POST(request: Request) {
  let authUserId: string | null = null;
  try {
    const body = await parseJson(request, signupSchema);
    const email = body.email.trim().toLowerCase();
    const db = adminDb();

    // 成否によらず1回として数える。作成を試みた回数そのものを抑えたい。
    const [byAddress, byEmail] = await Promise.all([
      db.rpc('register_login_attempt', { p_key: `signup-ip:${addressOf(request)}`, p_success: false }),
      db.rpc('register_login_attempt', { p_key: `signup-mail:${email}`, p_success: false }),
    ]);
    if (byAddress.error || byEmail.error) throw new Error('申請を受け付けられませんでした');
    if (Number(byAddress.data ?? 0) > MAX_PER_ADDRESS || Number(byEmail.data ?? 0) > MAX_PER_EMAIL) {
      throw new TooManyRequests('申請が続いたため、しばらく受け付けられません。10分ほど待ってからお試しください。');
    }

    if (RESERVED.has(body.code)) throw new ApiInputError('この所属コードは使えません。別のコードを入力してください。');

    const available = await db.rpc('school_code_available', { p_code: body.code });
    if (available.error) throw new Error(available.error.message);
    if (available.data === false) throw new ApiInputError('この所属コードはすでに使われています。別のコードを入力してください。');

    const initialPassword = generateInitialPassword();
    const created = await db.auth.admin.createUser({
      email,
      password: initialPassword,
      email_confirm: true,
      user_metadata: { signup_code: body.code },
    });
    if (created.error || !created.data.user) {
      // 既に別の所属で使われているアドレスも、ここで弾かれる。
      throw new ApiInputError('このメールアドレスでは登録できません。別のアドレスをお試しください。');
    }
    authUserId = created.data.user.id;

    const provisioned = await db.rpc('provision_tenant', {
      p_code: body.code,
      p_name: body.code,
      p_admin_id: authUserId,
      p_admin_email: email,
    });
    if (provisioned.error) {
      // 空き確認のあとに横から取られた場合もここに来る。
      throw provisioned.error.message.includes('code_taken')
        ? new ApiInputError('この所属コードはすでに使われています。別のコードを入力してください。')
        : new Error(provisioned.error.message);
    }

    const tenantId = provisioned.data as string;
    // ここから先で失敗しても所属は出来ている。認証ユーザーを消してはいけない。
    authUserId = null;
    recordAudit({
      tenantId,
      actorId: authUserId,
      actorRole: 'admin',
      actorKind: 'system',
      action: 'tenant.signup',
      resourceType: 'tenant',
      resourceId: tenantId,
      result: 'allow',
      detail: { code: body.code, email },
      traceId: traceIdFrom(request),
    });

    return json({ code: body.code, email, initialPassword });
  } catch (error) {
    // テナント作成に失敗した認証ユーザーを残さない。
    // 残すと、そのアドレスで二度と申請できなくなる。
    if (authUserId) await adminDb().auth.admin.deleteUser(authUserId).catch(() => undefined);
    return routeError(error);
  }
}
