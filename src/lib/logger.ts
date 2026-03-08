import pino from 'pino';
import { loadEnv } from '../config/env.js';

export function createLogger(): pino.Logger {
  const env = loadEnv();
  return pino({
    level: env.DEBUG ? 'debug' : 'info',
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  });
}

let defaultLogger: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (!defaultLogger) defaultLogger = createLogger();
  return defaultLogger;
}
