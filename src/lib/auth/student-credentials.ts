import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';

export const studentLoginIdSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,39}$/, 'ログインIDは3〜40文字の半角英数字・ピリオド・ハイフン・アンダースコアで入力してください');
export const newPasswordSchema = z.string().min(12, '新しいパスワードは12文字以上で入力してください').max(128);
export function generateStudentCredentials() {
  return { initialPassword: `${randomBytes(12).toString('base64url')}Aa1!`, authEmail: `student-${randomUUID()}@students.invalid` };
}
