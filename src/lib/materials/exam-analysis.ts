import { z } from 'zod';
export const examBaselineSchema = z.object({
  learningGoal: z.string().max(2000).default(''), weakAreas: z.string().max(4000).default(''),
  examResults: z.string().max(20000).default(''), dailyTimeLimitMin: z.number().int().min(5).max(240).nullable().default(null),
});
export const examAnalysisResultSchema = z.object({
  text: z.string().min(1).max(20000), learningGoal: z.string().max(2000), weakAreas: z.string().max(4000),
  dailyTimeLimitMin: z.number().int().min(5).max(120).nullable(),
  rationale: z.string().max(2000), uncertainties: z.array(z.string().max(300)).max(12),
});
export type ExamBaseline = z.infer<typeof examBaselineSchema>;
export type ExamAnalysisResult = z.infer<typeof examAnalysisResultSchema>;
