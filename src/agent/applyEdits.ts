import path from 'path';
import { writeFileUtf8 } from '../lib/fs.js';
import { getLogger } from '../lib/logger.js';
import type { CoderOutput } from '../types/index.js';

const log = getLogger();

export async function applyEdits(repoPath: string, output: CoderOutput): Promise<string[]> {
  const applied: string[] = [];

  for (const f of output.files_to_modify) {
    const fullPath = path.join(repoPath, f.path);
    await writeFileUtf8(fullPath, f.content);
    applied.push(f.path);
    log.info({ path: f.path }, 'applyEdits: replaced');
  }

  for (const f of output.files_to_create) {
    const fullPath = path.join(repoPath, f.path);
    await writeFileUtf8(fullPath, f.content);
    applied.push(f.path);
    log.info({ path: f.path }, 'applyEdits: created');
  }

  return applied;
}
