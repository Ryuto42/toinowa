export interface OutputCheckOptions {
  systemFragments?: string[];
  allowedUrlHosts?: string[];
}

export interface OutputCheckResult {
  safe: boolean;
  flags: string[];
  matched: string[];
}

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
  const flags: string[] = [];
  const matched: string[] = [];
  for (const item of secretPatterns) {
    const hit = text.match(item.pattern);
    if (hit) {
      flags.push(item.flag);
      matched.push(...hit.map((value) => value.slice(0, 80)));
    }
  }

  const fragments = options.systemFragments ?? [];
  for (const fragment of fragments) {
    if (fragment.length >= 12 && text.includes(fragment)) {
      flags.push('system_prompt_leak');
      matched.push(fragment.slice(0, 80));
    }
  }

  const externalUrls = urlsOutsideAllowlist(text, options.allowedUrlHosts ?? []);
  if (externalUrls.length > 0) {
    flags.push('external_url');
    matched.push(...externalUrls.map((value) => value.slice(0, 120)));
  }

  return { safe: flags.length === 0, flags: [...new Set(flags)], matched };
}
