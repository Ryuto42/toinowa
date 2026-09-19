import type { Database, Json } from '@/lib/database/types';

export type JobRow = Database['public']['Tables']['jobs']['Row'];

export interface EnqueueJobInput {
  tenantId: string;
  kind: string;
  idempotencyKey: string;
  payload?: Json;
  priority?: number;
  maxAttempts?: number;
  runAfter?: string;
  traceId?: string;
}

export interface JobStepResult {
  /** 次のステップ。nullならジョブを完了する。 */
  nextStep: string | null;
  state?: Json;
  runAfter?: string;
}

export type JobHandler = (job: JobRow) => Promise<JobStepResult>;
