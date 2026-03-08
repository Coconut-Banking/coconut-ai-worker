import OpenAI from 'openai';
import { loadEnv } from '../config/env.js';
import { getLogger } from '../lib/logger.js';
import type { CoderOutput } from '../types/index.js';
import type { PlannerOutput } from '../types/index.js';
import type { RepoContext } from '../types/index.js';
import { buildCoderPrompt } from './prompts.js';

const log = getLogger();

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    const env = loadEnv();
    openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return openai;
}

export async function runCoder(
  issueTitle: string,
  issueBody: string,
  plan: PlannerOutput,
  ctx: RepoContext,
  currentFileContents: Record<string, string> = {}
): Promise<CoderOutput> {
  const env = loadEnv();
  const prompt = buildCoderPrompt(
    issueTitle,
    issueBody ?? '',
    plan.summary,
    plan.implementationSteps,
    plan.likelyFilesToChange,
    ctx,
    env.MAX_FILES_CHANGED,
    currentFileContents
  );
  const client = getOpenAI();
  log.info({ model: env.OPENAI_MODEL_CODER }, 'coder: calling OpenAI');

  const response = await client.chat.completions.create({
    model: env.OPENAI_MODEL_CODER,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '';
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    log.warn({ raw: raw.slice(0, 500) }, 'coder: invalid JSON');
    throw new Error(`Coder returned invalid JSON: ${(e as Error).message}`);
  }

  const p = parsed as Record<string, unknown>;
  const filesToModify = Array.isArray(p.files_to_modify)
    ? (p.files_to_modify as Array<{ path?: string; content?: string }>)
        .filter((x) => x && typeof x.path === 'string' && typeof x.content === 'string')
        .map((x) => ({ path: x.path!, content: x.content! }))
        .slice(0, env.MAX_FILES_CHANGED)
    : [];
  const filesToCreate = Array.isArray(p.files_to_create)
    ? (p.files_to_create as Array<{ path?: string; content?: string }>)
        .filter((x) => x && typeof x.path === 'string' && typeof x.content === 'string')
        .map((x) => ({ path: x.path!, content: x.content! }))
        .slice(0, env.MAX_FILES_CHANGED)
    : [];
  const changedFiles = Array.isArray(p.changed_files)
    ? (p.changed_files as unknown[]).filter((x): x is string => typeof x === 'string')
    : [...filesToModify.map((f) => f.path), ...filesToCreate.map((f) => f.path)];

  return {
    summary: typeof p.summary === 'string' ? p.summary : '',
    files_to_modify: filesToModify,
    files_to_create: filesToCreate,
    changed_files: changedFiles,
    rationale: typeof p.rationale === 'string' ? p.rationale : '',
  };
}
