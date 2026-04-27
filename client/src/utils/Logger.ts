// Logger leve — em prod, plugar Pino ou Sentry.
// Em dev, console com nível mínimo configurável.

type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const ENV_LEVEL = (import.meta.env.DEV ? 'debug' : 'info') as Level;

class Logger {
  private readonly tag: string;

  constructor(tag: string) {
    this.tag = tag;
  }

  child(subTag: string): Logger {
    return new Logger(`${this.tag}:${subTag}`);
  }

  debug(msg: string, ctx?: object): void {
    this.log('debug', msg, ctx);
  }
  info(msg: string, ctx?: object): void {
    this.log('info', msg, ctx);
  }
  warn(msg: string, ctx?: object): void {
    this.log('warn', msg, ctx);
  }
  error(msg: string, ctx?: object): void {
    this.log('error', msg, ctx);
  }

  private log(level: Level, msg: string, ctx?: object): void {
    if (ORDER[level] < ORDER[ENV_LEVEL]) return;
    const prefix = `[${level.toUpperCase()}] ${this.tag} ›`;
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    if (ctx) fn(prefix, msg, ctx);
    else fn(prefix, msg);
  }
}

export const log = new Logger('fp');
export { Logger };
