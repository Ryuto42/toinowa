import { z } from 'zod';
export const studentIntakeSchema = z.object({
  grade: z.string().trim().min(1).max(40),
  learningGoal: z.string().trim().min(1).max(2000),
  examResults: z.string().trim().max(20000).default(''),
  weakAreas: z.string().trim().max(4000).default(''),
  dailyTimeLimitMin: z.number().int().min(5).max(240).default(30),
  classroomId: z.uuid(),
});

export function schedulePlan(tasks: Array<{ concept: string; goal: string; prompt?: string; difficulty: number; minutes: number }>, dailyMinutes: number, start: string) {
  if (!Number.isInteger(dailyMinutes) || dailyMinutes < 5 || dailyMinutes > 240) throw new Error('学習時間が不正です');
  return tasks.slice(0, 7).map((task, day) => {
    const date = new Date(`${start}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + day);
    return { concept: task.concept, goal: task.goal, prompt: task.prompt ?? task.goal, difficulty: task.difficulty, est_min: Math.min(dailyMinutes, Math.max(1, task.minutes)), scheduled_for: date.toISOString().slice(0, 10), completion_criteria: '自分の言葉で説明し、例を一つ挙げる' };
  });
}
