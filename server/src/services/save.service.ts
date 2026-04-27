import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { PlayerState } from '../../../shared/types/game.types.js';

const CURRENT_SCHEMA_VERSION = 1;

export class SaveError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'AUTHZ' | 'INVARIANT' | 'SCHEMA_MISMATCH',
    message: string,
  ) {
    super(message);
    this.name = 'SaveError';
  }
}

export async function getSave(userId: string): Promise<PlayerState | null> {
  const [row] = await db
    .select({ state: schema.players.state, updatedAt: schema.players.updatedAt })
    .from(schema.players)
    .where(eq(schema.players.userId, userId))
    .limit(1);
  if (!row) return null;
  return row.state as PlayerState;
}

/**
 * Server-authoritative: invariants validados antes de gravar.
 * Quem chama é responsável por garantir state.id === session.userId.
 */
export async function putSave(userId: string, state: PlayerState): Promise<{ updatedAt: string }> {
  if (state.id !== userId) throw new SaveError('AUTHZ', 'state.id mismatch');
  if (state.schemaVersion !== CURRENT_SCHEMA_VERSION)
    throw new SaveError('SCHEMA_MISMATCH', `expected v${CURRENT_SCHEMA_VERSION}`);
  if (state.hp < 0 || state.hp > state.maxHp) throw new SaveError('INVARIANT', 'hp out of range');
  if (state.maxHp <= 0 || state.maxHp > 200) throw new SaveError('INVARIANT', 'maxHp out of range');
  if (state.coins < 0 || state.coins > 1_000_000)
    throw new SaveError('INVARIANT', 'coins out of range');
  if (state.level < 1 || state.level > 999)
    throw new SaveError('INVARIANT', 'level out of range');
  if (!state.name || state.name.length > 32)
    throw new SaveError('INVARIANT', 'name length');
  if (!state.position || typeof state.position.x !== 'number')
    throw new SaveError('INVARIANT', 'position');
  if (!Array.isArray(state.inventory) || state.inventory.length > 200)
    throw new SaveError('INVARIANT', 'inventory length');

  const now = new Date();
  const stateWithTs: PlayerState = { ...state, updatedAt: now.toISOString() };

  await db
    .update(schema.players)
    .set({ state: stateWithTs, updatedAt: now })
    .where(eq(schema.players.userId, userId));

  return { updatedAt: now.toISOString() };
}
