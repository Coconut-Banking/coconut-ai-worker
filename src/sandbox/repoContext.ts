import fs from 'fs/promises';
import path from 'path';
import type { Dirent } from 'fs';

const PRIORITY_DIRS = ['app/', 'lib/', 'hooks/', 'components/', 'tests/', 'docs/'];
const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'logs',
  'runs',
  '.git',
  'build',
  '.turbo',
]);
const EXCLUDE_PATTERNS = /\.(map|lock|log|tsbuildinfo)$/i;

export async function summarizeFileTree(repoRoot: string, maxEntries = 500): Promise<string> {
  const lines: string[] = [];
  let count = 0;

  async function walk(dir: string, prefix: string): Promise<void> {
    if (count >= maxEntries) return;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true }) as Dirent[];
    } catch {
      return;
    }
    const dirs: string[] = [];
    const files: string[] = [];
    for (const e of entries) {
      if (EXCLUDE_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      const rel = path.join(prefix, e.name);
      if (e.isDirectory()) dirs.push(e.name);
      else if (e.isFile() && !EXCLUDE_PATTERNS.test(e.name)) files.push(e.name);
    }
    dirs.sort();
    files.sort();
    for (const f of files) {
      if (count >= maxEntries) return;
      lines.push(prefix + f);
      count++;
    }
    for (const d of dirs) {
      if (count >= maxEntries) return;
      const rel = path.join(prefix, d);
      lines.push(rel + '/');
      count++;
      await walk(path.join(dir, d), rel + '/');
    }
  }

  await walk(repoRoot, '');
  return lines.join('\n');
}

export function sortTreeLinesForDisplay(tree: string): string {
  const lines = tree.split('\n').filter(Boolean);
  const priority: string[] = [];
  const rest: string[] = [];
  for (const line of lines) {
    const isPriority = PRIORITY_DIRS.some((p) => line === p || line.startsWith(p));
    if (isPriority) priority.push(line);
    else rest.push(line);
  }
  priority.sort();
  rest.sort();
  return [...priority, ...rest].join('\n');
}
