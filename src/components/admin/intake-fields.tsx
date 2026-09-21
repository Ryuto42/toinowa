'use client';
import { useRef, useState } from 'react';
import { DocumentReader } from '@/components/document-reader';
import type { ExamBaseline, ExamAnalysisResult } from '@/lib/materials/exam-analysis';
export const emptyIntake: ExamBaseline = { learningGoal: '', weakAreas: '', examResults: '', dailyTimeLimitMin: null };
export function useIntake(initial: ExamBaseline = emptyIntake) {
  const [intake, setIntake] = useState(initial);
  const analysisId = useRef<string | undefined>(undefined);
  function analyzed(id: string, result: ExamAnalysisResult, baseline: ExamBaseline) {
    if (id !== analysisId.current) return;
    setIntake(current => ({
      learningGoal: current.learningGoal === baseline.learningGoal ? result.learningGoal || current.learningGoal : current.learningGoal,
      weakAreas: current.weakAreas === baseline.weakAreas ? result.weakAreas || current.weakAreas : current.weakAreas,
      examResults: current.examResults === baseline.examResults ? result.text : current.examResults,
      dailyTimeLimitMin: current.dailyTimeLimitMin === baseline.dailyTimeLimitMin ? result.dailyTimeLimitMin ?? current.dailyTimeLimitMin : current.dailyTimeLimitMin,
    }));
  }
  return { intake, setIntake, getAnalysisId: () => analysisId.current, startAnalysis: (id: string | undefined) => { analysisId.current = id; }, analyzed };
}
export function IntakeFields({ state, onStart }: { state: ReturnType<typeof useIntake>; onStart?: (id: string) => Promise<void> }) {
  const { intake, setIntake, startAnalysis, analyzed } = state;
  const field = 'mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm';
  return <>
    <div className="sm:col-span-2"><DocumentReader purpose="exam" onRead={() => {}} baseline={intake} onAnalysisStarted={id => { startAnalysis(id); return onStart?.(id); }} onAnalyzed={analyzed} /></div>
    <p className="text-xs leading-6 text-slate-500 sm:col-span-2">以下はすべて任意です。模試の分析後にAIの提案を自動入力します。本人の希望と異なる場合は編集してください。</p>
    <label className="text-sm font-bold sm:col-span-2">利用目的・目標（任意）<textarea name="learningGoal" maxLength={2000} rows={2} value={intake.learningGoal} onChange={e => setIntake(current => ({ ...current, learningGoal: e.target.value }))} className={field} /></label>
    <label className="text-sm font-bold">苦手に感じる範囲（任意）<textarea name="weakAreas" maxLength={4000} rows={3} value={intake.weakAreas} onChange={e => setIntake(current => ({ ...current, weakAreas: e.target.value }))} className={field} /></label>
    <label className="text-sm font-bold">1日の学習時間（分・任意）<input name="minutes" type="number" min={5} max={240} value={intake.dailyTimeLimitMin ?? ''} onChange={e => setIntake(current => ({ ...current, dailyTimeLimitMin: e.target.value ? Number(e.target.value) : null }))} placeholder="未設定" className={field} /></label>
    <label className="text-sm font-bold sm:col-span-2">模試結果（任意）<textarea name="examResults" maxLength={20000} rows={5} value={intake.examResults} onChange={e => setIntake(current => ({ ...current, examResults: e.target.value }))} className={field} /></label>
  </>;
}
export function RequiredMark() { return <span className="ml-2 rounded bg-rose-50 px-1.5 py-0.5 text-xs font-semibold text-rose-700">必須</span>; }
