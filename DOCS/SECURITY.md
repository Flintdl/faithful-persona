# Faithful Persona — Security

> Aplicação do checklist mestre `Documentos/CONFIGURACOES_PROJETOS_AVANCADOS/security_instructions.md` ao contexto deste jogo.
> Releia antes de qualquer feature de auth, sessão, input, banco ou network.

---

## 1. Modelo de ameaça

| Ator | Capacidade | O que protege |
|---|---|---|
| Player malicioso (cheater) | Modifica client em runtime | Server-authoritative + validação de inputs |
| Bot/scraper | Cria contas em massa | Captcha em signup, rate limit, email verify |
| Atacante de rede | MITM, replay | TLS 1.3 obrigatório, HSTS, certificate validation |
| Insider (futuro time) | Acesso a banco | Least privilege, audit log, secrets em vault |
| Bug-hunter (white hat) | Reporta vulnerabilidade | `security.txt`, programa de disclosure |

**Não é alvo deste jogo**: APT, espionagem estatal, dados ultra-sensíveis (saúde, financeiro). Mas seguimos boas práticas porque escala muda o modelo.

---

## 2. Princípios aplicados

1. **Defense in depth** — client valida (UX), server valida (segurança), banco valida (constraint).
2. **Least privilege** — player não pode editar item de outro player; admin tem role separada.
3. **Fail secure** — erro de auth = nega. Erro de save = não corrompe state.
4. **Zero trust no cliente** — client é hostil por princípio. Toda regra de jogo crítica roda no server.
5. **Não inventar criptografia** — Argon2id pra senha, libsodium se precisar de payload encryption.
6. **Secure by default** — feature nova começa fechada, abre explicitamente com flag.

---

## 3. Auth (quando server real subir)

### Senhas
- **Argon2id** (`argon2` lib) com `memoryCost: 19456 KiB, timeCost: 2, parallelism: 1` (OWASP 2024).
- Mínimo 10 chars, validar contra HaveIBeenPwned (k-anonymity) — rejeitar senhas vazadas.
- Nunca log de senha, nem em erro, nem em request body capturado.

### Sessões
- **iron-session** (cookies opacos cifrados server-side, sem JWT pra session).
- Cookie: `HttpOnly`, `Secure`, `SameSite=Strict`, `__Host-fp_session=...`, `Path=/`.
- Idle timeout: 2h. Absolute: 8h.
- Rotaciona session ID no login (anti session-fixation).
- Logout destrói session no Redis, não só apaga cookie.

### MFA (futuro)
- TOTP via `otplib`.
- Backup codes hashed com Argon2id.
- WebAuthn/Passkey antes de qualquer monetização.

### Brute force
- `@fastify/rate-limit` com store Redis: 5 tentativas/15min por IP+email.
- Bloqueio progressivo (15min → 1h → exige MFA).
- Login responde em **tempo constante** (`crypto.timingSafeEqual` ou comparação dummy mesmo se user não existe).
- Cloudflare Turnstile no formulário após 3 falhas.

---

## 4. Autorização

- **RBAC** simples: `player`, `moderator`, `admin`. Server-side enforced.
- **Object-level**: `GET /players/:id/inventory` → middleware verifica `req.session.userId === playerId || isAdmin`.
- **Multi-character (futuro)**: query sempre `WHERE user_id = $session.userId AND id = $param`.
- **Sem confiar em `?admin=true`**, `req.body.role`, ou qualquer input do client pra autorização.

---

## 5. Input & validação

- **Zod schema** em **toda** rota. Compartilhado em `shared/types/`.
- Falha de schema → 400 com mensagem genérica (não vaze interno).
- Tamanhos máximos: nome de player 32, mensagem 500, save state 256 KB.
- Sanitização de texto user-generated (nome de player, mensagens):
  - Remove control chars, normaliza Unicode (NFC), rejeita zero-width chars.
  - Render só via `textContent` no HTML (no DOM do Lobby) — nunca `innerHTML`.
  - No canvas Phaser é seguro (não interpreta HTML), só limitar tamanho.
- **Sem regex perigoso** (ReDoS) — usa `safe-regex` no CI.

---

## 6. Server-authoritative (anti-cheat)

### Movimento
- Client envia **inputs** (`{ up: true, dt: 16 }`), não posição.
- Server simula movimento com a mesma física, valida velocidade máxima.
- Server faz broadcast da posição "verdadeira" com tick rate (ex.: 20 Hz).
- Client interpola entre updates, prediz localmente, reconcilia se divergir.

### Ações
- Coleta de moeda: server verifica que coin existe e está perto do player. Cliente não envia "ganhei N moedas".
- Compra: server verifica saldo, valida preço atual, log em `shop_transactions`.
- Dano: server calcula. Client só renderiza.

### Validações invariantes server-side
- `player.coins >= 0`
- `player.hp <= player.maxHp`
- `player.position` dentro do mapa carregado
- `player.inventory.length <= MAX_INVENTORY`

---

## 7. Headers HTTP (server)

```ts
// fastify-helmet config
{
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],                    // sem unsafe-inline
      styleSrc: ["'self'", "'unsafe-inline'"],  // CSS inline do Phaser
      imgSrc: ["'self'", "data:", "blob:"],     // texturas geradas
      connectSrc: ["'self'", "wss://*.fp.app"], // Colyseus
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permissionsPolicy: { features: { camera: ["'none'"], microphone: ["'none'"], geolocation: ["'none'"] } },
}
```

CORS restritivo: allowlist `https://faithfulpersona.app`, nunca `*` com credentials.

---

## 8. Database

- **Drizzle ORM** = parameterized queries 100% do tempo. Nunca string concat.
- App user no Postgres com `INSERT, SELECT, UPDATE` nas tabelas necessárias. **Sem** `DROP, CREATE, ALTER`.
- Read replica com user separado read-only pra dashboards/leaderboard.
- Backup automático diário, testado 1x/mês (backup não testado não existe).
- Migrations versionadas (`drizzle-kit`), nunca ALTER manual em prod.
- SSL obrigatório (`sslmode=require`).
- Pool com limite via pgbouncer.

---

## 9. Logs & auditoria

### Logue
- Login (sucesso/falha), logout, signup
- Mudança de email, senha, MFA
- Compras, transferências de moeda
- Ações admin (ban, refund)
- Falhas de autorização
- Erros 5xx

### NÃO logue
- Senha (mesmo hashed em request log — strip)
- Session token / cookie value
- Conteúdo de mensagens privadas (se entrar chat)
- Save state completo (muito grande, contém PII potencial)

### Formato
- **Pino** JSON: `{ ts, level, requestId, userId, action, ip, ua, ...metadata }`.
- Centraliza em ELK/Loki/Datadog (qual escolher na fase de prod).
- Retention: 90 dias forensics, 1 ano audit, 7 anos financeiro (se houver compras).

### Alertas
- 10+ falhas de login/min do mesmo IP
- Ação admin fora de horário
- 100+ saves/min (suspeita de bot)

---

## 10. Secrets

- **Nunca em código.** `.env` é git-ignored.
- `.env.example` versionado com placeholders.
- Em prod: AWS Secrets Manager / Doppler / 1Password Secrets.
- Rotação anual mínima (mensal pra críticos: DB, Redis).
- `gitleaks` no pre-commit + GitHub secret scanning.
- Se vazou, presume comprometido: rotaciona TUDO em <1h.

### Variáveis sensíveis deste projeto
| Var | Uso | Rotação |
|---|---|---|
| `DATABASE_URL` | Postgres | mensal |
| `REDIS_URL` | Redis | mensal |
| `IRON_SESSION_PASSWORD` | Cifra cookies | trimestral |
| `IRON_SESSION_PASSWORD_OLD` | Permite rotação sem invalidar sessões | rotaciona junto |
| `SENTRY_DSN` | Telemetria | anual |
| `S3_ACCESS_KEY_ID` / `S3_SECRET` | Storage | trimestral |

---

## 11. Dependências

- `pnpm-lock.yaml` commitado.
- `pnpm audit --audit-level=high` no CI bloqueia merge.
- Renovate/Dependabot semanal.
- Pinagem exata de deps de segurança (sem `^`): argon2, helmet, iron-session.
- `npm install --ignore-scripts` no CI (anti malicious postinstall).

---

## 12. Frontend específico

- **Sem `innerHTML`** com input do user. React/Vue não usados, mas se entrar UI HTML (settings page), `textContent` only.
- Phaser canvas é safe-by-design (não interpreta HTML/JS).
- **LocalStorage** só pra dados não-sensíveis (preferências UI). Save real → cookie HttpOnly + server.
- **Token de auth** nunca em LocalStorage. Sempre cookie.
- **Asset URLs** vêm do CDN próprio (não terceiros) — evita supply chain.
- **SRI** em scripts externos se houver (nenhum no MVP).

---

## 13. Compliance LGPD (preparado pra quando tiver users)

- Privacy policy clara em /privacy
- Consentimento explícito pra cookies não-essenciais (analytics, marketing — nenhum no MVP)
- Endpoint `DELETE /me` apaga conta + todos os dados (cascade), inclusive backup após retention
- Endpoint `GET /me/export` entrega tudo em JSON
- DPO designado quando passar de 1k usuários ativos
- Notificação de breach à ANPD em prazo razoável

---

## 14. Resposta a incidentes

1. **Detectar** — alerta dispara (Pino → SIEM).
2. **Conter** — revoga sessões afetadas, isola serviço comprometido.
3. **Erradicar** — fix do bug, rotação de secrets se aplicável.
4. **Recuperar** — restore de backup se necessário.
5. **Post-mortem blameless** — escrever em DOCS/incidents/YYYY-MM-DD.md.

---

## 15. Checklist pré-deploy de produção

- [ ] TLS 1.3 only, HSTS preload, A+ no SSL Labs
- [ ] Headers passam Mozilla Observatory ≥ A
- [ ] CSP avaliada no CSP Evaluator (sem `unsafe-inline` em script)
- [ ] `pnpm audit` limpo
- [ ] Secrets em vault, não em env do CI
- [ ] Backup testado em ambiente isolado
- [ ] Rate limit configurado em `/auth/*`
- [ ] Audit log gravando
- [ ] Sentry capturando erros
- [ ] `security.txt` em `/.well-known/security.txt`
- [ ] Privacy policy publicada
- [ ] Cookie banner se houver não-essenciais
- [ ] Pen test (interno mínimo) feito
