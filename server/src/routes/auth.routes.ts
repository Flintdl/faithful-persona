import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../services/audit.service.js';
import {
  AuthError,
  login as loginSvc,
  signup as signupSvc,
} from '../services/auth.service.js';
import { clearSessionCookie, createSessionCookie } from '../lib/session.js';

const SignupSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(10).max(128),
  name: z.string().min(2).max(32).regex(/^[\p{L}\p{N}\s_-]+$/u),
});

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/signup', async (req, reply) => {
    const parsed = SignupSchema.safeParse(req.body);
    if (!parsed.success) {
      await audit(req, 'auth.signup.fail', { reason: 'VALIDATION' });
      reply.code(400).send({ code: 'VALIDATION', message: 'invalid payload' });
      return;
    }
    try {
      const result = await signupSvc(parsed.data);
      await createSessionCookie(reply, { userId: result.userId, email: result.email });
      await audit(req, 'auth.signup.ok', undefined, result.userId);
      reply.send({
        userId: result.userId,
        email: result.email,
        expiresAt: new Date(Date.now() + 8 * 3600_000).toISOString(),
      });
    } catch (err) {
      if (err instanceof AuthError) {
        await audit(req, 'auth.signup.fail', { code: err.code });
        reply.code(409).send({ code: err.code, message: err.message });
        return;
      }
      throw err;
    }
  });

  app.post(
    '/login',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const parsed = LoginSchema.safeParse(req.body);
      if (!parsed.success) {
        await audit(req, 'auth.login.fail', { reason: 'VALIDATION' });
        reply.code(400).send({ code: 'VALIDATION', message: 'invalid payload' });
        return;
      }
      try {
        const result = await loginSvc(parsed.data);
        await createSessionCookie(reply, { userId: result.userId, email: result.email });
        await audit(req, 'auth.login.ok', undefined, result.userId);
        reply.send({
          userId: result.userId,
          email: result.email,
          expiresAt: new Date(Date.now() + 8 * 3600_000).toISOString(),
        });
      } catch (err) {
        if (err instanceof AuthError) {
          await audit(req, 'auth.login.fail', { code: err.code, email: parsed.data.email });
          reply.code(err.code === 'LOCKED' ? 429 : 401).send({ code: err.code, message: 'invalid credentials' });
          return;
        }
        throw err;
      }
    },
  );

  app.post('/logout', async (req, reply) => {
    if (req.session) await audit(req, 'auth.logout');
    clearSessionCookie(reply);
    reply.send({ ok: true });
  });

  app.get('/me', async (req, reply) => {
    if (!req.session) {
      reply.code(401).send({ code: 'NOT_AUTHENTICATED', message: 'no session' });
      return;
    }
    reply.send({
      userId: req.session.userId,
      email: req.session.email,
      expiresAt: new Date((req.session.iat + 8 * 3600) * 1000).toISOString(),
    });
  });
}
