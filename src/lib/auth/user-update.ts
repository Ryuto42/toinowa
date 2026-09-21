import { z } from 'zod';
import { studentIntakeSchema } from '@/lib/plans/schema';
import { studentLoginIdSchema } from '@/lib/auth/student-credentials';
export const userUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  status: z.enum(['active', 'invited', 'suspended']).optional(),
  loginIdentifier: studentLoginIdSchema.nullable().optional(),
  examAnalysisId: z.uuid().optional(),
  profile: studentIntakeSchema.omit({ classroomId: true }).optional(),
}).strict().refine(value => Object.keys(value).length > 0, '変更内容を入力してください');
