# Faithful Persona — Project Overview

> **Documento mestre.** Leia este primeiro se você está retomando o projeto em outra máquina/conta de IA.
> Última atualização: 2026-04-27

---

## 1. O que é o jogo

**Faithful Persona** é um RPG de aventura 2D top-down para navegador, com visual cartoon hand-drawn, clima aconchegante (cozy) e câmera levemente inclinada acompanhando o personagem. Inspirações: *Stardew Valley*, *Zelda: A Link to the Past*, *Pokémon Mystery Dungeon*, lobbies de hub estilo *Fortnite*.

### Pilares de design
1. **Cozy exploration** — exploração relaxante, sem stress.
2. **Mundo persistente** — personagem evolui, mundo lembra suas ações.
3. **Multiplayer-ready** — single-player primeiro, mas a arquitetura suporta multiplayer/co-op desde o dia 1 (server-authoritative).
4. **Browser-first** — roda em qualquer navegador moderno via HTML5 Canvas/WebGL, sem instalação.
5. **Mod-friendly no futuro** — tilemaps em Tiled JSON, dados em JSON tipado.

### Loop de gameplay (MVP)
1. Player abre o jogo → cai no **Lobby** (hub estilo Fortnite).
2. Do lobby clica em **PLAY** → entra no **WorldScene** (área verde com rio e ponte).
3. Move-se em 4 direções (WASD/setas), coleta moedas, interage com NPCs/objetos (E), colide com árvores/pedras/água/penhascos.
4. HUD mostra vida (corações, inferior esquerdo) e moedas (superior direito).
5. Atravessa a ponte → transição para próximo mapa (placeholder).

### Gêneros
2D top-down cozy adventure RPG • hand-drawn tilemap adventure • Phaser 3 top-down RPG • Zelda-like browser game • cozy 2D exploration.

---

## 2. Stack tecnológica (best-in-class 2026)

### Client (jogo)
| Camada | Tecnologia | Por quê |
|---|---|---|
| Engine 2D | **Phaser 3.90+** | Framework 2D mais maduro pra browser, suporte WebGL/Canvas, físicas, tilemaps, animações |
| Linguagem | **TypeScript 5.x strict** | Tipo-segurança, refactor seguro, melhor DX |
| Bundler | **Vite 6** | Dev server instantâneo, HMR, build otimizado |
| Validação | **Zod** | Schemas runtime + tipos derivados, valida payloads do servidor |
| Estado UI | **EventBus interno + Phaser Registry** | Sem framework reativo extra; jogo em si usa entidades Phaser |
| Logger | **Pino (browser build)** | JSON estruturado, performático |
| Tests | **Vitest** + **Playwright** | Unit + E2E |

### Server (mockado agora, pronto pra produção)
| Camada | Tecnologia | Por quê |
|---|---|---|
| Runtime | **Node.js 22** ou **Bun 1.x** | Bun é mais rápido, Node tem ecossistema maior. Código compatível com ambos |
| HTTP API | **Fastify 5** | Mais rápido que Express, schema-validation nativo via JSON Schema, plugins maduros |
| Game server | **Colyseus 0.16** | Framework multiplayer authoritative, state sync via WebSocket, salas, escalável |
| ORM | **Drizzle ORM** | Type-safe, migrations versionadas, edge-compatible, mais leve que Prisma |
| Banco | **PostgreSQL 16** | ACID, JSONB, partições, full-text search; padrão indústria |
| Cache/Sessão | **Redis 7** | Sessões, rate limit, presença online, leaderboard |
| Auth | **Argon2id + iron-session ou Lucia/better-auth** | Hashing forte, sessões opacas server-side |
| Validação | **Zod** (compartilhado com client) | Mesmo schema dos dois lados |
| Logger | **Pino** | Padrão Node moderno |
| Observabilidade | **OpenTelemetry + Sentry** | Traces + erros |
| File storage | **S3-compatível (R2/MinIO)** | Assets, saves grandes |

### Tooling / DevEx
| Ferramenta | Uso |
|---|---|
| **pnpm workspaces** | Monorepo client+server+shared |
| **Biome** | Lint + format ultra-rápido (substitui ESLint+Prettier) |
| **Vitest** | Tests unitários |
| **Playwright** | E2E no navegador real |
| **Tiled** | Editor de tilemaps (export JSON) |
| **GitHub Actions** | CI: lint, type-check, test, build |
| **Docker + docker-compose** | Postgres + Redis local + game server |
| **Dependabot/Renovate** | Atualização automática de deps |

### Por que NÃO outras opções
- **Unity / Godot WebGL** → bundle pesado, slow boot, pior pra browser cozy.
- **PixiJS puro** → ótimo renderizador, mas você reescreve física/câmera/tilemap; Phaser dá tudo isso.
- **Construct 3** → no-code não escala pro tipo de arquitetura que queremos.
- **Express** → Fastify é mais rápido e seguro por padrão.
- **Prisma** → bom, mas Drizzle é mais leve, edge-compatível e gera SQL mais previsível.
- **Socket.IO puro** → Colyseus já implementa state sync, rooms, lag compensation.

---

## 3. Estrutura do repositório

```
faithful-persona/
├── DOCS/
│   ├── PROJECT_OVERVIEW.md       ← você está aqui
│   ├── ARCHITECTURE.md           ← decisões técnicas, fluxos, ECS, autoritarismo
│   ├── ROADMAP.md                ← MVP → escala → multiplayer → mods
│   └── SECURITY.md               ← checklist OWASP/ASVS aplicado a este jogo
├── client/                       ← Phaser 3 + TS + Vite (jogo)
│   ├── public/assets/            ← sprites, tilemaps, audio, UI
│   ├── src/
│   │   ├── main.ts               ← bootstrap
│   │   ├── config/               ← GameConfig, constants
│   │   ├── scenes/               ← Boot, Preload, Lobby, World, Hud
│   │   ├── entities/             ← Player, NPC, Coin, InteractableObject
│   │   ├── systems/              ← Input, Save, Health, Inventory
│   │   ├── ui/                   ← HealthBar, CoinCounter, DialogBox
│   │   ├── services/             ← ApiClient, AuthService, MockBackend
│   │   ├── types/                ← tipos client-only
│   │   ├── utils/                ← EventBus, Logger, math
│   │   └── gen/                  ← assets procedurais (texturas geradas via Graphics)
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── .env.example
├── server/                       ← Fastify + Colyseus (esqueleto, não roda no MVP)
│   ├── src/
│   │   ├── server.ts             ← entrypoint
│   │   ├── routes/               ← /auth, /save, /shop
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── rooms/                ← Colyseus rooms (WorldRoom)
│   │   ├── db/
│   │   │   ├── schema.ts         ← Drizzle schema TS
│   │   │   ├── schema.sql        ← SQL gerado (referência)
│   │   │   └── migrations/
│   │   └── middleware/           ← auth, rate-limit, helmet
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── shared/                       ← contratos compartilhados
│   └── types/
│       ├── api.types.ts          ← request/response da API
│       ├── game.types.ts         ← Player, Item, Map state
│       └── events.types.ts       ← eventos Colyseus
├── scripts/                      ← utilitários (gen-assets, seed-db)
├── .github/workflows/            ← CI
├── docker-compose.yml            ← postgres + redis local
├── pnpm-workspace.yaml
├── package.json                  ← workspace root
├── biome.json                    ← lint + format
├── .gitignore
├── .editorconfig
└── README.md                     ← quick start
```

---

## 4. Estado atual do projeto (2026-04-27)

### ✅ Pronto
- Estrutura de pastas
- Documentação MD completa (este arquivo + ARCHITECTURE + ROADMAP + SECURITY)
- Setup Vite + TypeScript + Phaser 3
- Boot/Preload com geração de texturas procedurais (placeholders enquanto não há arte hand-drawn)
- LobbyScene estilo Fortnite (avatar central, painéis PLAY/INVENTORY/SHOP/SETTINGS, info de conta)
- WorldScene com mapa programático: grama, terra, árvores, pedras, flores, penhasco, escada, rio, ponte de madeira
- Player com movimentação 4-direções (WASD + setas), animação idle/walk, colisão (árvores/pedras/água/penhasco/limites)
- Câmera top-down seguindo o player com leve interpolação
- HudScene: corações de vida (canto inferior esquerdo) + contador de moedas (canto superior direito)
- Coleta de moedas (overlap)
- Interação E com objetos/NPCs (raycast direcional + DialogBox)
- SaveSystem mockado (localStorage com schema versionado, mesmo formato da API real)
- Transição de mapas via TriggerZone (atravessar ponte → World2 placeholder)
- ApiClient com camada Mock que segue exatamente o contrato da API real (drop-in replacement)

### 🟡 Esqueleto pronto, sem rodar (preparado pra produção real)
- Server Fastify + Colyseus (estrutura, schema Drizzle, migrations, README)
- Shared types entre client/server
- Docker compose com Postgres + Redis
- CI GitHub Actions

### 🔴 Backlog (próximas iterações)
- Substituir placeholders procedurais por arte hand-drawn real (Aseprite/Tiled)
- Implementar server real (subir Postgres+Redis, ligar ApiClient na API real)
- Sistema de combate
- Inventário expandido
- Quests
- Áudio (música ambiente + SFX)
- Multiplayer (Colyseus já preparado)
- Mobile touch controls

---

## 5. Como rodar (qualquer máquina)

### Pré-requisitos
- **Node.js 20+** (recomendado 22 LTS) — `node --version`
- **pnpm 9+** — `npm install -g pnpm` (ou usa npm/yarn, mas pnpm é o oficial do projeto)
- (Opcional) **Docker** se quiser subir Postgres+Redis pra testar server real

### Quick start (só client, MVP funcional)
```bash
cd /home/programacao-front/Documentos/faithful-persona/client
pnpm install        # ou npm install
pnpm dev            # abre em http://localhost:5173
```

### Build de produção
```bash
cd client
pnpm build          # gera dist/
pnpm preview        # serve localmente pra testar build
```

### Server real (futuro, ainda mockado no client)
```bash
docker compose up -d postgres redis
cd server
pnpm install
pnpm db:migrate
pnpm dev            # Fastify + Colyseus em http://localhost:3000
```

E no client, mude `.env`:
```
VITE_API_BASE_URL=http://localhost:3000
VITE_USE_MOCK_BACKEND=false
```

---

## 6. Continuidade entre máquinas / contas de IA

Se você (humano ou IA) está abrindo este projeto pela primeira vez:

1. **Leia em ordem:** `PROJECT_OVERVIEW.md` (este) → `ARCHITECTURE.md` → `ROADMAP.md` → `SECURITY.md`.
2. **Confira o estado atual** na seção 4 deste documento. Atualize-o ao terminar uma tarefa significativa.
3. **Não invente arquitetura.** As decisões técnicas estão em `ARCHITECTURE.md` com justificativa. Se mudar algo, registre lá com a razão.
4. **Não comprometa a segurança.** Antes de qualquer feature que toque auth, sessão, input do usuário, banco, ou network, releia `SECURITY.md` e a referência em `Documentos/CONFIGURACOES_PROJETOS_AVANCADOS/security_instructions.md`.
5. **Mock vs real.** Toda integração externa tem versão mock (em `client/src/services/Mock*`). O contrato é o mesmo. Pra trocar, basta flippar a env `VITE_USE_MOCK_BACKEND`.
6. **Sempre rode** `pnpm type-check && pnpm lint && pnpm test` antes de considerar uma tarefa pronta.

---

## 7. Glossário rápido

- **ECS** — Entity Component System; padrão arquitetural pra jogos. Não usamos puro neste MVP, mas as entidades estão modulares pra evoluir pra ECS depois.
- **Server-authoritative** — o servidor é a fonte da verdade do estado do jogo (anti-cheat). Cliente prediz, servidor reconcilia.
- **Tilemap** — mapa baseado em grade de tiles (16x16 ou 32x32). Editado no Tiled, exportado em JSON, carregado no Phaser.
- **HUD** — Heads-Up Display; UI sobreposta ao jogo (vida, moedas).
- **TriggerZone** — área invisível que dispara evento ao player entrar.
- **Colyseus Room** — sala multiplayer com estado sincronizado.
