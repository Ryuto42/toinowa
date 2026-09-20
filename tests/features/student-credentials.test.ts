import { describe, expect, it } from 'vitest';
import { generateStudentCredentials, studentLoginIdSchema, newPasswordSchema } from '@/lib/auth/student-credentials';
describe('student credentials', () => {
  it('issues independent random initial passwords and internal addresses', () => {
    const values = Array.from({ length: 50 }, generateStudentCredentials);
    expect(new Set(values.map(v => v.initialPassword)).size).toBe(50);
    expect(new Set(values.map(v => v.authEmail)).size).toBe(50);
    expect(values.every(v => v.initialPassword.length >= 16 && v.authEmail.endsWith('@students.invalid'))).toBe(true);
  });
  it('normalizes IDs and rejects email or ambiguous separators', () => {
    expect(studentLoginIdSchema.parse(' Student_01 ')).toBe('student_01');
    for (const id of ['a@b.com','abc def','abc/def','あいう','ab']) expect(studentLoginIdSchema.safeParse(id).success).toBe(false);
  });
  it('requires a new password of at least 12 characters', () => {
    expect(newPasswordSchema.safeParse('12345678').success).toBe(false);
    expect(newPasswordSchema.safeParse('different-long-password').success).toBe(true);
  });
});
