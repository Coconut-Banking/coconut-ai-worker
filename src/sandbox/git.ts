import path from 'path';
import { run } from '../lib/shell.js';

export async function createBranch(cwd: string, branchName: string): Promise<void> {
  const res = await run('git', ['checkout', '-b', branchName], { cwd });
  if (res.exitCode !== 0) throw new Error(`git checkout -b failed: ${res.stderr}`);
}

export async function addFiles(cwd: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const res = await run('git', ['add', ...paths], { cwd });
  if (res.exitCode !== 0) throw new Error(`git add failed: ${res.stderr}`);
}

export async function commit(cwd: string, message: string): Promise<void> {
  const res = await run('git', ['commit', '-m', message], { cwd });
  if (res.exitCode !== 0) throw new Error(`git commit failed: ${res.stderr}`);
}

export async function push(cwd: string, branchName: string): Promise<void> {
  const res = await run('git', ['push', '-u', 'origin', branchName], { cwd });
  if (res.exitCode !== 0) throw new Error(`git push failed: ${res.stderr}`);
}

export async function getDefaultBranch(cwd: string): Promise<string> {
  const res = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
  if (res.exitCode !== 0) throw new Error(`git rev-parse failed: ${res.stderr}`);
  return res.stdout.trim();
}
