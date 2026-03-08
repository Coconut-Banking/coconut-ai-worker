import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN is required'),
  GITHUB_OWNER: z.string().default('Coconut-Banking'),
  GITHUB_REPO: z.string().default('coconut'),
  REPO_CLONE_URL: z.string().url().default('https://github.com/Coconut-Banking/coconut.git'),
  REPO_DEFAULT_BRANCH: z.string().default('main'),

  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_MODEL_PLANNER: z.string().default('gpt-4o'),
  OPENAI_MODEL_CODER: z.string().default('gpt-4o'),

  WORKER_BASE_DIR: z.string().default('/tmp/coconut-ai-worker'),
  RUNS_DIR: z.string().default('./runs'),
  LOGS_DIR: z.string().default('./logs'),

  MAX_TASKS_PER_RUN: z.coerce.number().int().min(1).max(1).default(1),
  MAX_FILES_CHANGED: z.coerce.number().int().min(1).max(20).default(5),

  TEST_MODE: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  DRY_RUN: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  KEEP_SANDBOX: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  DEBUG: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  OPEN_PR: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const msg = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new Error(`Invalid env: ${msg}`);
  }
  cached = result.data;
  return cached;
}
