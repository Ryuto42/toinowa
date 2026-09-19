import { SafetyBlocked } from '@/lib/orcarouter/errors';
import { inspectInput, type InputInspection } from './injection';
import { checkModelOutput, type OutputCheckOptions, type OutputCheckResult } from './output-check';
import { maskPII, type MaskedText } from './pii';

export interface GuardInputResult {
  inspection: InputInspection;
  masked: MaskedText;
}

export function preCheck(input: string): GuardInputResult {
  const inspection = inspectInput(input);
  if (inspection.risk === 'high') {
    throw new SafetyBlocked('app_rule', inspection.categories.join(','));
  }
  return { inspection, masked: maskPII(inspection.normalized) };
}

export function postCheck(text: string, options?: OutputCheckOptions): OutputCheckResult {
  const result = checkModelOutput(text, options);
  if (!result.safe) throw new SafetyBlocked('app_rule', result.flags.join(','));
  return result;
}
