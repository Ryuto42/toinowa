/** Chrome上で実コンポーネントを実行する。通信は全て固定応答で、AI・DBは呼ばない。 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { build } = require('esbuild'); // Vitest/tsxが使用する開発用ビルダー
const { chromium } = require('playwright-core');
const bundle = await build({
  stdin: {
    contents: `import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { ChatClient } from './src/components/student/chat-client';
      const root = createRoot(document.getElementById('root'));
      window.mount = key => root.render(<ChatClient key={key} conversationId={key}
        initialMessages={[{id:'a',actor:'agent',seq:1,content_redacted:'説明してください'}]} />);
      window.mount('initial');`,
    loader: 'tsx', resolveDir: process.cwd(),
  },
  bundle: true, write: false, platform: 'browser',
  define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' },
});
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  let posts = 0;
  let saved = false;
  let offline = false;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://review.test/**', async route => {
    if (route.request().url().endsWith('/undo')) {
      return route.fulfill({ json: { restoredText: '傾きは2です' } });
    }
    if (!route.request().url().includes('/messages')) {
      return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
    }
    if (route.request().method() === 'POST') {
      posts++;
      return route.fulfill({ status: 503, json: { message: '接続を確認してください' } });
    }
    if (offline) return route.abort();
    return route.fulfill({ json: {
      messages: [
        { id: 'a', actor: 'agent', seq: 1, content_redacted: '説明してください' },
        ...(saved ? [
          { id: 's', actor: 'student', seq: 2, content_redacted: '傾きは2です' },
          { id: 'b', actor: 'agent', seq: 3, content_redacted: '変化を例で教えてください' },
        ] : []),
      ], conversation: { state: 'active' },
    } });
  });
  await page.goto('http://review.test');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const send = () => page.getByRole('button', { name: '送信', exact: true });
  const submit = async () => {
    await page.locator('#chat-input').fill('傾きは2です');
    await send().click();
  };
  const restored = () => page.waitForFunction(() => document.querySelector('#chat-input').value === '傾きは2です');

  await submit();
  await restored();
  assert.equal(posts, 1);
  assert.equal(await page.getByRole('log').getByText('傾きは2です').count(), 0);
  console.log('PASS: 未保存なら入力を復元し、自動再送しない');

  await page.evaluate(() => window.mount('saved'));
  saved = true;
  await submit();
  await page.getByText('変化を例で教えてください', { exact: true }).waitFor();
  assert.equal(await page.locator('#chat-input').inputValue(), '');
  assert.equal(posts, 2);
  assert.equal(await page.getByRole('log').getByText('傾きは2です', { exact: true }).count(), 1);
  console.log('PASS: 保存済みの返信を読み直し、二重に送らない');

  await page.getByRole('button', { name: /直前の送信を取り消す/ }).click();
  await restored();
  await submit();
  await page.getByText('変化を例で教えてください', { exact: true }).waitFor();
  assert.equal(await page.locator('#chat-input').inputValue(), '');
  assert.equal(posts, 3);
  console.log('PASS: 取り消し後も保存済み送信を未保存と誤判定しない');

  await page.evaluate(() => window.mount('offline'));
  offline = true;
  saved = false;
  await submit();
  await page.getByRole('button', { name: '送信状況を確認', exact: true }).waitFor();
  assert.equal(await send().isDisabled(), true);
  offline = false;
  await page.getByRole('button', { name: '送信状況を確認', exact: true }).click();
  await restored();
  assert.equal(await send().isDisabled(), false);
  assert.equal(posts, 4);
  assert.deepEqual(errors, []);
  console.log('PASS: 接続断中は重ねて送れず、再接続後に復旧する');
} finally {
  await browser.close();
}
