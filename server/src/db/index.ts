import { config as loadEnv } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });
import pg from 'pg';
import * as schema from './schema.js';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL not set — copy server/.env.example to .env.local and configure');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  // pg pode emitir erro idle; logamos pra não crashar o processo silenciosamente
  // eslint-disable-next-line no-console
  console.error('[pg pool error]', err);
});

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
