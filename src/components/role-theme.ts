export type AppRole = 'student' | 'teacher' | 'admin';

interface RoleTheme {
  label: string;
  /** アバターとブランドマークの背景。ロールを色で見分けられるようにする */
  gradient: string;
  guideHref: string;
}

/**
 * ロールごとの見た目。
 *
 * 同じ画面構成を3つのロールで共有しているので、いま誰として見ているのかが
 * 一目で分かるように、アイコンの背景色だけを変えている。
 * 文字色や余白まで変えると、同じ機能が別物に見えてしまう。
 */
export const ROLE_THEME: Record<AppRole, RoleTheme> = {
  student: {
    label: '生徒',
    gradient: 'bg-gradient-to-br from-[#12a08d] to-[#5fd3ab]',
    guideHref: '/student/guide',
  },
  teacher: {
    label: '先生',
    gradient: 'bg-gradient-to-br from-[#1f3a6e] to-[#3f86bd]',
    guideHref: '/teacher/guide',
  },
  admin: {
    label: '管理者',
    gradient: 'bg-gradient-to-br from-[#5b3fa0] to-[#a86ad0]',
    guideHref: '/admin/guide',
  },
};
