-- Faithful Persona — DDL de referência (gerado pela mão; equivalente ao Drizzle schema.ts)
-- Use drizzle-kit generate pra produzir migrations canônicas.

-- ATENÇÃO ao deployar:
-- 1. Crie um role "fp_app" com SELECT/INSERT/UPDATE/DELETE nas tabelas de negócio.
-- 2. Não conceda UPDATE/DELETE em audit_log ao role do app — apenas INSERT.
-- 3. Crie um role read-only "fp_read" pra dashboards/leaderboards.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ===== users =====
CREATE TABLE IF NOT EXISTS users (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           TEXT         NOT NULL,
  password_hash   TEXT         NOT NULL,            -- argon2id (memoryCost 19456, timeCost 2)
  mfa_secret      TEXT,                              -- TOTP base32, null se desabilitado
  email_verified  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ,
  failed_login_count INTEGER   NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));

-- ===== players =====
CREATE TABLE IF NOT EXISTS players (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT         NOT NULL,
  schema_version INTEGER      NOT NULL DEFAULT 1,
  state          JSONB        NOT NULL,
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS players_user_id_idx ON players(user_id);

-- ===== items (normalizado pra marketplace futuro) =====
CREATE TABLE IF NOT EXISTS items (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id   UUID         NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  item_type   TEXT         NOT NULL,
  qty         INTEGER      NOT NULL DEFAULT 1 CHECK (qty >= 0),
  metadata    JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS items_player_idx ON items(player_id, item_type);

-- ===== shop_transactions =====
CREATE TABLE IF NOT EXISTS shop_transactions (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id   UUID         NOT NULL REFERENCES players(id),
  item_type   TEXT         NOT NULL,
  qty         INTEGER      NOT NULL CHECK (qty > 0),
  unit_price  INTEGER      NOT NULL CHECK (unit_price >= 0),
  total       INTEGER      NOT NULL CHECK (total >= 0),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shop_tx_player_idx ON shop_transactions(player_id, created_at DESC);

-- ===== audit_log (imutável) =====
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     UUID,
  action      TEXT         NOT NULL,
  ip          INET,
  user_agent  TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_log_user_idx ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log(action, created_at DESC);

-- ===== Permissões (rodar como superuser na criação) =====
-- CREATE ROLE fp_app LOGIN PASSWORD 'CHANGE_ME';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON users, players, items, shop_transactions TO fp_app;
-- GRANT INSERT ON audit_log TO fp_app;          -- só INSERT — log imutável
-- GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO fp_app;
--
-- CREATE ROLE fp_read LOGIN PASSWORD 'CHANGE_ME';
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO fp_read;
