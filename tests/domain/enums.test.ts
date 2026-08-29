import { describe, it, expect } from 'vitest';
import {
  createDeveloper,
  createPublisher,
  createGenre,
  createExternalIdentifier,
  createSourceEvidence,
  ClassificationCategory,
  IdentityOutcome,
} from '../../src/domain/index.js';

describe('ClassificationCategory', () => {
  it('contains all required categories', () => {
    expect(ClassificationCategory.GAME).toBe('GAME');
    expect(ClassificationCategory.DLC).toBe('DLC');
    expect(ClassificationCategory.EXPANSION).toBe('EXPANSION');
    expect(ClassificationCategory.MOVIE).toBe('MOVIE');
    expect(ClassificationCategory.TV_SHOW).toBe('TV_SHOW');
    expect(ClassificationCategory.ANIME).toBe('ANIME');
    expect(ClassificationCategory.SOUNDTRACK).toBe('SOUNDTRACK');
    expect(ClassificationCategory.BOOK).toBe('BOOK');
    expect(ClassificationCategory.HARDWARE).toBe('HARDWARE');
    expect(ClassificationCategory.PROMOTIONAL).toBe('PROMOTIONAL');
    expect(ClassificationCategory.CHARACTER).toBe('CHARACTER');
    expect(ClassificationCategory.FRANCHISE).toBe('FRANCHISE');
    expect(ClassificationCategory.PERSON).toBe('PERSON');
    expect(ClassificationCategory.EVENT).toBe('EVENT');
    expect(ClassificationCategory.UNKNOWN).toBe('UNKNOWN');
  });
});

describe('IdentityOutcome', () => {
  it('contains all required outcomes', () => {
    expect(IdentityOutcome.SAME_GAME).toBe('SAME_GAME');
    expect(IdentityOutcome.DIFFERENT_GAME).toBe('DIFFERENT_GAME');
    expect(IdentityOutcome.RELATED_GAME).toBe('RELATED_GAME');
    expect(IdentityOutcome.UNRESOLVED).toBe('UNRESOLVED');
  });
});

describe('Value Objects', () => {
  it('creates developer and publisher as distinct concepts', () => {
    const dev = createDeveloper('Capcom');
    const pub = createPublisher('Capcom');

    expect(dev.name).toBe('Capcom');
    expect(pub.name).toBe('Capcom');
  });

  it('creates genre with trimmed name', () => {
    const genre = createGenre('  Action-Adventure  ');
    expect(genre.name).toBe('Action-Adventure');
  });

  it('throws on empty genre name', () => {
    expect(() => createGenre('')).toThrow('Genre name must not be empty');
  });

  it('creates external identifier', () => {
    const id = createExternalIdentifier('steamdb', '12345');
    expect(id.source).toBe('steamdb');
    expect(id.id).toBe('12345');
  });

  it('throws on empty external identifier fields', () => {
    expect(() => createExternalIdentifier('', '123')).toThrow(
      'ExternalIdentifier source must not be empty',
    );
    expect(() => createExternalIdentifier('steamdb', '')).toThrow(
      'ExternalIdentifier id must not be empty',
    );
  });

  it('creates source evidence', () => {
    const evidence = createSourceEvidence('wikipedia', 'wiki-123', 'Test Title');
    expect(evidence.source).toBe('wikipedia');
    expect(evidence.externalId).toBe('wiki-123');
    expect(evidence.rawTitle).toBe('Test Title');
    expect(evidence.retrievedAt).toBeInstanceOf(Date);
  });

  it('throws on empty source evidence fields', () => {
    expect(() => createSourceEvidence('', '123')).toThrow(
      'SourceEvidence source must not be empty',
    );
    expect(() => createSourceEvidence('wiki', '')).toThrow(
      'SourceEvidence externalId must not be empty',
    );
  });
});
