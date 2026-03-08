import { execa } from 'execa';
import { getLogger } from './logger.js';

const log = getLogger();

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function run(
  cmd: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv }
): Promise<ShellResult> {
  log.debug({ cmd, args, cwd: options?.cwd }, 'shell run');
  const result = await execa(cmd, args, {
    cwd: options?.cwd,
    env: options?.env,
    reject: false,
    all: true,
  });
  const out = (result.all ?? result.stdout ?? '') as string;
  const err = (result.stderr ?? '') as string;
  if (result.exitCode !== 0) {
    log.warn({ cmd, args, exitCode: result.exitCode, stderr: err }, 'shell non-zero exit');
  }
  return {
    stdout: out,
    stderr: err,
    exitCode: result.exitCode ?? 0,
  };
}
