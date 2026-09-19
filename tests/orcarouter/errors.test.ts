import { describe, expect, it } from 'vitest';
import {
  errorCodeOf,
  isGuardError,
  isQuotaError,
  isRetryable,
} from '@/lib/orcarouter/errors';

describe('OrcaRouter error classification', () => {
  it('認証SDKが展開した APIError.error の code を読む', () => {
    const err = {
      status: 402,
      error: {
        code: 'free_quota_exhausted',
        type: 'insufficient_quota',
      },
    };

    expect(errorCodeOf(err)).toBe('free_quota_exhausted');
    expect(isQuotaError(err)).toBe(true);
    expect(isRetryable(err)).toBe(true);
  });

  it('生のHTTPエラー本体 `{ error: ... }` も分類する', () => {
    const err = {
      status: 400,
      error: { code: 'guardrail_blocked', type: 'policy_violation' },
    };

    expect(errorCodeOf(err)).toBe('guardrail_blocked');
    expect(isGuardError(err)).toBe('orca_guardrail');
    expect(isRetryable(err)).toBe(false);
  });

  it('レスポンスだけを持つHTTPクライアントのエラーも読む', () => {
    const err = {
      response: {
        status: 429,
        data: { error: { code: 'rate_limit_exceeded' } },
      },
    };

    expect(errorCodeOf(err)).toBe('rate_limit_exceeded');
    expect(isQuotaError(err)).toBe(true);
  });

  it('認証や入力不備の4xxは別モデルへ送らない', () => {
    expect(isRetryable({ status: 401 })).toBe(false);
    expect(isRetryable({ status: 400 })).toBe(false);
    expect(isRetryable({ status: 408 })).toBe(true);
    expect(isRetryable({ status: 503 })).toBe(true);
  });
});
