import Link from 'next/link';
import { requireRole } from '@/lib/auth/guard';
import { getTenant } from '@/lib/admin/data';
import { PageTitle, Panel } from '@/components/dashboard';
import { MODEL_TIER } from '@/lib/shared/env.server';

const LINKS = [
  { href: '/admin/tenant', title: '学校設定', body: '学校・組織名を変更します。' },
  { href: '/admin/limits', title: '利用上限', body: 'AIの予算上限を決めます。超過した呼び出しはモデルに届く前に止まります。' },
  { href: '/admin/retention', title: 'データ保持', body: '会話とAIログを何日で消すかを決めます。夜間のジョブが実際に削除します。' },
  { href: '/admin/audit', title: '監査ログ', body: '誰が何をしたかを、許可・拒否・エラーとも同じ形式で記録しています。' },
  { href: '/admin/line', title: 'LINE連携', body: '接続状態だけを確認できます。連携の実装は次の段階です。' },
];

export default async function AdminSettingsPage() {
  const context = await requireRole('admin');
  const tenant = await getTenant(context.tenantId);
  return <div>
    <PageTitle title="設定" description="学校単位の設定と記録をまとめています。" />
    <div className="mb-6 grid gap-4 sm:grid-cols-3">
      <Panel title="学校・組織名"><p className="font-bold">{tenant?.name ?? '未設定'}</p></Panel>
      <Panel title="AI予算上限"><p className="font-bold">${Number(tenant?.ai_budget_limit_usd ?? 0).toFixed(2)} / 日</p></Panel>
      <Panel title="モデル階層"><p className="font-bold">{MODEL_TIER === 'production' ? '本番モデル' : '開発モデル'}</p></Panel>
    </div>
    <Panel title="設定項目">
      <div className="divide-y divide-slate-100">
        {LINKS.map((link) => <Link key={link.href} href={link.href} className="flex items-center justify-between gap-4 py-4 first:pt-0">
          <div>
            <p className="font-bold">{link.title}</p>
            <p className="mt-1 text-sm text-slate-500">{link.body}</p>
          </div>
          <span aria-hidden="true" className="shrink-0 text-sm font-bold text-[#237d75]">開く ›</span>
        </Link>)}
      </div>
    </Panel>
  </div>;
}
