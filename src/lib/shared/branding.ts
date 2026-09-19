import { clientEnv } from './env.client';

/**
 * アプリ名を知っている唯一の場所。
 *
 * アプリ名は変更される前提なので、画面文言・metadata・通知テンプレート・
 * システムプロンプトはすべてここを経由すること。
 * 文字列リテラルとして名前を書いた時点で、変更時の取りこぼしが発生する。
 *
 * ESLint (`no-restricted-syntax`) がこのファイル以外でのアプリ名リテラルを禁止している。
 */
export const BRAND = {
  /** 正式名称。ヘッダ・ログイン画面・metadata.title に使う */
  name: clientEnv.NEXT_PUBLIC_APP_NAME,
  /** 短縮名。ナビゲーション・PWA・狭い場所に使う */
  shortName: clientEnv.NEXT_PUBLIC_APP_SHORT_NAME,
  /** 一行説明。ログイン画面・OGP description に使う */
  tagline: clientEnv.NEXT_PUBLIC_APP_TAGLINE,
} as const;

/** 通知・メールテンプレートの `{{appName}}` を差し込む */
export function renderTemplate(
  template: string,
  vars: Record<string, string> = {},
): string {
  const all: Record<string, string> = {
    appName: BRAND.name,
    appShortName: BRAND.shortName,
    ...vars,
  };
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in all ? all[key] : match,
  );
}
