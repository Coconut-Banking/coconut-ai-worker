import OpenAI from 'openai';
import { loadEnv } from '../config/env.js';
import { getLogger } from '../lib/logger.js';
import type { PlannerOutput } from '../types/index.js';
import type { RepoContext } from '../types/index.js';
import { buildPlannerPrompt } from './prompts.js';

const log = getLogger();

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    const env = loadEnv();
    openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return openai;
}

export async function runPlanner(
  issueTitle: string,
  issueBody: string,
  ctx: RepoContext
): Promise<PlannerOutput> {
  const env = loadEnv();
  const prompt = buildPlannerPrompt(
    issueTitle,
    issueBody ?? '',
    ctx,
    env.MAX_FILES_CHANGED
  );
  const client = getOpenAI();
  log.info({ model: env.OPENAI_MODEL_PLANNER }, 'planner: calling OpenAI');

  const response = await client.chat.completions.create({
    model: env.OPENAI_MODEL_PLANNER,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '';
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    log.warn({ raw: raw.slice(0, 500) }, 'planner: invalid JSON, using fallback');
    return {
      summary: raw.slice(0, 500),
      likelyFilesToChange: [],
      implementationSteps: [],
      testsToAddOrUpdate: [],
      risks: ['Could not parse planner JSON'],
      confidence: 'low',
    };
  }

  const p = parsed as Record<string, unknown>;
  return {
    summary: typeof p.summary === 'string' ? p.summary : '',
    likelyFilesToChange: Array.isArray(p.likelyFilesToChange)
      ? p.likelyFilesToChange.filter((x): x is string => typeof x === 'string').slice(0, env.MAX_FILES_CHANGED)
      : [],
    implementationSteps: Array.isArray(p.implementationSteps)
      ? p.implementationSteps.filter((x): x is string => typeof x === 'string')
      : [],
    testsToAddOrUpdate: Array.isArray(p.testsToAddOrUpdate)
      ? p.testsToAddOrUpdate.filter((x): x is string => typeof x === 'string')
      : [],
    risks: Array.isArray(p.risks) ? p.risks.filter((x): x is string => typeof x === 'string') : [],
    confidence:
      p.confidence === 'low' || p.confidence === 'medium' || p.confidence === 'high'
        ? p.confidence
        : 'medium',
    assumptions: Array.isArray(p.assumptions)
      ? p.assumptions.filter((x): x is string => typeof x === 'string')
      : undefined,
  };
}
