export const MetadataCompleteness = {
  NOT_FOUND: 'NOT_FOUND',
  FOUND_PARTIAL: 'FOUND_PARTIAL',
  FOUND_SUFFICIENT: 'FOUND_SUFFICIENT',
  FOUND_COMPLETE: 'FOUND_COMPLETE',
} as const;

export type MetadataCompleteness = (typeof MetadataCompleteness)[keyof typeof MetadataCompleteness];
