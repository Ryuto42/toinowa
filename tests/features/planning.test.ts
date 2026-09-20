import { describe, expect, it } from 'vitest';
import { schedulePlan, studentIntakeSchema } from '@/lib/plans/schema';
import { classForDifficulty, modelsForClass } from '@/lib/orcarouter/selection';
import { documentImagesSchema, hasImageSignature } from '@/lib/materials/images';
import { summarizeUsage } from '@/lib/admin/usage-summary';
describe('learning plan constraints', () => {
  it('caps daily workload and rolls dates over month boundaries', () => {
    const task = { concept: '割合', goal: '説明する', minutes: 90, difficulty: 2 };
    const plan = schedulePlan(Array.from({ length: 9 }, () => task), 15, '2026-09-30');
    expect(plan).toHaveLength(7);
    expect(plan.every(item => item.est_min === 15)).toBe(true);
    expect(plan[1].scheduled_for).toBe('2026-10-01');
  });
  it('requires grade, goal and classroom at registration', () => {
    expect(studentIntakeSchema.safeParse({}).success).toBe(false);
  });
});
describe('model policy', () => {
  it('routes by difficulty and keeps the evaluation selector configurable', () => {
    expect([1,2,3,4,5].map(classForDifficulty)).toEqual(['economy','economy','standard','advanced','advanced']);
    expect(() => classForDifficulty(0)).toThrow();
    expect(modelsForClass('advanced', {})[0]).toBe('orcarouter/auto');
    expect(modelsForClass('advanced', { AI_ADVANCED_MODEL: 'openai/gpt-5-nano' })[0]).toBe('openai/gpt-5-nano');
  });
});
describe('document input boundaries', () => {
  it('rejects remote URLs and mislabeled image files', () => {
    expect(documentImagesSchema.safeParse({ purpose: 'lesson', images: ['https://internal.example/image.png'] }).success).toBe(false);
    expect(hasImageSignature('data:image/png;base64,SGVsbG8=')).toBe(false);
    expect(hasImageSignature('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
  });
});
describe('usage attribution', () => {
  it('groups by person AND model, uses student attribution for old records', () => {
    const base = { input_tokens: 10, output_tokens: 20, estimated_cost_usd: 0.01, status: 'ok', fallback_count: 0, created_at: '2026-09-20' };
    const result = summarizeUsage([{ ...base, student_id: 's', resolved_model: 'a' }, { ...base, actor_id: 's', resolved_model: 'a' }, { ...base, actor_id: 's', resolved_model: 'b' }], { s: '生徒' });
    expect(result).toHaveLength(2);
    expect(result.find(item => item.model === 'a')).toMatchObject({ userName: '生徒', requests: 2, tokens: 60, costUsd: 0.02 });
  });
});
