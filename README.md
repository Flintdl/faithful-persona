# Faithful Persona

> 2D top-down cozy adventure RPG para navegador — Phaser 3 + TypeScript + Vite.
> Backend Fastify + Postgres + Redis + Argon2id + iron-session.

📖 **Comece pela documentação**: [`DOCS/PROJECT_OVERVIEW.md`](./DOCS/PROJECT_OVERVIEW.md)

---

## Quick start em uma máquina nova (zero setup)

Pré-requisitos: **Node 20+** (recomendado 22 — tem `.nvmrc`), **git**, **(opcional) docker**.

```bash
git clone <seu-repo-url> faithful-persona
cd faithful-persona
nvm use            # opcional, lê .nvmrc
npm run bootstrap  # instala tudo, gera secret, sobe docker (interativo)
npm run dev        # http://localhost:5173
```

Sem docker / só pra dev rápido (modo mock):
```bash
npm run bootstrap:mock-only
npm run dev
```

---

## Estrutura

```
faithful-persona/
├── DOCS/         ← LEIA PRIMEIRO (overview, arquitetura, roadmap, security, assets, runbook)
├── client/       ← jogo Phaser 3 (Vite + TS)
├── server/       ← Fastify + Postgres + Redis + Argon2id (real)
├── shared/       ← types compartilhados (PlayerState, contratos API)
├── scripts/      ← bootstrap.mjs (setup automatizado)
└── docker-compose.yml ← postgres :5433 + redis :6379
```

## Comandos principais (raiz)

| Comando | O que faz |
|---|---|
| `npm run bootstrap` | Instala deps + gera secret + sobe docker + migrations (interativo) |
| `npm run bootstrap:mock-only` | Setup só do client (sem docker) |
| `npm run dev` | Vite dev server (client) |
| `npm run dev:server` | Fastify dev server (backend) |
| `npm run build` | Build de produção do client |
| `npm run type-check` | Type-check client + server |
| `npm run docker:up` | Sobe Postgres + Redis |
| `npm run docker:down` | Para containers |
| `npm run docker:reset` | Recria containers limpos (perde dados) |
| `npm run db:migrate` | Aplica migrations Drizzle |

## Modos de execução

**1. Só client (mock localStorage)** — não precisa do server, dev rápido
```bash
npm run dev
```

**2. Client + backend real** — auth+save persistem no Postgres
```bash
# terminal 1
npm run docker:up
npm run dev:server
# terminal 2
echo 'VITE_USE_MOCK_BACKEND=false' > client/.env.local
npm run dev
```

## Continuidade entre máquinas

Este projeto é desenhado pra você (humano ou IA) abrir em outra máquina e seguir sem fricção:
1. Clone o repo
2. `npm run bootstrap`
3. Leia `DOCS/PROJECT_OVERVIEW.md` (seção 4 = "Estado atual")
4. Continue de onde parou

A automação cria o `server/.env.local` com `IRON_SESSION_PASSWORD` random — **NUNCA commite esse arquivo** (já está no `.gitignore`).

Stack: Phaser 3.90 · TypeScript 5 strict · Vite 6 · Zod · Fastify 5 · Drizzle ORM · PostgreSQL 16 · Redis 7 · Argon2id · iron-session.

Detalhes em [`DOCS/`](./DOCS/).
