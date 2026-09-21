import { describe, it, expect } from 'vitest';
import { studentIntakeSchema } from '@/lib/plans/schema';
import { examAnalysisResultSchema } from '@/lib/materials/exam-analysis';
import { summarizeUsage, usageFeature } from '@/lib/admin/usage-summary';
describe('optional intake and usage attribution', () => {
  it('allows optional fields to be absent without inventing a user preference', () => {
    const result = studentIntakeSchema.parse({ grade:'中2' });
    expect(result.learningGoal).toBe(''); expect(result.weakAreas).toBe(''); expect(result.dailyTimeLimitMin).toBeNull();
  });
  it('allows uncertain model recommendations but rejects out-of-range minutes', () => {
    const result={text:'数学50点',learningGoal:'',weakAreas:'',dailyTimeLimitMin:null,rationale:'情報が不足',uncertainties:['満点が不明']};
    expect(examAnalysisResultSchema.safeParse(result).success).toBe(true);
    expect(examAnalysisResultSchema.safeParse({...result,dailyTimeLimitMin:999}).success).toBe(false);
  });
  it('separates use of the same model by feature', () => {
    const base={actor_id:'a',resolved_model:'same',input_tokens:10,output_tokens:10,estimated_cost_usd:0.001,status:'ok',fallback_count:0,created_at:'2026-09-21'};
    const rows=summarizeUsage([{...base,request_type:'learning_support'},{...base,request_type:'analyze_exam_profile'}],{a:'管理者'});
    expect(rows).toHaveLength(2);expect(rows.map(row=>row.feature)).toContain('模試からのプロフィール提案');
    expect(usageFeature('extract_lesson').location).toContain('先生');
  });
});
