/**
 * src/utils/Logger.ts
 * -----------------------------------------------------------------------------
 * Minimal leveled logger. No transports, no async, no fancy formatting —
 * the smallest abstraction that lets us stop sprinkling `console.*` calls
 * across the codebase.
 *
 * Levels (numeric, ascending):
 *   silent  → nothing is ever emitted
 *   error   → only failures that should break a build/CI run
 *   warn    → recoverable but suspicious
 *   info    → lifecycle milestones (scene loaded, etc.)
 *   debug   → verbose, off by default in production
 *
 * Usage:
 *   import { logger } from '../utils/Logger.js';
 *   logger.info('scene loaded', { count: 12 });
 *
 * Override the level at runtime:
 *   logger.setLevel('debug');
 *
 * This is intentionally NOT a dependency-injected service. There is one
 * process-wide logger; tests that need silence can `logger.setLevel('silent')`.
 * -----------------------------------------------------------------------------
 */

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export interface LogEntry {
  level: Exclude<LogLevel, 'silent'>;
  scope: string;
  message: string;
  context?: unknown;
  at: string;
}

export type LogSink = (entry: LogEntry) => void;

const defaultSink: LogSink = (entry) => {
  const prefix = `[${entry.scope}]`;
  const ctx = entry.context !== undefined ? ` ${JSON.stringify(entry.context)}` : '';
  const line = `${prefix} ${entry.message}${ctx}`;
  switch (entry.level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'info':
      console.info(line);
      break;
    case 'debug':
      console.debug(line);
      break;
  }
};

export class Logger {
  private level: LogLevel;
  private readonly sink: LogSink;
  private readonly scope: string;

  constructor(scope = 'app', level: LogLevel = 'info', sink: LogSink = defaultSink) {
    this.scope = scope;
    this.level = level;
    this.sink = sink;
  }

  /** Update the level at runtime (e.g. from config). */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /** Current effective level. */
  getLevel(): LogLevel {
    return this.level;
  }

  /** Spawn a child logger with the same sink+level but a different scope. */
  child(scope: string): Logger {
    return new Logger(`${this.scope}:${scope}`, this.level, this.sink);
  }

  error(message: string, context?: unknown): void {
    this.emit('error', message, context);
  }

  warn(message: string, context?: unknown): void {
    this.emit('warn', message, context);
  }

  info(message: string, context?: unknown): void {
    this.emit('info', message, context);
  }

  debug(message: string, context?: unknown): void {
    this.emit('debug', message, context);
  }

  private emit(
    level: Exclude<LogLevel, 'silent'>,
    message: string,
    context?: unknown,
  ): void {
    if (LEVEL_PRIORITY[level] > LEVEL_PRIORITY[this.level]) return;
    this.sink({
      level,
      scope: this.scope,
      message,
      context,
      at: new Date().toISOString(),
    });
  }
}

/**
 * Process-wide default logger. Most modules should `child()` from this
 * so they get a scoped tag like `scene:warn`, `persistence:error`, etc.
 */
export const logger = new Logger('app', 'info');
