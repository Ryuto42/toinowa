'use client';

/**
 * ルートレイアウトごと落ちたときの最後の受け皿。
 * ここは自前の <html> を描くので、アプリのCSSもフォントも使えない。
 * 素のスタイルだけで、伝えることを伝える。
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="ja">
    <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, display: 'grid', placeItems: 'center', minHeight: '100vh', background: '#fbfcfb', color: '#17233d' }}>
      <div style={{ maxWidth: 460, padding: 32 }}>
        <h1 style={{ fontSize: 22, marginBottom: 12 }}>画面を表示できませんでした</h1>
        <p style={{ lineHeight: 1.8, color: '#60708d', margin: 0 }}>
          一時的な問題の可能性があります。もう一度試しても直らない場合は、学校の管理者にご連絡ください。
        </p>
        <button type="button" onClick={reset} style={{ marginTop: 20, padding: '12px 20px', borderRadius: 12, border: 0, background: '#047857', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          もう一度試す
        </button>
        <div style={{ marginTop: 24, background: '#f7faf9', borderRadius: 12, padding: 16, lineHeight: 1.8, color: '#52637d', fontSize: 14 }}>
          <strong style={{ color: '#17233d' }}>管理者に連絡するとき</strong>
          <p style={{ margin: '4px 0 0' }}>いつ・どの画面で起きたかと、下の番号をお伝えください。</p>
          <p style={{ margin: '8px 0 0', fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#94a3b8' }}>
            問い合わせ番号: {error.digest ?? '（番号なし）'}
          </p>
        </div>
      </div>
    </body>
  </html>;
}
