# Faithful Persona — Roadmap

> MVP → produção → escala. Atualize ao concluir milestones.

---

## Milestone 0 — Fundação (✅ concluído em 2026-04-27)
- [x] Decisões de stack documentadas
- [x] Estrutura monorepo
- [x] Documentação MD completa
- [x] Setup Vite + TS + Phaser
- [x] BootScene + PreloadScene
- [x] LobbyScene jogável
- [x] WorldScene com mapa, player, colisão, câmera
- [x] HUD (vida + moedas)
- [x] Coleta de moedas + interação E
- [x] SaveSystem mockado
- [x] Esqueleto server (não roda, mas estrutura pronta)

---

## Milestone 1 — Polish do MVP (próximo)
- [ ] Substituir placeholders procedurais por arte hand-drawn (Aseprite ou compra de asset pack tipo "Cozy People" / "Sprout Lands")
- [ ] Tilemap real exportado do Tiled (substitui o programático)
- [ ] Áudio: música ambiente + SFX (passos, coleta, interação)
- [ ] 1-2 NPCs com diálogo simples (DialogBox + dialog tree em JSON)
- [ ] 3 mapas conectados (área inicial, vilarejo, floresta)
- [ ] Settings (volume, controles)
- [ ] Save slots (3 slots, mockado)
- [ ] Tela de game over + respawn
- [ ] Mobile touch controls (joystick virtual)

**Critério de aceitação**: jogador consegue jogar 10 minutos sem bugs, sem placeholders visíveis.

---

## Milestone 2 — Backend real
- [ ] Subir docker-compose (Postgres + Redis)
- [ ] Rodar migrations Drizzle
- [ ] Endpoints `/auth/signup`, `/login`, `/logout`, `/me`
- [ ] Endpoint `/save` (GET/PUT) — substitui MockApiClient
- [ ] iron-session funcional
- [ ] Argon2id no signup
- [ ] Rate limit em login (@fastify/rate-limit + Redis)
- [ ] Helmet + CSP rigoroso
- [ ] Audit log de auth events
- [ ] Tests integração (Vitest + supertest no Fastify)

**Critério**: signup/login funciona, save persiste em Postgres, sessão sobrevive a reload.

---

## Milestone 3 — Multiplayer (Colyseus)
- [ ] WorldRoom Colyseus
- [ ] State sync de players no mesmo mapa
- [ ] Movimento server-authoritative (client envia input, server simula)
- [ ] Reconciliação client-side (lag compensation simples)
- [ ] Chat de texto in-game (com sanitização e rate limit)
- [ ] Lista de "amigos" no Lobby
- [ ] Convite pra mesma sala

**Critério**: 4 players na mesma área, vendo movimento um do outro com latência <100ms LAN.

---

## Milestone 4 — Conteúdo & sistemas
- [ ] Quests (sistema de objetivos com triggers)
- [ ] Inventário expandido (drag&drop, equipamentos)
- [ ] Combate básico (arma, dano, hitbox)
- [ ] Mobs (IA simples: idle, perseguir, atacar)
- [ ] Loot drops
- [ ] Shop NPC com transações
- [ ] Sistema de níveis e XP
- [ ] Crafting básico

---

## Milestone 5 — Escala & qualidade
- [ ] Observabilidade: OpenTelemetry traces, Sentry no client+server
- [ ] CI/CD completo: deploy automático no merge pra main
- [ ] CDN pros assets (R2/CloudFront)
- [ ] Sticky sessions ou Redis pub/sub pra escalar Colyseus horizontal
- [ ] Postgres com read replica
- [ ] Backup automatizado + DR plan
- [ ] Bug bounty (HackerOne) se passar de 1k usuários
- [ ] Pen test antes de monetização
- [ ] Compliance LGPD (privacy policy, consentimento, export, deleção de conta)

---

## Milestone 6 — Comunidade & mods
- [ ] Editor de tilemap embutido (ou só docs pra usar Tiled)
- [ ] Steam Workshop-style: usuários compartilham mapas
- [ ] Mod API (eventos expostos, sandboxed)
- [ ] Discord SDK integration

---

## Não-objetivos (por enquanto)
- Real money / loot boxes — fora de escopo, e exige compliance pesado.
- 3D — vai contra o pilar "cozy 2D hand-drawn".
- VR — irrelevante pro gênero.
- Chat por voz — complexidade alta, baixo retorno no MVP.
