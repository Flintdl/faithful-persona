import type { FastifyRequest } from 'fastify';
import { db, schema } from '../db/index.js';

/**
 * Audit log imutável. Em prod, conceda apenas INSERT no role do app.
 * Logs vão pra Pino (stdout) também, pra agregação em SIEM.
 */
export async function audit(
  req: FastifyRequest,
  action: string,
  metadata?: Record<string, unknown>,
  userId?: string,
): Promise<void> {
  const ip = req.ip ?? null;
  const ua = req.headers['user-agent']?.toString().slice(0, 500) ?? null;
  try {
    await db.insert(schema.auditLog).values({
      userId: userId ?? req.session?.userId ?? null,
      action,
      ip,
      userAgent: ua,
      metadata: metadata ?? null,
    });
  } catch (err) {
    req.log.error({ err, action }, 'audit insert failed');
  }
  req.log.info({ action, userId: userId ?? req.session?.userId, ip, metadata }, 'audit');
}
