import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/** アプリ名は BRAND ひとつから引く。ここ以外に文字列で書くと、改名時に必ず1つ残る。 */
const BRAND_ALLOWED = ["src/lib/shared/branding.ts", "src/lib/shared/env.client.ts"];

/** 理解度の計算は I/O ゼロの純関数に保つ。DBやモデルに依存すると再現も説明もできなくなる。 */
const PURE_MASTERY = ["src/lib/mastery/compute.ts", "src/lib/mastery/difficulty.ts"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/pdf.worker.min.mjs",
  ]),
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: BRAND_ALLOWED,
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/トイノワ/]",
          message: "アプリ名を直接書かないでください。@/lib/shared/branding の BRAND を使ってください。",
        },
        {
          selector: "TemplateElement[value.raw=/トイノワ/]",
          message: "アプリ名を直接書かないでください。@/lib/shared/branding の BRAND を使ってください。",
        },
      ],
    },
  },
  {
    files: PURE_MASTERY,
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/lib/database/*", "@/lib/orcarouter/*", "@/lib/agents/*", "server-only"],
          message: "理解度の計算は純関数に保ってください（I/Oもモデル呼び出しも入れない）。",
        }],
      }],
    },
  },
  {
    files: ["src/lib/agents/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/lib/database/*", "!@/lib/database/types"],
          message: "エージェントからDBを直接触らないでください（型の import だけ可）。呼び出し側から値を渡してください。",
        }],
      }],
    },
  },
  {
    // service role キーを握るクライアントは、サーバー側の限られた場所からだけ使う。
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/lib/database/admin", "@/lib/shared/env.server"],
          message: "コンポーネントから service role やサーバー環境変数を触らないでください。",
        }],
      }],
    },
  },
]);

export default eslintConfig;
