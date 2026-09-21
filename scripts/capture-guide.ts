/**
 * 使い方ガイド用のスクリーンショットを撮る。
 *
 *   npm run guide:capture -- --manual                 # ブラウザが開くので自分でログインする（推奨）
 *   npm run guide:capture -- --manual --role=teacher  # 1ロールだけ撮り直す
 *   GUIDE_PASSWORD=… npm run guide:capture
 *
 * --manual では、ロールごとにブラウザが開いてログイン画面で止まる。
 * 画面で手入力してログインすると、そのまま撮影が始まる。
 * パスワードを環境変数にも履歴にも置きたくない場合はこちら。
 *
 * 端末にインストール済みの Chrome を playwright-core から操作する
 * （ブラウザのダウンロードを伴う playwright 本体は入れない）。
 * 撮影先は public/guide/。デモ所属のデータだけを写す。
 */
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { join } from 'node:path';

const BASE = process.env.GUIDE_BASE_URL ?? 'http://localhost:3000';
const CODE = process.env.GUIDE_ORG_CODE ?? 'demo';
const PASSWORD = process.env.GUIDE_PASSWORD ?? '';
const MANUAL = process.argv.includes('--manual');
/** 手入力を待つ上限。席を外していても撮影が始まらないだけで、壊れはしない。 */
const MANUAL_TIMEOUT_MS = 10 * 60 * 1000;
/** 撮るロール。--role=teacher のように絞れる。1ロールずつ撮り直したいとき用。 */
const ONLY = process.argv.find((arg) => arg.startsWith('--role='))?.slice(7);
/**
 * ログイン状態を残す専用プロファイル（.gitignore 済み）。
 *
 * 毎回まっさらな Chrome を起動すると、ロールごとに毎回ログインし直しになる。
 * 使い慣れた Chrome の既定プロファイルは、起動中だと衝突するので使わない。
 */
const PROFILE_DIR = join(process.cwd(), '.playwright-profile');

const ACCOUNTS = {
  teacher: process.env.GUIDE_TEACHER ?? 'teacher@demo.toinowa.local',
  student: process.env.GUIDE_STUDENT ?? 'student01',
  admin: process.env.GUIDE_ADMIN ?? 'admin@demo.toinowa.local',
};

/** すでにそのロールで入っていれば、ログインを飛ばす。 */
async function alreadyIn(page: Page, home: string): Promise<boolean> {
  await page.goto(`${BASE}${home}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  return new URL(page.url()).pathname.startsWith(home);
}

async function login(page: Page, identifier: string, roleLabel: string, home: string) {
  if (await alreadyIn(page, home)) {
    console.log(`  （${roleLabel}でログイン済み）`);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    return;
  }
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });

  if (MANUAL) {
    // 所属コードとIDだけ入れておく。パスワードはこのプロセスが一度も受け取らない。
    await page.getByPlaceholder('例：demo').fill(CODE);
    await page.getByPlaceholder('例：student01').fill(identifier);
    await page.getByPlaceholder('パスワードを入力').focus();
    await page.bringToFront();
    console.log(`\n  → ブラウザで「${roleLabel}」としてログインしてください（${identifier}）`);
    console.log('    パスワードを入力して「ログインする」を押すと、撮影が始まります。');
    console.log('    ※ このウィンドウは閉じないでください（閉じると撮影が中断します）');
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: MANUAL_TIMEOUT_MS })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(message.includes('closed')
          ? 'ブラウザのウィンドウが閉じられました。もう一度実行して、ログインが終わるまで開いたままにしてください。'
          : `ログインを待てませんでした（${MANUAL_TIMEOUT_MS / 60000}分）。もう一度実行してください。`);
      });
  } else {
    await page.getByPlaceholder('パスワードを入力').fill(PASSWORD);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }),
      page.getByRole('button', { name: 'ログインする' }).click(),
    ]);
  }

  // 初回ログインでパスワード変更を求められた場合は、そこで止まっていることを伝える。
  if (new URL(page.url()).pathname.startsWith('/change-password')) {
    throw new Error('初回ログインのパスワード変更が終わっていません。先に変更してから撮り直してください。');
  }
  // 入れたつもりで入れていないと、ログイン画面を15枚撮ることになる。ここで必ず確かめる。
  if (!await alreadyIn(page, home)) {
    throw new Error(`${roleLabel}としてログインできていません（現在: ${new URL(page.url()).pathname}）。もう一度実行してください。`);
  }
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

/**
 * 中身が出るまで待つ。
 *
 * 固定の待ち時間だと、開発サーバーが遅い日に骨組みのまま撮れてしまう。
 * 実際に「骨組みが消えて、見出しに文字が入った」ことを条件にする。
 */
async function settled(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForFunction(
    () => document.querySelectorAll('.skeleton').length === 0
      && (document.querySelector('h1')?.textContent?.trim().length ?? 0) > 0,
    undefined,
    { timeout: 30_000 },
  ).catch(() => console.warn('    ! 中身が出そろう前に時間切れ。撮った画像を確認してください'));
  // 残りのフェードイン・画像の読み込みを待つ
  await page.waitForTimeout(1200);
}

async function shot(page: Page, path: string, name: string, prepare?: (page: Page) => Promise<void>) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  // 途中でセッションが切れると、以降が全部ログイン画面になる。撮る前に気づく。
  if (new URL(page.url()).pathname.startsWith('/login')) {
    throw new Error(`${path} でログイン画面へ戻されました。セッションが切れています。もう一度実行してください。`);
  }
  await settled(page);
  if (prepare) {
    await prepare(page);
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: `public/guide/${name}.png` });
  console.log(`  ✓ ${name}.png`);
}

async function main() {
  if (!MANUAL && !PASSWORD) throw new Error('GUIDE_PASSWORD を指定するか、--manual を付けてください');
  // 専用プロファイルで起動する。ログイン状態が次回も残り、起動中のChromeとも衝突しない。
  const context: BrowserContext = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: !MANUAL,
    viewport: { width: 1280, height: 820 },
    deviceScaleFactor: 2,
    locale: 'ja-JP',
    args: ['--hide-crash-restore-bubble'],
  });
  const page = context.pages()[0] ?? await context.newPage();
  const want = (role: string) => !ONLY || ONLY === role;

  try {
    if (want('teacher')) {
    console.log('先生');
    await login(page, ACCOUNTS.teacher, '先生', '/teacher');
    await shot(page, '/teacher/dashboard', 'teacher-dashboard');
    await shot(page, '/teacher/assignments', 'teacher-assignments');
    await shot(page, '/teacher/assignments', 'teacher-create', async (p) => {
      await p.getByRole('button', { name: '新しく作成' }).click();
    });
    await shot(page, '/teacher/students', 'teacher-students');
    await shot(page, '/teacher/interventions', 'teacher-followups');
    await shot(page, '/teacher/handoffs', 'teacher-handoffs');
    }

    if (want('student')) {
    console.log('生徒');
    await context.clearCookies();
    await login(page, ACCOUNTS.student, '生徒', '/student');
    await shot(page, '/student/home', 'student-home');
    await shot(page, '/student/study', 'student-study');
    await shot(page, '/student/records', 'student-records');
    }

    if (want('admin')) {
    console.log('管理者');
    await context.clearCookies();
    await login(page, ACCOUNTS.admin, '管理者', '/admin');
    await shot(page, '/admin/overview', 'admin-dashboard');
    await shot(page, '/admin/users', 'admin-users');
    await shot(page, '/admin/users', 'admin-user-create', async (p) => {
      await p.getByRole('button', { name: 'ユーザーを追加する' }).click();
    });
    await shot(page, '/admin/classrooms', 'admin-classrooms');
    await shot(page, '/admin/students', 'admin-students');
    await shot(page, '/admin/usage', 'admin-usage');
    }
  } finally {
    await context.close().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
