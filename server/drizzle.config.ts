import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Carrega .env.local primeiro (gitignored, dev), depois .env (não usado)
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required (copy server/.env.example to .env.local)');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
