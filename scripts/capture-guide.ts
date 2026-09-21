/**
 * 使い方ガイド用のスクリーンショットを撮る。
 *
 *   npm run guide:capture
 *
 * 端末にインストール済みの Chrome を playwright-core から操作する
 * （ブラウザのダウンロードを伴う playwright 本体は入れない）。
 * 撮影先は public/guide/。デモ所属のデータだけを写す。
 */
import { chromium, type Page } from 'playwright-core';

const BASE = process.env.GUIDE_BASE_URL ?? 'http://localhost:3000';
const CODE = process.env.GUIDE_ORG_CODE ?? 'demo';
const PASSWORD = process.env.GUIDE_PASSWORD ?? '';

const ACCOUNTS = {
  teacher: process.env.GUIDE_TEACHER ?? 'teacher@demo.studypilot.local',
  student: process.env.GUIDE_STUDENT ?? 'student01',
  admin: process.env.GUIDE_ADMIN ?? 'admin@demo.studypilot.local',
};

async function login(page: Page, identifier: string) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('例：demo').fill(CODE);
  await page.getByPlaceholder('例：student01').fill(identifier);
  await page.getByPlaceholder('パスワードを入力').fill(PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }),
    page.getByRole('button', { name: 'ログインする' }).click(),
  ]);
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

async function shot(page: Page, path: string, name: string, prepare?: (page: Page) => Promise<void>) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await prepare?.(page);
  // 骨組みのシマーが止まってから撮る
  await page.waitForTimeout(900);
  await page.screenshot({ path: `public/guide/${name}.png` });
  console.log(`  ✓ ${name}.png`);
}

async function main() {
  if (!PASSWORD) throw new Error('GUIDE_PASSWORD を指定してください');
  const browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2, locale: 'ja-JP' });
  const page = await context.newPage();

  try {
    console.log('先生');
    await login(page, ACCOUNTS.teacher);
    await shot(page, '/teacher/dashboard', 'teacher-dashboard');
    await shot(page, '/teacher/assignments', 'teacher-assignments');
    await shot(page, '/teacher/assignments', 'teacher-create', async (p) => {
      await p.getByRole('button', { name: '新しく作成' }).click();
      await p.waitForTimeout(400);
    });
    await shot(page, '/teacher/students', 'teacher-students');
    await shot(page, '/teacher/interventions', 'teacher-followups');
    await shot(page, '/teacher/handoffs', 'teacher-handoffs');

    console.log('生徒');
    await context.clearCookies();
    await login(page, ACCOUNTS.student);
    await shot(page, '/student/home', 'student-home');
    await shot(page, '/student/study', 'student-study');
    await shot(page, '/student/records', 'student-records');

    console.log('管理者');
    await context.clearCookies();
    await login(page, ACCOUNTS.admin);
    await shot(page, '/admin/overview', 'admin-dashboard');
    await shot(page, '/admin/users', 'admin-users');
    await shot(page, '/admin/users', 'admin-user-create', async (p) => {
      await p.getByRole('button', { name: 'ユーザーを追加する' }).click();
      await p.waitForTimeout(400);
    });
    await shot(page, '/admin/classrooms', 'admin-classrooms');
    await shot(page, '/admin/students', 'admin-students');
    await shot(page, '/admin/usage', 'admin-usage');
  } finally {
    await browser.close();
  }
}

void main();
