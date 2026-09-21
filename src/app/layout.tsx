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
      <head>
        {/* Material Symbols（Google Fonts）。使うアイコンだけを指定して読み込み量を抑える。 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* App Router では <head> に置くのが正しい。pages/_document を前提にした規則なので無効化する。
            display=block は、フォント読み込み前に「edit」などの文字が見えてしまうのを防ぐため。 */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,400,0,0&icon_names=archive,delete,edit,insights,swap_horiz,unarchive,visibility&display=block"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
