import type { NextConfig } from "next";

/**
 * 全レスポンスに付ける防御ヘッダ。
 *
 * 生徒の学習記録を扱うので、埋め込み（クリックジャッキング）と
 * 参照元の漏れは塞いでおく。CSP は Next.js のインラインスクリプトが必要なため
 * script-src に 'unsafe-inline' を許すが、frame-ancestors と form-action は厳しくする。
 *
 * 'unsafe-eval' は開発時のみ。HMR が eval を使う一方、本番で必要なのは
 * pdf.js だけだったので `isEvalSupported: false`（document-reader.tsx）で外した。
 */
const dev = process.env.NODE_ENV !== 'production';

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // Next.js のハイドレーション用インラインスクリプト
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  // Google Fonts（Material Symbols）
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  // Supabase（認証・DB・Realtime）
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "frame-src 'none'",
  "upgrade-insecure-requests",
].join('; ');

const nextConfig: NextConfig = {
  // サーバの実装を名乗らない。
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        // 音声入力で自オリジンのみマイクを使う。埋め込まれた第三者には渡さない。
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), interest-cohort=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      ],
    }];
  },
};

export default nextConfig;
