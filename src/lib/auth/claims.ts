import { z } from 'zod';
import type { AppRole } from './types';

const roleSchema = z.enum(['student', 'teacher', 'admin', 'none']);

export function roleFromClaims(value: unknown): AppRole {
  const parsed = roleSchema.safeParse(value);
  return parsed.success ? parsed.data : 'none';
}
