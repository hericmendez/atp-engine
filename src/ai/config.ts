import { z } from 'zod';

export const aiConfigSchema = z.object({
  AI_ENABLED: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),
  AI_PROVIDER: z.enum(['ollama']).default('ollama'),
  AI_MODEL: z.string().min(1).default('qwen3:8b'),
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
});

export type AIConfig = z.infer<typeof aiConfigSchema>;

export function parseAIConfig(env: Record<string, string | undefined>): AIConfig {
  const parsed = aiConfigSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid AI configuration: ${parsed.error.format()}`);
  }
  return parsed.data;
}
