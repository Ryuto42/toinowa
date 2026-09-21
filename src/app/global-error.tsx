'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="ja">
    <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, display: 'grid', placeItems: 'center', minHeight: '100vh', background: '#fbfcfb', color: '#17233d' }}>
      <div style={{ maxWidth: 420, padding: 32, textAlign: 'center' }}>
        <h1 style={{ fontSize: 22 }}>画面を表示できませんでした</h1>
        <p style={{ lineHeight: 1.8, color: '#60708d' }}>一時的な問題の可能性があります。もう一度お試しください。</p>
        <button type="button" onClick={reset} style={{ marginTop: 16, padding: '12px 20px', borderRadius: 12, border: 0, background: '#047857', color: '#fff', fontWeight: 700 }}>もう一度試す</button>
        {error.digest ? <p style={{ marginTop: 20, fontSize: 12, color: '#94a3b8' }}>問い合わせ番号: {error.digest}</p> : null}
      </div>
    </body>
  </html>;
}
