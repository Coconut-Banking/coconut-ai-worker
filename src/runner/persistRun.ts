import path from 'path';
import { loadEnv } from '../config/env.js';
import { writeJson, writeLog, ensureDir } from '../lib/fs.js';
import type { RunMetadata } from '../types/index.js';

export async function persistRunMetadata(metadata: RunMetadata): Promise<string> {
  const env = loadEnv();
  await ensureDir(env.RUNS_DIR);
  const filePath = path.join(env.RUNS_DIR, `${metadata.runId}.json`);
  await writeJson(filePath, metadata);
  return filePath;
}

export async function persistRunLog(runId: string, logContent: string): Promise<string> {
  const env = loadEnv();
  await ensureDir(env.LOGS_DIR);
  const filePath = path.join(env.LOGS_DIR, `${runId}.log`);
  await writeLog(filePath, logContent);
  return filePath;
}
