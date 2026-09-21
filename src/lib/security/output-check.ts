export interface OutputCheckOptions {
  systemFragments?: string[];
  allowedUrlHosts?: string[];
}

export interface OutputCheckResult {
  safe: boolean;
  flags: string[];
  matched: string[];
}

/** system文の照合に使う窓。短くすると普通の言い回しに当たり、長くすると部分的な写しを逃す。 */
const WINDOW = 40;
const STEP = 10;

const secretPatterns: Array<{ flag: string; pattern: RegExp }> = [
  { flag: 'api_key', pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { flag: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
  { flag: 'private_key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

function urlsOutsideAllowlist(text: string, allowed: string[]): string[] {
  const matches = text.match(/https?:\/\/[^\s<>()]+/gi) ?? [];
  return matches.filter((url) => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return !allowed.some((item) => host === item || host.endsWith(`.${item}`));
    } catch {
      return true;
    }
  });
}

/** モデル出力から秘密値・system断片・未許可URLを除外する。 */
export function checkModelOutput(
  text: string,
  options: OutputCheckOptions = {},
): OutputCheckResult {
  text = text.replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069]/g, '').normalize('NFKC');
  const flags: string[] = [];
  const matched: string[] = [];
  for (const item of secretPatterns) {
    const hit = text.match(item.pattern);
    if (hit) {
      flags.push(item.flag);
      matched.push(...hit.map((value) => value.slice(0, 80)));
    }
  }

  // system文の漏えいは、文の区切りで割って照合するだけでは足りない。
  // 途中で切れた抜粋（先頭80文字だけ、など）はどの区切りとも一致せず素通りする。
  // 固定長の窓をずらしながら当てる。1か所でも一致すれば写している。
  for (const raw of options.systemFragments ?? []) {
    const fragment = raw.normalize('NFKC').replace(/\s+/gu, ' ').trim();
    if (fragment.length < WINDOW) continue;
    const haystack = text.replace(/\s+/gu, ' ');
    for (let at = 0; at + WINDOW <= fragment.length; at += STEP) {
      const window = fragment.slice(at, at + WINDOW);
      if (!haystack.includes(window)) continue;
      flags.push('system_prompt_leak');
      matched.push(window.slice(0, 80));
      break;
    }
  }

  const externalUrls = urlsOutsideAllowlist(text, options.allowedUrlHosts ?? []);
  if (externalUrls.length > 0) {
    flags.push('external_url');
    matched.push(...externalUrls.map((value) => value.slice(0, 120)));
  }

  return { safe: flags.length === 0, flags: [...new Set(flags)], matched };
}
