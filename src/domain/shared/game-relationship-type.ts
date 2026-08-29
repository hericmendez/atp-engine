export const GameRelationshipType = {
  REMAKE: 'REMAKE',
  REMASTER: 'REMASTER',
  ENHANCED_VERSION: 'ENHANCED_VERSION',
  PORT: 'PORT',
  EXPANSION: 'EXPANSION',
  REGIONAL_RELEASE: 'REGIONAL_RELEASE',
  ALTERNATE_TITLE: 'ALTERNATE_TITLE',
  RELATED_GAME: 'RELATED_GAME',
} as const;

export type GameRelationshipType = (typeof GameRelationshipType)[keyof typeof GameRelationshipType];
