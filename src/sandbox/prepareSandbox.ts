import path from 'path';
import fs from 'fs/promises';
import { run } from '../lib/shell.js';
import { ensureDir } from '../lib/fs.js';
import { createBranch } from './git.js';
import { loadEnv } from '../config/env.js';
import { getLogger } from '../lib/logger.js';

const log = getLogger();

export interface SandboxResult {
  sandboxPath: string;
  repoPath: string;
  branchName: string;
}

export async function prepareSandbox(
  runId: string,
  issueNumber: number
): Promise<SandboxResult> {
  const env = loadEnv();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const branchName = `ai/issue-${issueNumber}-${timestamp}`;
  const sandboxPath = path.join(env.WORKER_BASE_DIR, runId);
  const repoPath = path.join(sandboxPath, 'repo');

  await ensureDir(sandboxPath);
  log.info({ sandboxPath, branchName }, 'prepareSandbox: cloning');

  const cloneRes = await run('git', ['clone', '--depth', '1', env.REPO_CLONE_URL, 'repo'], {
    cwd: sandboxPath,
  });
  if (cloneRes.exitCode !== 0) throw new Error(`git clone failed: ${cloneRes.stderr}`);

  const checkoutRes = await run('git', ['checkout', env.REPO_DEFAULT_BRANCH], {
    cwd: repoPath,
  });
  if (checkoutRes.exitCode !== 0) throw new Error(`git checkout default failed: ${checkoutRes.stderr}`);

  await createBranch(repoPath, branchName);

  log.info({ repoPath, branchName }, 'prepareSandbox: ready');
  return { sandboxPath, repoPath, branchName };
}

export async function removeSandbox(sandboxPath: string): Promise<void> {
  try {
    await fs.rm(sandboxPath, { recursive: true, force: true });
    log.info({ sandboxPath }, 'removeSandbox: removed');
  } catch (e) {
    log.warn({ sandboxPath, err: e }, 'removeSandbox: failed');
  }
}
