import type {
  QuarantineRepository,
} from '../../../application/quarantine-repository.js';
import type { QuarantinedCandidate } from '../../../application/quarantine-types.js';
import { QuarantinedCandidateModel } from './quarantine-schema.js';
import { PersistenceError } from '../../../shared/errors/errors.js';

export class MongoQuarantineRepository implements QuarantineRepository {
  async record(entry: QuarantinedCandidate): Promise<void> {
    try {
      await QuarantinedCandidateModel.updateOne(
        { groupId: entry.groupId },
        {
          $set: {
            source: entry.source,
            sourceId: entry.sourceId,
            status: entry.status,
            reason: entry.reason,
            blockingReasons: [...entry.blockingReasons],
            classification: entry.classification,
            classificationConfidence: entry.classificationConfidence,
            identityConfidence: entry.identityConfidence,
            sourceCount: entry.sourceCount,
            titles: [...entry.titles],
            retrievedAt: new Date(entry.retrievedAt),
          },
        },
        { upsert: true },
      );
    } catch (error) {
      throw new PersistenceError('Failed to record quarantined candidate', { cause: error });
    }
  }

  async findByGroupId(groupId: string): Promise<QuarantinedCandidate | null> {
    try {
      const doc = await QuarantinedCandidateModel.findOne({ groupId }).lean();
      if (!doc) {
        return null;
      }
      return {
        groupId: doc.groupId,
        source: doc.source,
        sourceId: doc.sourceId,
        status: doc.status,
        reason: doc.reason,
        blockingReasons: [...(doc.blockingReasons ?? [])],
        classification: doc.classification,
        classificationConfidence: doc.classificationConfidence,
        identityConfidence: doc.identityConfidence,
        sourceCount: doc.sourceCount,
        titles: [...(doc.titles ?? [])],
        retrievedAt: doc.retrievedAt.toISOString(),
      };
    } catch (error) {
      throw new PersistenceError('Failed to find quarantined candidate', { cause: error });
    }
  }

  async count(): Promise<number> {
    try {
      return await QuarantinedCandidateModel.countDocuments({});
    } catch (error) {
      throw new PersistenceError('Failed to count quarantined candidates', { cause: error });
    }
  }
}
