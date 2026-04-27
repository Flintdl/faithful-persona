import { config as loadEnv } from 'dotenv';
import { sealData, unsealData } from 'iron-session';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Sessões opacas via iron-session.
 * - Cookie HttpOnly + Secure (em prod) + SameSite=Strict
 * - `__Host-` prefix bloqueia ataques de subdomínio
 * - Idle timeout 2h, absolute via TTL do cookie
 *
 * Pra rotacionar a chave: defina IRON_SESSION_PASSWORD novo, mantenha o antigo
 * em IRON_SESSION_PASSWORD_OLD durante a transição (suporte multi-key.)
 */
export type SessionData = {
  userId: string;
  email: string;
  // server-side: rotacionamos no login (anti-fixation), guardado em audit/Redis
  sid: string;
  // pra invalidar manualmente sem rotacionar tudo
  iat: number;
};

const COOKIE_NAME =
  process.env.NODE_ENV === 'production' ? '__Host-fp_session' : 'fp_session';

const PASSWORD = process.env.IRON_SESSION_PASSWORD ?? '';
const PASSWORD_OLD = process.env.IRON_SESSION_PASSWORD_OLD ?? '';

if (PASSWORD.length < 32) {
  throw new Error(
    'IRON_SESSION_PASSWORD must be at least 32 chars. Generate with: node -e "console.log(crypto.randomBytes(48).toString(\'base64\'))"',
  );
}

const passwords: Record<string, string> = { 1: PASSWORD };
if (PASSWORD_OLD.length >= 32) passwords[2] = PASSWORD_OLD;

const TTL_SECONDS = 60 * 60 * 8; // 8h absolute

export async function createSessionCookie(
  reply: FastifyReply,
  data: Omit<SessionData, 'iat' | 'sid'>,
): Promise<void> {
  const sid = crypto.randomUUID();
  const sessionData: SessionData = { ...data, sid, iat: Math.floor(Date.now() / 1000) };
  const sealed = await sealData(sessionData, { password: passwords, ttl: TTL_SECONDS });
  reply.setCookie(COOKIE_NAME, sealed, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: TTL_SECONDS,
  });
}

export async function readSession(req: FastifyRequest): Promise<SessionData | null> {
  const cookie = req.cookies?.[COOKIE_NAME];
  if (!cookie) return null;
  try {
    const data = (await unsealData(cookie, { password: passwords, ttl: TTL_SECONDS })) as SessionData;
    if (!data?.userId) return null;
    return data;
  } catch {
    return null; // cookie inválido/expirado → sem sessão
  }
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAME, { path: '/' });
}

/**
 * Hook Fastify: anexa req.session ou null.
 *
 * IMPORTANTE: NÃO use via `app.register(sessionPlugin)` — plugins Fastify são
 * encapsulados por padrão e o hook não vazaria pra outras rotas.
 * Chame direto: `await sessionPlugin(app);`. Ou, se quiser via register, envolva
 * com `fastify-plugin` (fp).
 */
export const sessionPlugin = async (
  fastify: import('fastify').FastifyInstance,
): Promise<void> => {
  fastify.decorateRequest('session', null);
  fastify.addHook('preHandler', async (req) => {
    (req as FastifyRequest & { session: SessionData | null }).session = await readSession(req);
  });
};

declare module 'fastify' {
  interface FastifyRequest {
    session: SessionData | null;
  }
}
