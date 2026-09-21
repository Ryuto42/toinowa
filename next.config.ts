import type { NextConfig } from "next";

/**
 * 全レスポンスに付ける防御ヘッダ。
 *
 * 生徒の学習記録を扱うので、埋め込み（クリックジャッキング）と
 * 参照元の漏れは塞いでおく。CSP は Next.js のインラインスクリプトが必要なため
 * script-src に 'unsafe-inline' を許すが、frame-ancestors と form-action は厳しくする。
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // Next.js のハイドレーション用インラインスクリプト
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // Google Fonts（Material Symbols）
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  // Supabase（認証・DB・Realtime）
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ');

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      ],
    }];
  },
};

export default nextConfig;
