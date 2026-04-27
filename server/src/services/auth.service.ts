import argon2 from 'argon2';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

/**
 * Auth — Argon2id + invariants pra signup/login.
 *
 * Senhas: argon2id memoryCost 19456 KiB, timeCost 2, parallelism 1 (OWASP 2024).
 * Login responde em tempo constante: mesmo se user não existe, faz hash dummy
 * pra evitar timing attack que enumera emails.
 */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

// Hash pré-computado de uma senha aleatória — usado quando user não existe,
// pra que o tempo de resposta seja constante.
const DUMMY_HASH = argon2.hash('dummy-not-a-real-password-only-for-timing', ARGON2_OPTIONS);

export type SignupInput = { email: string; password: string; name: string };
export type LoginInput = { email: string; password: string };
export type AuthResult = { userId: string; email: string };

export class AuthError extends Error {
  constructor(
    public code: 'AUTH_INVALID' | 'EMAIL_TAKEN' | 'LOCKED' | 'VALIDATION',
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function signup(input: SignupInput): Promise<AuthResult> {
  // Verifica unicidade case-insensitive (email cidx no schema)
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = lower(${input.email})`)
    .limit(1);
  if (existing.length > 0) throw new AuthError('EMAIL_TAKEN', 'email already used');

  const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);

  const [user] = await db
    .insert(schema.users)
    .values({ email: input.email, passwordHash })
    .returning({ id: schema.users.id, email: schema.users.email });
  if (!user) throw new AuthError('VALIDATION', 'failed to create user');

  // cria player com state default
  await db.insert(schema.players).values({
    userId: user.id,
    name: input.name,
    schemaVersion: 1,
    state: defaultPlayerState(user.id, input.name),
  });

  return { userId: user.id, email: user.email };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      passwordHash: schema.users.passwordHash,
      lockedUntil: schema.users.lockedUntil,
      failedLoginCount: schema.users.failedLoginCount,
    })
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = lower(${input.email})`)
    .limit(1);

  // Tempo constante: sempre verifica algo
  const hashToCheck = user?.passwordHash ?? (await DUMMY_HASH);
  const ok = await argon2.verify(hashToCheck, input.password).catch(() => false);

  if (!user) throw new AuthError('AUTH_INVALID', 'invalid credentials');

  // Bloqueio progressivo
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AuthError('LOCKED', 'account temporarily locked');
  }

  if (!ok) {
    const fails = (user.failedLoginCount ?? 0) + 1;
    const lockMin = fails >= 10 ? 60 : fails >= 5 ? 15 : 0;
    const lockedUntil = lockMin > 0 ? new Date(Date.now() + lockMin * 60_000) : null;
    await db
      .update(schema.users)
      .set({ failedLoginCount: fails, lockedUntil })
      .where(eq(schema.users.id, user.id));
    throw new AuthError('AUTH_INVALID', 'invalid credentials');
  }

  await db
    .update(schema.users)
    .set({ lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null })
    .where(eq(schema.users.id, user.id));

  return { userId: user.id, email: user.email };
}

function defaultPlayerState(userId: string, name: string): unknown {
  // Igual a DEFAULT_PLAYER_STATE em shared/types/game.types.ts
  return {
    id: userId,
    name,
    level: 1,
    hp: 6,
    maxHp: 6,
    coins: 0,
    position: { mapId: 'world_meadow', x: 480, y: 270, facing: 'down' },
    inventory: [],
    flags: {},
    updatedAt: new Date().toISOString(),
    schemaVersion: 1,
  };
}
