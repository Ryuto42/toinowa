import type { Metadata } from "next";
import { BRAND } from "@/lib/shared/branding";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: BRAND.name,
    template: `%s | ${BRAND.name}`,
  },
  description: BRAND.tagline,
  applicationName: BRAND.name,
  manifest: '/manifest.webmanifest',
  // 学習記録を含む画面なので、共有リンクのプレビューや検索結果には出さない。
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    siteName: BRAND.name,
    title: BRAND.name,
    description: BRAND.tagline,
    locale: 'ja_JP',
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
