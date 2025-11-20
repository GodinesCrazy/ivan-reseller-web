// Simple frontend logger with level control and env gating
// Usage: import { log } from '@/utils/logger';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const env = import.meta.env;
const isProd = env.MODE === 'production';
const DEFAULT_LEVEL: LogLevel = isProd ? 'warn' : 'debug';

function levelToPriority(level: LogLevel): number {
  switch (level) {
    case 'debug': return 10;
    case 'info': return 20;
    case 'warn': return 30;
    case 'error': return 40;
    case 'silent': return 99;
    default: return 30;
  }
}

let currentLevel: LogLevel = (env.VITE_LOG_LEVEL as LogLevel) || DEFAULT_LEVEL;

function format(prefix: string, args: unknown[]): unknown[] {
  const ts = new Date().toISOString();
  return [`[${ts}] ${prefix}`, ...args];
}

export const log = {
  setLevel(level: LogLevel) {
    currentLevel = level;
  },
  debug: (...args: unknown[]) => {
    if (levelToPriority(currentLevel) <= levelToPriority('debug')) {
      // eslint-disable-next-line no-console
      console.debug(...format('[DEBUG]', args));
    }
  },
  info: (...args: unknown[]) => {
    if (levelToPriority(currentLevel) <= levelToPriority('info')) {
      // eslint-disable-next-line no-console
      console.info(...format('[INFO]', args));
    }
  },
  warn: (...args: unknown[]) => {
    if (levelToPriority(currentLevel) <= levelToPriority('warn')) {
      // eslint-disable-next-line no-console
      console.warn(...format('[WARN]', args));
    }
  },
  error: (...args: unknown[]) => {
    if (levelToPriority(currentLevel) <= levelToPriority('error')) {
      // eslint-disable-next-line no-console
      console.error(...format('[ERROR]', args));
    }
  },
};
