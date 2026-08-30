import { z } from 'zod';

const ClassificationCategorySchema = z.enum([
  'GAME',
  'DLC',
  'EXPANSION',
  'MOVIE',
  'TV_SHOW',
  'ANIME',
  'SOUNDTRACK',
  'BOOK',
  'HARDWARE',
  'PROMOTIONAL',
  'CHARACTER',
  'FRANCHISE',
  'PERSON',
  'EVENT',
  'UNKNOWN',
]);

const MetadataCompletenessSchema = z.enum([
  'NOT_FOUND',
  'FOUND_PARTIAL',
  'FOUND_SUFFICIENT',
  'FOUND_COMPLETE',
]);

const GameSortFieldSchema = z.enum(['title', 'createdAt', 'updatedAt', 'completeness']);
const GameSortDirectionSchema = z.enum(['asc', 'desc']);

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const GameSortSchema = z.object({
  sort: GameSortFieldSchema.optional(),
  order: GameSortDirectionSchema.default('desc'),
});

export const CatalogQuerySchema = PaginationSchema.extend({
  search: z.string().optional(),
  title: z.string().optional(),
  platform: z.string().optional(),
  platformFamily: z.string().optional(),
  developer: z.string().optional(),
  publisher: z.string().optional(),
  genre: z.string().optional(),
  classification: ClassificationCategorySchema.optional(),
  completeness: MetadataCompletenessSchema.optional(),
  releaseYear: z.coerce.number().int().min(1950).max(2100).optional(),
}).merge(GameSortSchema);

export const SearchQuerySchema = PaginationSchema.extend({
  q: z.string().min(1, 'Search query is required'),
  source: z.string().optional(),
}).merge(GameSortSchema);

export const GameIdParamSchema = z.object({
  id: z.string().min(1, 'Game ID is required'),
});

export const CoverSearchQuerySchema = z.object({
  q: z
    .string()
    .min(1, 'Search query is required')
    .max(200, 'Search query too long')
    .transform((val) => val.trim()),
  source: z.string().optional(),
});

export type CatalogQueryInput = z.infer<typeof CatalogQuerySchema>;
export type SearchQueryInput = z.infer<typeof SearchQuerySchema>;
export type GameIdParamInput = z.infer<typeof GameIdParamSchema>;
export type CoverSearchQueryInput = z.infer<typeof CoverSearchQuerySchema>;
