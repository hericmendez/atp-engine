import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGODB_URI: z.string().url().default('mongodb://localhost:27017/atp-engine'),
  AI_ENABLED: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),
  AI_PROVIDER: z.enum(['ollama']).default('ollama'),
  AI_MODEL: z.string().min(1).default('qwen3:8b'),
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  SOURCE_TIMEOUT: z.coerce.number().int().positive().default(10000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let _config: Env | null = null;

export function loadConfig(env: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const formatted = parsed.error.format();
    const messages = Object.entries(formatted)
      .filter(([key]) => key !== '_errors')
      .map(([key, value]) => {
        const errors = (value as { _errors?: string[] })._errors;
        return errors && errors.length > 0 ? `  ${key}: ${errors.join(', ')}` : null;
      })
      .filter(Boolean);

    throw new Error(`Invalid environment configuration:\n${messages.join('\n')}`);
  }

  _config = parsed.data;
  return _config;
}

export function getConfig(): Env {
  if (!_config) {
    throw new Error('Configuration not loaded. Call loadConfig() first.');
  }
  return _config;
}

export function resetConfig(): void {
  _config = null;
}
