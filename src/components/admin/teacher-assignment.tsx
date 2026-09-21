'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
export interface TeacherOption { id: string; name: string }
export function TeacherPicker({ teachers, selected = [] }: { teachers: TeacherOption[]; selected?: string[] }) {
  return <fieldset className="min-w-0"><legend className="text-sm font-bold">担当の先生（任意・複数選択可）</legend><p className="mt-1 text-xs leading-6 text-slate-600">クラスなしで個別指導できます。未設定の場合は、後からユーザー編集で担当を追加してください。</p><div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3">{teachers.length ? teachers.map(t => <label key={t.id} className="flex items-center gap-2 text-sm"><input name="teacherIds" type="checkbox" value={t.id} defaultChecked={selected.includes(t.id)} />{t.name}</label>) : <p className="text-sm text-slate-500">先生を先にユーザー登録すると、ここで選択できます。</p>}</div></fieldset>;
}
export function TeacherAssignment({ studentId, teachers, selected }: { studentId: string; teachers: TeacherOption[]; selected: string[] }) {
  const router = useRouter();
  const [busy,setBusy] = useState(false);
  const [status,setStatus] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setStatus('');
    try {
      const response = await fetch(`/api/admin/users/${studentId}/teachers`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({teacherIds:data.getAll('teacherIds')})});
      const result = await response.json();
      if(!response.ok) throw new Error(result.message ?? '保存できませんでした');
      setStatus('担当を保存しました。先生は生徒を選んで授業記録を渡せます。'); router.refresh();
    } catch(error) { setStatus(error instanceof Error ? error.message : '通信に失敗しました'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save}><fieldset disabled={busy}><TeacherPicker key={selected.join(',')} teachers={teachers} selected={selected} /><button className="mt-4 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={busy}>担当を保存</button></fieldset><p role="status" className="mt-3 text-sm">{status}</p><p className="mt-2 text-xs text-slate-500">クラスでの担当設定とは別です。外した先生も、同じクラスを担当している場合はそのクラスの生徒情報を閲覧できます。</p></form>;
}
