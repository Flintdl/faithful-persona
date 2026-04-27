# Faithful Persona — Server

> Esqueleto Fastify + Colyseus + Drizzle/Postgres + Redis.
> **NÃO roda no MVP** — o client usa MockApiClient (localStorage). Esta pasta documenta a estrutura para quando subirmos o backend real.

## Quando ativar

1. Copie `.env.example` → `.env.local`, preencha `DATABASE_URL`, `REDIS_URL`, `IRON_SESSION_PASSWORD` (32+ bytes random).
2. `docker compose up -d postgres redis` na raiz do projeto.
3. `pnpm install`
4. `pnpm db:migrate`
5. `pnpm dev` → Fastify sobe em :3000, Colyseus em :2567.
6. No client, `.env.local`: `VITE_USE_MOCK_BACKEND=false` e `VITE_API_BASE_URL=http://localhost:3000`.

## Stack

- **Fastify 5** — HTTP API, schema validation built-in
- **Colyseus 0.16** — game server multiplayer authoritative
- **Drizzle ORM** + **Postgres 16**
- **Redis 7** — sessões, rate limit, presença
- **iron-session** — sessões opacas em cookie HttpOnly
- **argon2** — hashing de senha
- **@fastify/helmet** — headers de segurança
- **@fastify/rate-limit** — rate limiting
- **pino** — logging JSON estruturado
- **zod** — validação compartilhada com client

## Estrutura

```
server/src/
├── server.ts            # bootstrap (helmet, cors, sessions, rate-limit)
├── routes/              # /auth, /save, /shop
├── controllers/         # camada thin
├── services/            # regra de negócio (server-authoritative checks)
├── rooms/               # Colyseus rooms (WorldRoom)
├── db/
│   ├── schema.ts        # Drizzle TS-first
│   ├── schema.sql       # SQL gerado (referência pra DBA)
│   └── migrations/      # versionadas drizzle-kit
└── middleware/
    ├── auth.ts          # iron-session + RBAC
    ├── rateLimit.ts     # store Redis
    └── audit.ts         # log de ações sensíveis
```

## Segurança aplicada

Veja `DOCS/SECURITY.md` na raiz. Resumo:
- Argon2id (memoryCost 19456, timeCost 2)
- Rate limit 5/15min em `/auth/login`
- iron-session cookies: HttpOnly + Secure + SameSite=Strict + `__Host-` prefix
- Helmet com CSP rigoroso
- Server-authoritative em todas as ações (save invariants validados)
- Audit log em ações sensíveis
