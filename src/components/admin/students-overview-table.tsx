'use client';

import Link from 'next/link';
import { DataTable } from '@/components/data-table';
import { StatusPill } from '@/components/dashboard';

export interface AdminStudentRow {
  id: string;
  name: string;
  status: string;
  grade: string | null;
  classrooms: string[];
  teachers: string[];
  completed: number;
  inProgress: number;
  notStarted: number;
  averageScore: number | null;
  lastActiveOn: string | null;
  openFollowUps: number;
}

const STATUS_LABELS: Record<string, string> = { active: '在籍中', suspended: '停止中', invited: '招待済み' };

export function StudentsOverviewTable({ rows }: { rows: AdminStudentRow[] }) {
  const teacherOptions = [...new Set(rows.flatMap(row => row.teachers))].sort((a, b) => a.localeCompare(b, 'ja'));
  const classroomOptions = [...new Set(rows.flatMap(row => row.classrooms))].sort((a, b) => a.localeCompare(b, 'ja'));

  return <DataTable
    rows={rows}
    getKey={row => row.id}
    searchIn={row => `${row.name} ${row.grade ?? ''} ${row.classrooms.join(' ')} ${row.teachers.join(' ')}`}
    searchPlaceholder="氏名・学年・クラス・担当で検索"
    unit="名"
    empty="該当する生徒はいません"
    initialSort={{ key: 'name' }}
    filters={[
      { key: 'classroom', label: 'クラス', options: classroomOptions.map(name => ({ value: name, label: name })), match: (row, value) => row.classrooms.includes(value) },
      { key: 'teacher', label: '担当', options: [...teacherOptions.map(name => ({ value: name, label: name })), { value: '__none__', label: '担当なし' }], match: (row, value) => value === '__none__' ? !row.teachers.length : row.teachers.includes(value) },
      { key: 'submission', label: '提出', options: [{ value: 'pending', label: '未提出あり' }, { value: 'none', label: '未着手のみ' }, { value: 'done', label: 'すべて完了' }], match: (row, value) => {
        if (value === 'done') return row.completed > 0 && row.inProgress === 0 && row.notStarted === 0;
        if (value === 'none') return row.completed === 0 && row.inProgress === 0;
        return row.inProgress > 0 || row.notStarted > 0;
      } },
      { key: 'status', label: '状態', options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })), match: (row, value) => row.status === value },
    ]}
    columns={[
      { key: 'name', label: '氏名', sortBy: row => row.name, render: row => <span className="flex flex-wrap items-center gap-2">
        <Link href={`/admin/students/${row.id}`} className="font-bold text-[#237d75] underline">{row.name}</Link>
        {row.openFollowUps ? <StatusPill tone="rose">要フォロー{row.openFollowUps}</StatusPill> : null}
      </span> },
      { key: 'grade', label: '学年', hideOnMobile: true, sortBy: row => row.grade, render: row => row.grade ?? '—' },
      { key: 'classrooms', label: 'クラス', sortBy: row => row.classrooms.join(' ') || null, render: row => <span className="text-slate-500">{row.classrooms.join(' · ') || 'クラス未設定'}</span> },
      { key: 'teachers', label: '担当の先生', hideOnMobile: true, sortBy: row => row.teachers.join('、') || null,
        // 担当がいない生徒は誰の一覧にも出ない。管理者が気付けるよう赤字で出す。
        render: row => row.teachers.length ? row.teachers.join('、') : <span className="font-bold text-rose-600">担当なし</span> },
      { key: 'submission', label: '提出（完了/進行中/未着手）', align: 'right', sortBy: row => row.completed, render: row => <span className="whitespace-nowrap">
        <span className="font-bold text-emerald-700">{row.completed}</span>
        {' / '}<span className="text-amber-700">{row.inProgress}</span>
        {' / '}<span className="text-slate-400">{row.notStarted}</span>
      </span> },
      { key: 'score', label: '理解度', align: 'right', sortBy: row => row.averageScore, render: row => row.averageScore === null ? '—' : `${Math.round(row.averageScore * 100)}点` },
      { key: 'active', label: '最終活動', align: 'right', hideOnMobile: true, sortBy: row => row.lastActiveOn, render: row => row.lastActiveOn ?? '—' },
      { key: 'status', label: '状態', align: 'right', sortBy: row => STATUS_LABELS[row.status] ?? row.status, render: row => <StatusPill tone={row.status === 'active' ? 'emerald' : 'amber'}>{STATUS_LABELS[row.status] ?? row.status}</StatusPill> },
    ]}
  />;
}
