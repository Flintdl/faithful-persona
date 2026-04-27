# Faithful Persona — Architecture

> Decisões técnicas, fluxos, padrões. Atualize aqui quando mudar arquitetura, com a razão.

---

## 1. Visão de alto nível

```
┌─────────────────────────────────────────────────────────────────┐
│                         BROWSER (CLIENT)                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                       Phaser 3 Game                         │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐    │ │
│  │  │   Boot   │→ │ Preload  │→ │  Lobby   │→ │  World  │    │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────────┘    │ │
│  │                                                  ↕         │ │
│  │                                            ┌─────────┐    │ │
│  │                                            │   Hud   │    │ │
│  │                                            └─────────┘    │ │
│  │                                                            │ │
│  │  Systems: Input · Health · Inventory · Save · EventBus    │ │
│  │  Entities: Player · NPC · Coin · Interactable             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                            ↕                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Services: ApiClient (Mock | Real)  ·  AuthService         │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                             ↕ HTTPS / WSS
┌─────────────────────────────────────────────────────────────────┐
│                     SERVER (futuro, esqueleto)                   │
│  ┌──────────────────────┐    ┌────────────────────────────────┐ │
│  │   Fastify HTTP API   │    │  Colyseus Game Server (WSS)    │ │
│  │  /auth /save /shop   │    │  WorldRoom (state sync)        │ │
│  └──────────────────────┘    └────────────────────────────────┘ │
│            ↕                              ↕                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Drizzle ORM  →  PostgreSQL 16    ·    Redis 7 (cache)  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Cliente — Phaser scenes

### Hierarquia de cenas
| Scene | Tipo | Responsabilidade |
|---|---|---|
| **BootScene** | one-shot | Configurações iniciais, gera texturas procedurais via `Phaser.Display.Graphics`, transita pra Preload |
| **PreloadScene** | one-shot | Loading bar, carrega tilemaps JSON, áudios, sprites externos (quando houver) |
| **LobbyScene** | persistente | Hub estilo Fortnite. Avatar central, botões de menu, info do jogador |
| **WorldScene** | persistente (entra/sai) | O jogo em si: tilemap, player, entidades, físicas |
| **HudScene** | overlay | UI sobreposta. Roda paralelo à WorldScene. `scene.launch('hud')` |

**Por que cenas separadas pro HUD?** Performance (não recria UI), separação de concerns, fácil de plugar/desplugar.

### Comunicação entre cenas
- Via **EventBus** singleton (`utils/EventBus.ts`) — desacopla emissor/ouvinte.
- Estado global mínimo no **Phaser.Registry** (`game.registry.set/get`) — só pra dados serializáveis.
- **Não usar** `scene.get('Hud').foo()` — acoplamento ruim.

Exemplo:
```ts
// Player coleta moeda
EventBus.emit('coin:collected', { amount: 1, total: player.coins });

// HudScene escuta
EventBus.on('coin:collected', ({ total }) => coinCounter.update(total));
```

---

## 3. Cliente — Entidades

Cada entidade é uma classe que estende `Phaser.GameObjects.Sprite` ou compõe um sprite:

```
entities/
├── Player.ts            # Sprite + body, anims idle/walk, controller
├── NPC.ts               # Sprite + dialog tree
├── Coin.ts              # Sprite + overlap collector + physics body
├── InteractableObject.ts # Base pra placas, baús, portas
└── TriggerZone.ts       # Body invisível pra transições / eventos
```

**Padrão**: entidade não conhece a Scene em detalhes. Recebe `scene` no construtor, registra-se nela, mas comunica via EventBus quando possível.

**Por que não ECS puro (bitECS, Miniplex) agora?** Overkill pra MVP. Phaser já tem GameObject + Physics que cobre. Refatorar pra ECS quando: 1k+ entidades, ou queremos serialização/replay/network sync mais granular. A modularidade atual permite migração.

---

## 4. Cliente — Sistemas

```
systems/
├── InputSystem.ts       # Mapeia WASD/setas/touch → comandos abstratos (Up/Down/Left/Right/Interact)
├── HealthSystem.ts      # Vida do player, dano, morte, respawn
├── InventorySystem.ts   # Itens, moedas, equipamentos
├── SaveSystem.ts        # Serialização/deserialização do estado, autosave
└── CollisionSystem.ts   # (opcional, Phaser physics já cobre 90%)
```

**Sistema = lógica horizontal que atua sobre múltiplas entidades.** Diferente de entidade, que é vertical.

---

## 5. Cliente — Services (camada de integração)

```
services/
├── ApiClient.ts            # Interface única
├── MockApiClient.ts        # Implementa ApiClient com localStorage + delay simulado
├── HttpApiClient.ts        # Implementa ApiClient com fetch real → Fastify
├── AuthService.ts          # login/logout/me, abstrai backend
└── EventReporter.ts        # Telemetria (Sentry, custom)
```

**Padrão Strategy**: o jogo usa `ApiClient` (interface). Em runtime, decide qual implementação:

```ts
// services/index.ts
export const api: ApiClient = import.meta.env.VITE_USE_MOCK_BACKEND === 'true'
  ? new MockApiClient()
  : new HttpApiClient(import.meta.env.VITE_API_BASE_URL);
```

**Por quê?** Permite desenvolver o jogo offline sem dependência de servidor, e ao subir o backend real basta flippar a env.

**Contratos** ficam em `shared/types/api.types.ts` — usados pelos dois lados.

---

## 6. Save & Sincronização

### Estado do jogador (canônico)
```ts
type PlayerState = {
  id: string;            // uuid
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  coins: number;
  position: { mapId: string; x: number; y: number };
  inventory: Item[];
  flags: Record<string, boolean>;  // quests, achievements, switches do mundo
  updatedAt: string;     // ISO
  schemaVersion: number; // pra migrações futuras
};
```

### Fluxo de save
1. Eventos in-game (coleta, dano, transição) atualizam o **estado em memória** + emitem `state:dirty`.
2. **Autosave** debounced (2s sem mudança) → `api.savePlayer(state)`.
3. Mock grava em `localStorage[fp:save:{userId}]` com checksum.
4. Real grava no Postgres (`UPDATE players SET state_jsonb = $1, updated_at = now() WHERE id = $2`).
5. Conflito (server tem versão mais nova) → reload do server, descarta local. Em multiplayer, server-authoritative ganha sempre.

### Versionamento de schema
- `schemaVersion` no save → migrations no `SaveSystem.migrate(state)`.
- Server tem o mesmo handler.

---

## 7. Server (esqueleto preparado)

### Fastify HTTP API
```
server/src/
├── server.ts                # bootstrap (helmet, cors, rate-limit, sessions)
├── routes/
│   ├── auth.routes.ts       # POST /auth/signup, /login, /logout, /me
│   ├── save.routes.ts       # GET /save, PUT /save
│   └── shop.routes.ts       # GET /shop/items, POST /shop/buy
├── controllers/             # camada thin sobre services
├── services/                # lógica de negócio
├── db/
│   ├── schema.ts            # Drizzle (TS first)
│   ├── schema.sql           # SQL gerado (pra DBA review)
│   └── migrations/          # versionadas via drizzle-kit
└── middleware/
    ├── auth.ts              # iron-session + RBAC
    ├── rateLimit.ts         # @fastify/rate-limit + Redis
    └── audit.ts             # log de ações sensíveis
```

### Game server (Colyseus)
- **WorldRoom** — sala multiplayer, mantém estado autoritativo de N players num mapa.
- **State sync** binário via `@colyseus/schema` (delta encoding).
- Movimento do player: client envia **input** (não posição), server simula, broadcast estado.
- Anti-cheat: server valida velocidade máxima, colisão, ações.

### Banco — schema base (Postgres)
```sql
-- users (auth)
users (id uuid pk, email citext unique, password_hash text, mfa_secret text,
       created_at timestamptz, last_login_at timestamptz)

-- players (1:1 com users no MVP, suporta múltiplos chars depois)
players (id uuid pk, user_id uuid fk, name text, state_jsonb jsonb,
         schema_version int, updated_at timestamptz)

-- inventories (normalizado, para queries de marketplace futuro)
items (id uuid pk, player_id uuid fk, item_type text, qty int, metadata jsonb)

-- shop_transactions (auditoria)
shop_transactions (id uuid pk, player_id uuid fk, item_type text, price int,
                   created_at timestamptz)

-- audit_log (segurança)
audit_log (id bigserial, user_id uuid, action text, ip inet, ua text,
           metadata jsonb, created_at timestamptz)

-- sessions (Redis primário, Postgres backup)
-- rate_limits (Redis only)
```

Indexes: `users(email)`, `players(user_id)`, `items(player_id, item_type)`, `audit_log(user_id, created_at desc)`.

### Por que Drizzle e não Prisma?
- Sem proxy/runtime mágico — só TS → SQL.
- Edge-compatible (Cloudflare Workers, Bun).
- Migrations SQL puro, fáceis de revisar.
- Performance superior em queries complexas.

---

## 8. Segurança aplicada (resumo, ver SECURITY.md)

- **Server-authoritative** em multiplayer (anti-cheat).
- **Validação dupla**: client UX + server enforce (Zod compartilhado).
- **Sessions** via iron-session (cookies HttpOnly+Secure+SameSite=Strict, opacas).
- **Argon2id** pra senhas.
- **Rate limit** por IP + user em endpoints sensíveis.
- **Headers**: helmet com CSP rigoroso, HSTS, X-Frame-Options=DENY.
- **Audit log** de ações sensíveis (compras, mudança de senha, transferências).
- **Sem secrets em código**, usa `.env` + Vault em prod.
- **CORS** restritivo (allowlist do domínio do client).
- **Sanitização** de qualquer texto user-generated (DOMPurify se renderizar HTML, mas no canvas é seguro por natureza — só validar tamanho/charset).

---

## 9. Build & Deploy

### Dev
- `client`: Vite dev server (HMR, port 5173).
- `server`: tsx watch + Fastify (port 3000), Colyseus (port 2567).
- Postgres + Redis via `docker compose up -d`.

### Prod (alvo)
- **Client**: build estático → CDN (Cloudflare Pages, Netlify, S3+CloudFront). Cache agressivo de assets, HTML no-cache.
- **Server**: containerizado (Docker), em ECS/Fly.io/Railway. Postgres gerenciado (Neon, Supabase, RDS). Redis gerenciado (Upstash, ElastiCache).
- **Game server (Colyseus)**: precisa de WebSocket, prefere Fly.io ou ECS. Sticky sessions ou shared state via Redis Pub/Sub pra escalar horizontalmente.

### CI (GitHub Actions)
```
on: [push, pull_request]
jobs:
  ci:
    - pnpm install --frozen-lockfile
    - pnpm biome check
    - pnpm type-check
    - pnpm test
    - pnpm build
    - pnpm audit --audit-level=high     # bloqueia HIGH/CRITICAL
```

---

## 10. Padrões de código

- **TypeScript strict** (`strict: true`, `noUncheckedIndexedAccess: true`).
- **Imports absolutos** com alias `@/` (configurado em tsconfig + vite).
- **Sem `any`** salvo em adapters de libs sem types (com comentário do porquê).
- **Funções pequenas, classes coesas.** Se um arquivo passa de 300 linhas, considere quebrar.
- **Nomes em inglês** no código, **comentários em português** quando necessário.
- **Sem comentários óbvios.** Código bem nomeado se explica.
- **Errors falam pro humano**: `throw new Error('Player.move: invalid direction "${dir}"')`.

---

## 11. Decisões em aberto (revisitar)

| Tema | Status | Notas |
|---|---|---|
| Arte hand-drawn real | placeholder procedural | substituir após fechar gameplay; manter formato 16x16 ou 32x32 tiles |
| ECS vs OOP | OOP por enquanto | migrar quando passar de ~1k entidades on-screen ou multiplayer ficar pesado |
| Touch controls (mobile) | não no MVP | adicionar joystick virtual + botão E quando UA for mobile |
| Áudio | sem áudio no MVP | usar Howler ou Phaser sound; pré-carregar OGG+MP3 |
| i18n | só PT-BR no MVP | i18next preparado pra plug |
| Anti-cheat profundo | server-authoritative cobre 80% | code obfuscation só se for cobrar; evitar paranoia que prejudique modders |
