import fs from 'fs/promises';
import path from 'path';
import { getLogger } from './logger.js';

const log = getLogger();

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
  log.debug({ dirPath }, 'ensureDir');
}

export async function writeJson<T>(filePath: string, data: T): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  log.debug({ filePath }, 'writeJson');
}

export async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

export async function writeLog(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
  log.debug({ filePath }, 'writeLog');
}

export async function readFileUtf8(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

export async function writeFileUtf8(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
