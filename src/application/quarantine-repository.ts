import type { QuarantinedCandidate } from './quarantine-types.js';

export interface QuarantineRepository {
  /**
   * Record a rejection idempotently: repeated rejections of the same
   * discovery group overwrite rather than duplicate.
   */
  record(entry: QuarantinedCandidate): Promise<void>;

  findByGroupId(groupId: string): Promise<QuarantinedCandidate | null>;

  count(): Promise<number>;
}
