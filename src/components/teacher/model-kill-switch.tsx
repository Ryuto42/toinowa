'use client';

import { useState } from 'react';

export function ModelKillSwitch({ model, initiallyDisabled }: { model: string; initiallyDisabled: boolean }) {
  const [disabled, setDisabled] = useState(initiallyDisabled);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    const response = await fetch('/api/ops/demo/kill-model', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, disabled: !disabled, reason: '運用画面からの障害注入' }) });
    if (response.ok) setDisabled(!disabled);
    setBusy(false);
  }
  return <button onClick={toggle} disabled={busy} className={`rounded-xl px-4 py-2.5 text-sm font-bold text-white ${disabled ? 'bg-emerald-700' : 'bg-rose-700'}`}>{busy ? '切替中…' : disabled ? '主モデルを復帰' : '主モデルを停止'}</button>;
}
