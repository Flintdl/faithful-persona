/**
 * Drizzle ORM schema — Postgres 16.
 * Toda mudança aqui vira migration: `pnpm db:generate`.
 *
 * Princípios:
 * - app user no Postgres tem só INSERT/SELECT/UPDATE/DELETE (sem DDL)
 * - PII criptografada via app-level (libsodium) quando entrar (futuro)
 * - audit_log imutável (sem UPDATE/DELETE concedido ao app user)
 */
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  inet,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ===== users =====
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(), // argon2id
    mfaSecret: text('mfa_secret'), // null se não habilitou TOTP
    emailVerified: boolean('email_verified').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_lower_idx').on(sql`lower(${t.email})`),
  }),
);

// ===== players (1 por user no MVP, suporta N no futuro) =====
export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  schemaVersion: integer('schema_version').notNull().default(1),
  state: jsonb('state').notNull(), // PlayerState completo
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ===== inventory items (normalizado p/ marketplace futuro) =====
export const items = pgTable('items', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id')
    .notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  itemType: text('item_type').notNull(),
  qty: integer('qty').notNull().default(1),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ===== shop transactions (audit financial) =====
export const shopTransactions = pgTable('shop_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id')
    .notNull()
    .references(() => players.id),
  itemType: text('item_type').notNull(),
  qty: integer('qty').notNull(),
  unitPrice: integer('unit_price').notNull(),
  total: integer('total').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ===== audit log (imutável; revogue UPDATE/DELETE no role do app) =====
export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  userId: uuid('user_id'), // pode ser null (eventos pré-auth)
  action: text('action').notNull(), // 'login.success' | 'login.fail' | 'shop.buy' | ...
  ip: inet('ip'),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
