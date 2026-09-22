import { CatalogSyncLockModel } from './catalog-sync-lock-schema.js';

export interface CatalogSyncLock {
  readonly id: string;
  readonly owner: string;
  readonly expiresAt: Date;
}

export class MongoCatalogSyncLockRepository {
  private readonly lockId = 'catalog-sync';

  /**
   * Atomic acquire: succeeds if lock does not exist or is expired (expiresAt < now).
   * Uses findOneAndUpdate with upsert and $or to ensure atomicity.
   * Returns true if acquired, false if held by another owner.
   */
  async tryAcquire(owner: string, ttlMs: number, now: Date = new Date()): Promise<boolean> {
    const expiresAt = new Date(now.getTime() + ttlMs);

    try {
      const doc = await CatalogSyncLockModel.findOneAndUpdate(
        {
          _id: this.lockId,
          $or: [{ expiresAt: { $lt: now } }, { expiresAt: { $exists: false } }],
        },
        {
          $set: { owner, expiresAt },
          $setOnInsert: { _id: this.lockId },
        },
        {
          upsert: true,
          new: true,
          // Return the document after update
        },
      ).lean();

      // If upsert created or updated expired, we own it if returned owner matches
      if (doc && (doc as { owner: string }).owner === owner) {
        // Verify expiresAt matches (to avoid reading stale doc when filter didn't match but upsert inserted?
        // For expired case, doc.expiresAt should be our new expiresAt.
        // For duplicate case, doc would be existing non-expired, owner mismatch -> not acquired.
        return true;
      }

      // If doc is null, it means filter didn't match and upsert didn't happen due to duplicate?
      // Try to check if we actually own it by reading
      const current = await CatalogSyncLockModel.findById(this.lockId).lean();
      if (current && current.owner === owner && current.expiresAt.getTime() === expiresAt.getTime()) {
        return true;
      }

      return false;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        // Another request won the race and inserted/updated first
        return false;
      }
      throw error;
    }
  }

  /**
   * Renew only if owner matches. Extends expiresAt.
   * Returns true if renewed, false if owner mismatch or not found.
   */
  async renew(owner: string, ttlMs: number, now: Date = new Date()): Promise<boolean> {
    const expiresAt = new Date(now.getTime() + ttlMs);
    const doc = await CatalogSyncLockModel.findOneAndUpdate(
      { _id: this.lockId, owner },
      { $set: { expiresAt } },
      { new: true },
    ).lean();
    return !!doc;
  }

  /**
   * Release only if owner matches. Returns true if released.
   */
  async release(owner: string): Promise<boolean> {
    const result = await CatalogSyncLockModel.deleteOne({ _id: this.lockId, owner });
    return result.deletedCount === 1;
  }

  /**
   * Force check if locked (for diagnostics, not for acquisition)
   */
  async isLocked(now: Date = new Date()): Promise<boolean> {
    const doc = await CatalogSyncLockModel.findById(this.lockId).lean();
    if (!doc) return false;
    return doc.expiresAt.getTime() > now.getTime();
  }

  async findLock(): Promise<CatalogSyncLock | null> {
    const doc = await CatalogSyncLockModel.findById(this.lockId).lean();
    if (!doc) return null;
    return { id: doc._id, owner: doc.owner, expiresAt: doc.expiresAt };
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: number }).code === 11000
    );
  }
}
