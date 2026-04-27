/**
 * Faithful Persona — server entrypoint.
 * Fastify + iron-session + Argon2id + Drizzle/Postgres.
 *
 * Para subir:
 *   1. cp .env.example .env.local
 *   2. preencha IRON_SESSION_PASSWORD (32+ chars random) e DATABASE_URL
 *   3. (na raiz) docker compose up -d postgres redis
 *   4. pnpm db:migrate
 *   5. pnpm dev
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { sessionPlugin } from './lib/session.js';
import { authRoutes } from './routes/auth.routes.js';
import { saveRoutes } from './routes/save.routes.js';

const isProd = process.env.NODE_ENV === 'production';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: !isProd ? { target: 'pino-pretty' } : undefined,
    redact: {
      // Nunca logue cookies, body de login/signup, ou headers de autorização
      paths: ['req.headers.cookie', 'req.headers.authorization', 'req.body.password'],
      censor: '[REDACTED]',
    },
  },
  trustProxy: true,
  bodyLimit: 256 * 1024,
});

await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: [`'self'`],
      scriptSrc: [`'self'`],
      styleSrc: [`'self'`, `'unsafe-inline'`],
      imgSrc: [`'self'`, 'data:', 'blob:'],
      connectSrc: [`'self'`, 'wss:', 'https:'],
      fontSrc: [`'self'`],
      objectSrc: [`'none'`],
      frameAncestors: [`'none'`],
      baseUri: [`'self'`],
      formAction: [`'self'`],
    },
  },
  hsts: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

await app.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()) ?? false,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

await app.register(cookie, {
  // não usa secret aqui — sealing já é feito pelo iron-session
});

await app.register(rateLimit, {
  global: true,
  max: 100,
  timeWindow: '1 minute',
  // Em prod, plug Redis store: { redis: createClient({ url: process.env.REDIS_URL }) }
});

// IMPORTANTE: chamado direto (sem register) pra que o hook se aplique no root scope
// e seja herdado por authRoutes/saveRoutes.
await sessionPlugin(app);

app.get('/health', async (_req, reply) => {
  reply.send({ ok: true, ts: new Date().toISOString() });
});

await app.register(authRoutes, { prefix: '/auth' });
await app.register(saveRoutes, { prefix: '/save' });

// Error handler genérico — nunca vaze stack pro client
app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
  req.log.error({ err }, 'unhandled error');
  const status = err.statusCode ?? 500;
  reply.status(status).send({
    code: 'INTERNAL',
    message: status < 500 ? err.message : 'internal error',
  });
});

const port = Number(process.env.PORT ?? 3000);
const host = '0.0.0.0';

try {
  await app.listen({ port, host });
  app.log.info({ port }, 'fastify ready');
} catch (err) {
  app.log.fatal({ err }, 'failed to start');
  process.exit(1);
}

// Shutdown limpo (libera conexões pg)
const shutdown = async (sig: string) => {
  app.log.info({ sig }, 'shutting down');
  await app.close();
  const { pool } = await import('./db/index.js');
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
