'use client';

import { FormEvent, useState } from 'react';

export function SettingsForm({ initial }: { initial: { dailyTimeLimitMin: number | null; learningPreferences: unknown; notificationSettings: unknown; consentStatus: unknown } }) {
  const preferences = Array.isArray(initial.learningPreferences) ? initial.learningPreferences.filter((v): v is string => typeof v === 'string').join('、') : '';
  const settings = initial.notificationSettings && typeof initial.notificationSettings === 'object' && !Array.isArray(initial.notificationSettings) ? initial.notificationSettings as Record<string, unknown> : {};
  const consent = initial.consentStatus && typeof initial.consentStatus === 'object' && !Array.isArray(initial.consentStatus) ? initial.consentStatus as Record<string, unknown> : {};
  const [minutes, setMinutes] = useState(initial.dailyTimeLimitMin);
  const [preferenceText, setPreferenceText] = useState(preferences);
  const [preferredTime, setPreferredTime] = useState(typeof settings.preferred_time === 'string' ? settings.preferred_time : '19:00');
  const [aiUse, setAiUse] = useState(consent.ai_use === true);
  const [status, setStatus] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault(); setStatus('保存中…');
    const response = await fetch('/api/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dailyTimeLimitMin: minutes, learningPreferences: preferenceText.split(/[、,]/).map((v) => v.trim()).filter(Boolean), notificationSettings: { ...settings, preferred_time: preferredTime }, consentStatus: { ...consent, ai_use: aiUse } }) });
    setStatus(response.ok ? '保存しました' : '保存できませんでした');
  }
  return <form onSubmit={save} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6">
    <label className="block"><span className="text-sm font-bold">1日の目標学習時間（任意）</span><input type="number" min={5} max={240} value={minutes ?? ''} onChange={(e) => setMinutes(e.target.value ? Number(e.target.value) : null)} className="mt-2 block w-full rounded-xl border border-slate-300 px-3 py-2"/><span className="mt-1 block text-xs text-slate-500">5〜240分の範囲で設定できます。</span></label>
    <label className="block"><span className="text-sm font-bold">学習の好み</span><input value={preferenceText} onChange={(e) => setPreferenceText(e.target.value)} placeholder="例題から始める、短時間で反復" className="mt-2 block w-full rounded-xl border border-slate-300 px-3 py-2"/></label>
    <label className="block"><span className="text-sm font-bold">通知を受け取りたい時刻</span><input type="time" value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} className="mt-2 block rounded-xl border border-slate-300 px-3 py-2"/></label>
    <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-4"><input type="checkbox" checked={aiUse} onChange={(e) => setAiUse(e.target.checked)} className="mt-1"/><span><span className="block text-sm font-bold">AIを使った学習支援に同意する</span><span className="text-xs text-slate-500">学校のデータ利用方針も適用されます。</span></span></label>
    <div className="flex items-center gap-3"><button className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white">変更を保存</button><span className="text-sm text-slate-600" role="status">{status}</span></div>
  </form>;
}
