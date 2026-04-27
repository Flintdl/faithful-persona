import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PlayerState } from '../../../shared/types/game.types.js';
import { audit } from '../services/audit.service.js';
import { getSave, putSave, SaveError } from '../services/save.service.js';

const PlayerStateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(32),
  level: z.number().int().min(1).max(999),
  hp: z.number().min(0),
  maxHp: z.number().min(1).max(200),
  coins: z.number().int().min(0).max(1_000_000),
  position: z.object({
    mapId: z.enum(['world_meadow', 'world_forest', 'world_village']),
    x: z.number(),
    y: z.number(),
    facing: z.enum(['up', 'down', 'left', 'right']),
  }),
  inventory: z
    .array(z.object({ type: z.string().max(64), qty: z.number().int().min(0).max(9999) }))
    .max(200),
  flags: z.record(z.string().max(64), z.boolean()),
  updatedAt: z.string(),
  schemaVersion: z.number().int(),
});

export async function saveRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (req, reply) => {
    if (!req.session) {
      reply.code(401).send({ code: 'NOT_AUTHENTICATED' });
      return;
    }
    const state = await getSave(req.session.userId);
    reply.send({ state });
  });

  app.put('/', async (req, reply) => {
    if (!req.session) {
      reply.code(401).send({ code: 'NOT_AUTHENTICATED' });
      return;
    }
    const body = req.body as { state?: unknown };
    const parsed = PlayerStateSchema.safeParse(body?.state);
    if (!parsed.success) {
      reply.send({ ok: false, reason: 'VALIDATION' });
      return;
    }
    try {
      // o schema Zod permite qualquer string em type — server-side delegamos a regra de negócio
      // pro service. O cast é seguro porque o service valida invariants de novo.
      const result = await putSave(req.session.userId, parsed.data as PlayerState);
      reply.send({ ok: true, updatedAt: result.updatedAt });
    } catch (err) {
      if (err instanceof SaveError) {
        await audit(req, 'save.put.reject', { code: err.code, msg: err.message });
        reply.send({ ok: false, reason: `${err.code}:${err.message}` });
        return;
      }
      throw err;
    }
  });
}
