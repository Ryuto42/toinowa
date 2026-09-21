'use client';

import Link from 'next/link';
import { DataTable } from '@/components/data-table';
import { StatusPill } from '@/components/dashboard';

export interface StudentRow { id: string; name: string; status: string; classrooms: string[] }

const STATUS_LABELS: Record<string, string> = { active: '在籍中', suspended: '停止中', invited: '招待済み' };

export function StudentsTable({ rows }: { rows: StudentRow[] }) {
  return <DataTable
    rows={rows}
    getKey={student => student.id}
    searchIn={student => `${student.name} ${student.classrooms.join(' ')}`}
    searchPlaceholder="氏名・クラスで検索"
    unit="名"
    empty="該当する生徒はいません"
    initialSort={{ key: 'name' }}
    filters={[
      {
        key: 'classroom', label: 'クラス',
        // 実際に在籍のあるクラスだけを出す。使われていない選択肢は並べない。
        options: [...new Set(rows.flatMap(student => student.classrooms))].sort((a, b) => a.localeCompare(b, 'ja'))
          .map(name => ({ value: name, label: name })),
        match: (student, value) => student.classrooms.includes(value),
      },
      {
        key: 'status', label: '状態',
        options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
        match: (student, value) => student.status === value,
      },
    ]}
    columns={[
      { key: 'name', label: '氏名', sortBy: student => student.name, render: student => <Link href={`/teacher/students/${student.id}`} className="font-bold text-[#237d75] underline">{student.name}</Link> },
      { key: 'classrooms', label: 'クラス', sortBy: student => student.classrooms.join(' ') || null, render: student => <span className="text-slate-500">{student.classrooms.join(' · ') || 'クラス未設定'}</span> },
      { key: 'status', label: '状態', align: 'right', sortBy: student => STATUS_LABELS[student.status] ?? student.status, render: student => <StatusPill tone={student.status === 'active' ? 'emerald' : 'amber'}>{STATUS_LABELS[student.status] ?? student.status}</StatusPill> },
    ]}
  />;
}
