# Faithful Persona — Runbook

> Como rodar, debugar, e retomar em outra máquina.

---

## 1. Rodar (qualquer máquina)

### Pré-requisitos
- **Node.js 20+** (recomendado 22 LTS) — `node --version`
- (Opcional) **pnpm 9+** — `npm install -g pnpm` (npm também funciona)

### Primeira vez
```bash
cd /caminho/para/faithful-persona/client
npm install            # ou: pnpm install
npm run dev            # ou: pnpm dev
```

Abre em http://127.0.0.1:5173

### Build de produção
```bash
cd client
npm run build          # gera client/dist/
npm run preview        # serve o build localmente em :4173
```

### Type-check / lint / test
```bash
cd client
npx tsc --noEmit       # type-check
npm test               # vitest (quando houver testes)

# da raiz do projeto:
cd ..
npx @biomejs/biome check .   # lint+format check
npx @biomejs/biome format --write .  # auto-fix
```

---

## 2. Estado do save (mockado)

O save fica no **localStorage** do navegador, namespace `fp:mock:*`:
- `fp:mock:users` — lista de usuários (no mock cria um "guest" auto na 1ª vez)
- `fp:mock:session` — sessão atual
- `fp:mock:state:<userId>` — estado do jogador

### Resetar tudo
DevTools → Application → Local Storage → http://127.0.0.1:5173 → clear all.
Ou no console: `localStorage.clear()` e F5.

---

## 3. Backend real (Fastify + Postgres + Redis + Argon2id + iron-session)

O server está implementado e funcional. Modo dev usa MockApiClient (localStorage) por padrão; pra rodar contra o backend real:

### Subir uma vez
```bash
# 1. Postgres + Redis via docker (porta host 5433 pra postgres, 6379 redis)
cd /home/programacao-front/Documentos/faithful-persona
docker compose up -d

# 2. Server env (gera IRON_SESSION_PASSWORD random)
cd server
cp .env.example .env.local
SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64'))")
sed -i "s|IRON_SESSION_PASSWORD=.*|IRON_SESSION_PASSWORD=$SECRET|" .env.local

# 3. Migrations (cria users, players, items, shop_transactions, audit_log)
npm install
npm run db:migrate

# 4. Sobe Fastify
npm run dev          # http://localhost:3000
```

### Apontar o client pro backend real
```bash
cd client
cat > .env.local <<EOF
VITE_USE_MOCK_BACKEND=false
VITE_API_BASE_URL=http://localhost:3000
EOF
npm run dev
```

### Endpoints disponíveis
| Método | Path | Função |
|---|---|---|
| GET | `/health` | healthcheck |
| POST | `/auth/signup` | cria conta (Argon2id, body `{email, password, name}`) |
| POST | `/auth/login` | login (rate-limit 5/15min, lockout progressivo) |
| POST | `/auth/logout` | destrói cookie |
| GET | `/auth/me` | retorna sessão atual ou 401 |
| GET | `/save` | retorna PlayerState do user logado |
| PUT | `/save` | persiste PlayerState (invariants validados) |

### Segurança aplicada
- Argon2id (memoryCost 19456, timeCost 2)
- iron-session com cookie `HttpOnly`+`Secure`(prod)+`SameSite=Strict`
- Lockout progressivo: 5 falhas → 15min, 10 falhas → 1h
- Rate limit `@fastify/rate-limit`: 5/15min em login
- Login responde em tempo constante (compara hash dummy se user não existe)
- Helmet com CSP rigoroso
- Server-authoritative: invariants em PUT /save (hp≤maxHp, coins≥0, AUTHZ state.id===session.userId)
- Audit log imutável em todas auth ops + save rejects
- Drizzle ORM = parameterized queries 100%
- Body limit 256 KB

### Validar com curl
```bash
JAR=/tmp/cookies.txt
# 1. signup
curl -c $JAR -X POST localhost:3000/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"x@y.z","password":"correctHorseBattery","name":"X"}'
# 2. me
curl -b $JAR localhost:3000/auth/me
# 3. save get/put
curl -b $JAR localhost:3000/save
```

### Rollback rápido
- Reset DB: `docker compose down -v && docker compose up -d && cd server && npm run db:migrate`
- Reset client mock: DevTools → Application → Local Storage → clear, ou no console `localStorage.clear()`

---

## 4. Como o jogo funciona (gameplay loop)

```
[Boot] gera texturas procedurais
   ↓
[Preload] inicializa SaveSystem (cria guest se não houver)
   ↓
[Lobby] mostra avatar central, painéis (Inventário/Loja/Amigos/Settings),
        botão JOGAR no centro inferior. Aperte ENTER, SPACE ou clique.
   ↓
[World] área verde com:
        - rio na parte inferior + ponte de madeira no centro
        - penhasco no topo + escada no centro
        - árvores nas bordas + pedras espalhadas
        - flores decorativas
        - 8 moedas pra coletar
        - 1 placa interativa no centro
        Player se move com WASD ou setas.
        E pra interagir. ESC pra voltar ao lobby.
   ↓
[Hud] (paralelo à World) mostra:
        - corações de vida (canto inferior esquerdo)
        - moedas (canto superior direito)
        - prompt "[E] interagir" quando perto de objeto
        - dialog box ao interagir
        - "✓ salvo às HH:MM:SS" no canto inferior direito
   ↓
Atravessar a ponte → trigger de transição (próximo mapa é placeholder; volta ao lobby)
```

---

## 5. Onde mexer (mapa do código)

| Quero mudar... | Vai em... |
|---|---|
| Velocidade do player | `client/src/config/GameConfig.ts` (`PLAYER_SPEED`) |
| Cores / paleta | `client/src/config/GameConfig.ts` (`PALETTE`) |
| Tamanho do mapa | `client/src/config/GameConfig.ts` (`MAP_TILES_W/H`) |
| Layout do mundo (árvores, pedras, rio) | `client/src/scenes/WorldScene.ts` (`build*` methods) |
| Aparência dos sprites | `client/src/gen/AssetGenerator.ts` (até substituir por arte real) |
| HUD layout | `client/src/scenes/HudScene.ts` |
| Lobby (botões, layout) | `client/src/scenes/LobbyScene.ts` |
| Diálogos | `client/src/scenes/HudScene.ts` (`dialogFor`) |
| Schema do save | `shared/types/game.types.ts` (bumpe `CURRENT_SAVE_SCHEMA_VERSION` e adicione migração em `SaveSystem.migrate`) |
| Contratos de API | `shared/types/api.types.ts` |
| Adicionar nova cena | criar em `client/src/scenes/`, registrar em `client/src/main.ts` |
| Nova entidade interativa | criar em `client/src/entities/`, instanciar em `WorldScene.build*` |

---

## 6. Trocar arte procedural por hand-drawn real

1. Crie um spritesheet em Aseprite/Piskel ou compre um asset pack (ex: "Cozy People", "Sprout Lands").
2. Salve em `client/public/assets/sprites/`.
3. No `PreloadScene.preload()`, adicione:
   ```ts
   this.load.spritesheet('player', 'assets/sprites/player.png', { frameWidth: 16, frameHeight: 24 });
   this.load.image('tile-grass', 'assets/sprites/tile-grass.png');
   // etc.
   ```
4. Remova as chamadas correspondentes em `BootScene` (ou deixe `AssetGenerator.generateAll()` checando `this.scene.textures.exists(key)` antes — já faz).
5. Para tilemap real:
   ```ts
   this.load.tilemapTiledJSON('map_meadow', 'assets/tilemaps/meadow.json');
   this.load.image('tileset_world', 'assets/sprites/tileset_world.png');
   ```
   E em `WorldScene.create()`, troque a geração programática por:
   ```ts
   const map = this.make.tilemap({ key: 'map_meadow' });
   const tileset = map.addTilesetImage('world', 'tileset_world');
   const ground = map.createLayer('ground', tileset!, 0, 0);
   const props = map.createLayer('props', tileset!, 0, 0);
   props?.setCollisionByProperty({ collides: true });
   this.physics.add.collider(this.player, props!);
   ```

---

## 7. Troubleshooting

| Sintoma | Causa | Fix |
|---|---|---|
| Tela preta no boot | Erro JS antes da Phaser inicializar | DevTools → Console |
| "Cannot read property X of null" no mock | localStorage corrompido | `localStorage.clear()` |
| Texturas não aparecem | Chave de texture errada | Confirmar `key` em `AssetGenerator` vs `add.image('key', ...)` |
| Player anda na água/árvore | Body de colisão fora de posição | Verificar `setSize` + `setOffset` em `Player.ts` |
| Build falha com `Expected identifier` | `define` no vite.config com nome inválido | Já corrigido — só usar identifiers em `define` |
| `npm install` falha em alguma dep | Deps de versão futura | Confirmar Node 20+, deletar `node_modules` + `package-lock.json` e reinstalar |
| Câmera não segue | Bounds não setados | `cam.setBounds(0,0,MAP_W,MAP_H)` antes de `startFollow` |
| Save não persiste | localStorage quota | Limpar: `localStorage.removeItem('fp:mock:state:<id>')` |

---

## 8. Continuidade IA-a-IA

Se você é uma IA abrindo isto pela primeira vez, leia nesta ordem:
1. `DOCS/PROJECT_OVERVIEW.md` — visão geral, estado atual, stack
2. `DOCS/ARCHITECTURE.md` — decisões técnicas
3. `DOCS/SECURITY.md` — antes de tocar em auth/sessão/input/network
4. `DOCS/ROADMAP.md` — próximos milestones
5. Este `RUNBOOK.md` — como executar
6. `client/src/main.ts` → `BootScene` → `PreloadScene` → `LobbyScene` → `WorldScene` → `HudScene`

**Antes de mudar arquitetura, registre o motivo em `ARCHITECTURE.md`.**
**Antes de "completar" uma tarefa, rode `npx tsc --noEmit && npx vite build` no `client/`.**
