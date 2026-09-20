import 'server-only';
import { adminDb } from '@/lib/database/admin';
import { classroomOfStudent, raiseEscalation } from './raise';

/**
 * 同じ誤概念が直近3回の評価のうち2回以上出ていたら介入を上げる（設計書8.4「高」）。
 *
 * 難易度の降格判定（src/lib/mastery/difficulty.ts）と同じ条件にしてある。
 * 教材を変えても直らないつまずきは、AIの出題調整だけでは解けないため。
 */
export async function checkRepeatedMisconception(tenantId: string, studentId: string, conceptId: string) {
  const { data, error } = await adminDb().from('assessments')
    .select('misconceptions,concepts(name)')
    .eq('tenant_id', tenantId).eq('student_id', studentId).eq('concept_id', conceptId)
    .order('created_at', { ascending: false }).limit(3);
  if (error || !data || data.length < 2) return;

  const counts = new Map<string, { label: string; n: number }>();
  for (const row of data) {
    const items = Array.isArray(row.misconceptions) ? row.misconceptions : [];
    const seen = new Set<string>();
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      const code = typeof record.code === 'string' ? record.code : null;
      if (!code || seen.has(code)) continue;
      seen.add(code);
      const label = typeof record.label === 'string' ? record.label : code;
      const current = counts.get(code) ?? { label, n: 0 };
      counts.set(code, { label, n: current.n + 1 });
    }
  }

  const persistent = [...counts.entries()].find(([, v]) => v.n >= 2);
  if (!persistent) return;

  const conceptName = data[0]?.concepts?.name ?? '単元';
  await raiseEscalation({
    tenantId,
    studentId,
    classroomId: await classroomOfStudent(tenantId, studentId),
    kind: 'repeated_failure',
    priority: 'high',
    title: `${conceptName}で「${persistent[1].label}」が繰り返し出ています`,
    payload: {
      conceptId,
      misconceptionCode: persistent[0],
      misconceptionLabel: persistent[1].label,
      appearedIn: persistent[1].n,
      window: data.length,
    },
    dedupeHours: 72,
  });
}
