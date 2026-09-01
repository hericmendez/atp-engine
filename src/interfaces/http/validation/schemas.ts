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

const PlatformStatusSchema = z.enum(['active', 'inactive', 'discontinued']);

const GameSortFieldSchema = z.enum([
  'title',
  'createdAt',
  'updatedAt',
  'completeness',
  'releaseDate',
  'name',
]);
const GameSortDirectionSchema = z.enum(['asc', 'desc']);

const PlatformSortFieldSchema = z.enum(['name', 'releaseYear', 'gameCount']);

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const GameSortSchema = z.object({
  sort: GameSortFieldSchema.optional(),
  order: GameSortDirectionSchema.default('desc'),
});

const PlatformSortSchema = z.object({
  sort: PlatformSortFieldSchema.optional(),
  order: GameSortDirectionSchema.default('asc'),
});

const parseCommaSeparated = (val: string | undefined): string[] | undefined => {
  if (!val || val.trim().length === 0) return undefined;
  return val
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
};

const parseReleaseYearRange = (
  val: string | undefined,
): { from: number; to: number } | undefined => {
  if (!val || val.trim().length === 0) return undefined;
  const parts = val.split('-').map((s) => parseInt(s.trim(), 10));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { from: Math.min(parts[0], parts[1]), to: Math.max(parts[0], parts[1]) };
  }
  if (parts.length === 1 && !isNaN(parts[0])) {
    return { from: parts[0], to: parts[0] };
  }
  return undefined;
};

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
  releaseYearFrom: z.coerce.number().int().min(1950).max(2100).optional(),
  releaseYearTo: z.coerce.number().int().min(1950).max(2100).optional(),
})
  .merge(GameSortSchema)
  .transform((val) => {
    // Parse comma-separated values into arrays
    const platformArr = parseCommaSeparated(val.platform);
    const developerArr = parseCommaSeparated(val.developer);
    const publisherArr = parseCommaSeparated(val.publisher);
    const genreArr = parseCommaSeparated(val.genre);

    return {
      ...val,
      platforms: platformArr,
      developers: developerArr,
      publishers: publisherArr,
      genres: genreArr,
    };
  });

export const SearchQuerySchema = PaginationSchema.extend({
  q: z.string().min(1, 'Search query is required'),
  source: z.string().optional(),
}).merge(GameSortSchema);

export const GameIdParamSchema = z.object({
  id: z.string().min(1, 'Game ID is required').trim().min(1, 'Game ID must not be empty'),
});

export const CoverSearchQuerySchema = z.object({
  q: z
    .string()
    .min(1, 'Search query is required')
    .max(200, 'Search query too long')
    .transform((val) => val.trim()),
  type: z.enum(['cover', 'logo', 'all']).default('cover'),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(9, 'Limit must be at most 9')
    .default(1),
  source: z.string().optional(),
});

export const PlatformCatalogQuerySchema = PaginationSchema.extend({
  companyName: z.string().optional(),
  platformStatus: PlatformStatusSchema.optional(),
  releaseYear: z.coerce.number().int().min(1950).max(2100).optional(),
  releaseYearRange: z.string().optional(),
  showEmptyPlatforms: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
})
  .merge(PlatformSortSchema)
  .transform((val) => {
    const range = parseReleaseYearRange(val.releaseYearRange);
    return {
      ...val,
      releaseYearRange: range,
    };
  });

export const CatalogSyncRequestSchema = z
  .object({
    platforms: z
      .array(z.string().min(1, 'Platform ID must not be empty'))
      .min(1, 'At least one platform is required when activeOnly is not set')
      .optional(),
    activeOnly: z.boolean().optional().default(false),
    from: z
      .string()
      .min(1, 'From date is required')
      .refine((val) => !isNaN(new Date(val).getTime()), 'Invalid from date'),
    to: z
      .string()
      .min(1, 'To date is required')
      .refine((val) => !isNaN(new Date(val).getTime()), 'Invalid to date'),
    dryRun: z.boolean().optional().default(false),
  })
  .refine(
    (val) => {
      if (val.platforms && val.platforms.length > 0) return true;
      if (val.activeOnly) return true;
      return false;
    },
    {
      message: 'Either platforms array or activeOnly=true is required',
    },
  )
  .refine(
    (val) => {
      const fromDate = new Date(val.from);
      const toDate = new Date(val.to);
      return fromDate <= toDate;
    },
    {
      message: 'From date must be before or equal to To date',
    },
  );

export type CatalogSyncRequestInput = z.infer<typeof CatalogSyncRequestSchema>;

export const PlatformIdParamSchema = z.object({
  platformId: z
    .string()
    .min(1, 'Platform ID is required')
    .trim()
    .min(1, 'Platform ID must not be empty'),
});

export type CatalogQueryInput = z.infer<typeof CatalogQuerySchema>;
export type SearchQueryInput = z.infer<typeof SearchQuerySchema>;
export type GameIdParamInput = z.infer<typeof GameIdParamSchema>;
export type CoverSearchQueryInput = z.infer<typeof CoverSearchQuerySchema>;
export type PlatformCatalogQueryInput = z.infer<typeof PlatformCatalogQuerySchema>;
export type PlatformIdParamInput = z.infer<typeof PlatformIdParamSchema>;
