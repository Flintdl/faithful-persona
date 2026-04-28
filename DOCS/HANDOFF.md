# Handoff — leia primeiro

> Carta pra próxima sessão (humano ou IA) que abrir o projeto. Atualize sempre que terminar uma tanda de trabalho significativa.
>
> **Última atualização**: 2026-04-28 — fim da rodada "2º mapa real (forest)"

---

## 1. O que foi feito nesta rodada (multi-map)

**Sistema multi-mapa** + 2º mapa (Floresta). Validado tsc + build. **NÃO commitado ainda** — `git status` pra ver.

Arquivos novos:
- `client/public/assets/tilemaps/forest.json` — tilemap 20×14 64px gerado proceduralmente (mesma tileset Tiny Swords, layout sem lago, com 2 clareiras de dirt; spawns: player_spawn em (120,400), transition_meadow em borda esquerda, sign_forest)
- `client/src/config/maps.ts` — **registry MAPS** (centraliza definição de cada mapa: tilemap, props, mobs, transições, sign text, banner label, cor de fundo)

Arquivos modificados:
- `client/src/scenes/WorldScene.ts` — refatorado pra **multi-map**:
  - `init({ mapId? })`: aceita mapId via init data; fallback pro save; fallback pro DEFAULT
  - Lê tudo do `MAPS[mapId]`: tilemap, props, mobs, transições, sign
  - `tryTransition(to)` agora faz `scene.restart({ mapId: to })` em vez de voltar pro lobby
  - `respawnPlayer` usa `currentMapId` (respawna no mapa corrente, não hardcoded meadow)
  - `persistPosition` usa `currentMapId`
  - Banner emit em `camerafadeincomplete`: `emit('map:entered', { label })`
- `client/src/scenes/BootScene.ts` — loop sobre `MAPS` faz `load.tilemapTiledJSON` pra cada (dedup via Set)
- `client/src/scenes/HudScene.ts`:
  - Listener `'map:entered'` → `showMapBanner(label)` (fade in/out 2s top-center)
  - Listener `'interact:trigger'` agora prefere `payload.text` se vier; `dialogFor` virou fallback
- `client/src/utils/EventBus.ts` — adicionados `'map:entered': { mapId, label }` e `text?` em `'interact:trigger'`

Layout dos 2 mapas:
- **Pradaria** (`world_meadow`, 20×14): spawn (200,700) bottom-left, lago no centro-esquerdo, transição leste → forest, 3 slimes
- **Floresta** (`world_forest`, 20×14): spawn (120,400) left-center, denso de árvores nas 4 bordas (muralha), 2 clareiras de dirt, transição oeste → meadow, **4 slimes** (mais perigosa)

Loop validado:
1. Player vai pra leste na meadow → atravessa transição → fade out → restart com mapId=world_forest → fade in → banner "FLORESTA" 2s → mais 4 slimes esperando
2. Player vai pra oeste na forest → transição → restart meadow → banner "PRADARIA"
3. Save lembra mapa atual; reload do jogo cai no último visitado
4. Death em qualquer mapa → respawn no spawn DAQUELE mapa

---

## 2. Estado de cada peça (status rápido)

| Peça | Status | Onde está |
|---|---|---|
| Client core (Phaser scenes, entities) | ✅ funcional | `client/src/` |
| Player (movimento, attack, dano, i-frames) | ✅ funcional | `client/src/entities/Player.ts` |
| Slime (mob) | ✅ funcional | `client/src/entities/Mob.ts` |
| Combate end-to-end | ✅ funcional | WorldScene wirando tudo |
| Game over + respawn | ✅ funcional | `client/src/scenes/GameOverScene.ts` |
| Tilemap real (meadow + forest) | ✅ funcional | `client/public/assets/tilemaps/` |
| **Sistema multi-mapa** (registry + transitions reais) | ✅ funcional | `client/src/config/maps.ts` |
| Adventurer pack (player) | ✅ real | `client/public/assets/sprites/adventurer/` |
| Tiny Swords props (tree/bush/rock) | ✅ real | `client/public/assets/sprites/world/` |
| Slime arte | ❌ procedural | `gen/AssetGenerator.ts` `generateMob()` |
| UI hearts/coin/sign | ❌ procedural | mesmo arquivo |
| Áudio (BGM + SFX) | ❌ inexistente | adicionar em `client/public/assets/audio/` |
| Backend Fastify + Postgres + Redis | ✅ funcional, validado | `server/`, sobe com `docker compose up -d && cd server && npm run dev` |
| Multiplayer Colyseus | 🟡 esqueleto | `server/` deps presentes, código não escrito |
| 3º mapa (vilarejo) | ❌ falta | `MapId 'world_village'` existe mas hoje é alias de meadow no MAPS registry |

Detalhes completos em `PROJECT_OVERVIEW.md` seção 4 e `ASSETS.md` seção 0.

---

## 3. O que precisa do **outro PC** (onde tem ferramentas/assets)

Ações que o user precisa fazer manualmente lá (não tem como Claude fazer pelo terminal):
- **Baixar/desenhar arte real do slime** — substituir o procedural. Passo-a-passo concreto em `ASSETS.md` seção 2. Sugestão: `Mystic Woods` ou `Tiny RPG Forest` no itch.io (ambos free).
- **Adicionar áudio** — pasta `client/public/assets/audio/` não existe. BGM cozy (PixaBay) + SFX (Kenney CC0). Passo-a-passo em `ASSETS.md` seção 3.
- **(Opcional) Substituir hearts/coin/sign procedurais** por arte real — qualquer pack de UI cozy serve.

Nada disso bloqueia outras features — o jogo roda como está. Mas o áudio é o que mais eleva a percepção de "jogo de verdade" pelo custo.

---

## 4. Próximo passo recomendado

Multi-mapa + combate fechados. Próximos candidatos:

**A. NPC + quest simples (~2h)** ⭐ recomendado — agora que tem 2 mapas e combate, faltam **motivos pra explorar/lutar**. 1 NPC na clareira da floresta (ex.: posição (700,400) na clareira tile 12-14×9-11) que pede "mate 3 slimes da floresta", state em `saveSystem.flags`, listener de `mob:died` incrementa contador, HUD ganha widget "Quest: matar slimes (X/3)". Reward: 10 moedas + flag persistente. Reusa o DialogBox que já existe.

**B. Áudio (~1-2h)** — só na outra máquina (asset deps). Quando rodar lá, `ASSETS.md` seção 3 tem o passo-a-passo completo.

**C. 3º mapa (vilarejo) (~1-2h)** — agora que multi-map funciona, adicionar village.json é trivial. Mas só vale se tiver conteúdo (NPCs, shop) — fazer junto/depois de A.

**D. Backend integrado por padrão (~2h)** — UI de signup/login no Lobby, flippar `VITE_USE_MOCK_BACKEND=false`. Importante antes de multiplayer.

**E. Substituir slime placeholder por arte real (~30min, requer outra máquina pra baixar)** — `ASSETS.md` seção 2 tem o swap step-by-step.

---

## 5. Como retomar

```bash
cd /caminho/para/faithful-persona
git status                    # ver as mudanças não commitadas (rodada combate)
git log --oneline -5          # ver histórico

cd client && npm run dev      # http://localhost:5173 — modo mock
# (opcional) backend real:
cd .. && docker compose up -d && cd server && npm run dev
```

Pra cada nova feature:
1. Ler `ARCHITECTURE.md` antes de inventar abordagem
2. Antes de tocar auth/sessão/input/network, reler `SECURITY.md`
3. Antes de declarar pronto: `npx tsc --noEmit && npx vite build` no `client/`
4. Atualizar este `HANDOFF.md` com o que mudou

---

## 6. Decisões técnicas que valem lembrar

- **Sem `state` como nome de propriedade em classes que herdam de Phaser GameObject** — conflita. Usar `aiState`, `gameState`, etc.
- **Hooks Fastify v5 são encapsulados por register()** — quando precisa que o hook se aplique a sibling routes, chame inline (`await sessionPlugin(app)`) ou wrap com `fastify-plugin`.
- **EventBus é a forma canônica de comunicação inter-cenas** — não usar `scene.get('X').foo()`. Player não conhece WorldScene; emite `player:attack` e quem quiser escuta.
- **Server-authoritative**: toda regra de combate/economia idealmente roda no server. Hoje o cliente faz `mob.takeDamage` direto. Quando rolar multiplayer, mover pra Colyseus room.
- **Asset keys são contrato**: AssetGenerator gera com mesmas keys que assets reais carregam (`mob-slime`, `slime-idle`, etc.). Trocar pra real é só carregar antes — `if (textures.exists) return` já garante.
- **Adicionar mapa novo é registry + JSON**: criar `mapNNN.json` em `public/assets/tilemaps/`, adicionar entry em `client/src/config/maps.ts` `MAPS`. BootScene faz preload em loop, WorldScene resolve via `init({ mapId })`. **Não precisa tocar em mais nada** se for layout puro com mesmos tiles.
- **`scene.restart(data)` é o caminho pra trocar de mapa** — `init` re-roda com o data novo, `shutdown` limpa listeners do EventBus. Usar `scene.start('World', data)` faz a mesma coisa mas é menos direto quando você JÁ está nessa cena.
- **Eventos com payload extensível**: ao mudar shape de evento existente (ex.: `interact:trigger` ganhou `text?`), prefira **adicionar campos opcionais** ao invés de quebrar. Se precisar quebrar, atualizar todos os emitters E listeners de uma vez.
