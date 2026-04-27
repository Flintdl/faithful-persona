#!/usr/bin/env node
/**
 * Faithful Persona — bootstrap pra primeira execução em uma máquina nova.
 *
 * O que faz:
 *  1. Verifica Node >= 20
 *  2. Instala deps em client/ e server/
 *  3. Gera server/.env.local com IRON_SESSION_PASSWORD random (se não existe)
 *  4. (opcional) sobe docker compose pra postgres+redis
 *  5. (opcional) roda migrations Drizzle
 *  6. Imprime próximos passos
 *
 * Uso:
 *   node scripts/bootstrap.mjs              # interativo (pergunta sobre docker)
 *   node scripts/bootstrap.mjs --no-docker  # pula docker (modo só-mock)
 *   node scripts/bootstrap.mjs --yes        # responde sim a tudo
 */
import { execSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLIENT = join(ROOT, 'client');
const SERVER = join(ROOT, 'server');

const args = process.argv.slice(2);
const NO_DOCKER = args.includes('--no-docker');
const AUTO_YES = args.includes('--yes') || args.includes('-y');

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', blue: '\x1b[34m', dim: '\x1b[2m',
};
const log = (msg) => console.log(`${c.blue}›${c.reset} ${msg}`);
const ok = (msg) => console.log(`${c.green}✓${c.reset} ${msg}`);
const warn = (msg) => console.log(`${c.yellow}!${c.reset} ${msg}`);
const fail = (msg) => { console.error(`${c.red}✗${c.reset} ${msg}`); process.exit(1); };

async function ask(q, def = 'y') {
  if (AUTO_YES) return def === 'y';
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${c.yellow}?${c.reset} ${q} [${def === 'y' ? 'Y/n' : 'y/N'}] `)).trim().toLowerCase();
  rl.close();
  if (!answer) return def === 'y';
  return answer.startsWith('y');
}

function run(cmd, cwd, opts = {}) {
  log(`${c.dim}$ ${cmd}${c.reset}`);
  const r = spawnSync(cmd, { cwd, shell: true, stdio: 'inherit', ...opts });
  if (r.status !== 0 && !opts.allowFail) fail(`comando falhou: ${cmd}`);
  return r;
}

function checkNode() {
  const v = process.versions.node.split('.').map(Number);
  if (v[0] < 20) fail(`Node ${process.versions.node} — precisa de >=20. Use nvm/asdf pra atualizar.`);
  ok(`Node ${process.versions.node}`);
}

function checkDocker() {
  try {
    execSync('docker --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function dockerWorks() {
  try {
    execSync('docker ps', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function installDeps() {
  log('instalando dependências do client…');
  run('npm install --no-audit --no-fund', CLIENT);
  ok('client deps instaladas');

  log('instalando dependências do server…');
  run('npm install --no-audit --no-fund', SERVER);
  ok('server deps instaladas');
}

function ensureServerEnv() {
  const envPath = join(SERVER, '.env.local');
  const examplePath = join(SERVER, '.env.example');
  if (existsSync(envPath)) {
    ok('server/.env.local já existe (mantido)');
    return;
  }
  if (!existsSync(examplePath)) fail('server/.env.example não encontrado');
  let content = readFileSync(examplePath, 'utf8');
  const secret = randomBytes(48).toString('base64');
  content = content.replace(/IRON_SESSION_PASSWORD=.*/m, `IRON_SESSION_PASSWORD=${secret}`);
  writeFileSync(envPath, content);
  ok(`server/.env.local criado com IRON_SESSION_PASSWORD random (48 bytes)`);
}

async function setupDocker() {
  if (NO_DOCKER) { warn('--no-docker → pulando Postgres/Redis (modo só-mock)'); return false; }
  if (!checkDocker()) { warn('docker não instalado → pulando (jogo roda em modo mock só)'); return false; }
  if (!dockerWorks()) {
    warn('docker instalado mas sem permissão (você não está no grupo docker).');
    warn('execute em outra shell:  sudo usermod -aG docker $USER && newgrp docker');
    return false;
  }
  if (!(await ask('subir Postgres+Redis via docker compose?'))) return false;

  run('docker compose up -d', ROOT);
  log('aguardando postgres healthy…');
  let tries = 0;
  while (tries++ < 30) {
    try {
      execSync('docker exec fp-postgres pg_isready -U fp_app -d faithful_persona', { stdio: 'pipe' });
      ok('postgres healthy');
      break;
    } catch {
      execSync('sleep 1');
    }
  }
  if (tries >= 30) fail('postgres não ficou healthy em 30s');

  if (await ask('rodar migrations Drizzle agora?')) {
    run('npm run db:migrate', SERVER);
    ok('migrations aplicadas');
  }
  return true;
}

function printNextSteps(dockerUp) {
  console.log('');
  console.log(`${c.bold}${c.green}✓ bootstrap concluído${c.reset}`);
  console.log('');
  console.log(`${c.bold}Próximos passos:${c.reset}`);
  console.log('');
  if (dockerUp) {
    console.log(`  ${c.bold}Backend (Fastify + Postgres):${c.reset}`);
    console.log(`    cd server && npm run dev    ${c.dim}# http://localhost:3000${c.reset}`);
    console.log('');
    console.log(`  ${c.bold}Client (com backend real):${c.reset}`);
    console.log(`    echo 'VITE_USE_MOCK_BACKEND=false' > client/.env.local`);
    console.log(`    cd client && npm run dev    ${c.dim}# http://localhost:5173${c.reset}`);
    console.log('');
    console.log(`  ${c.bold}Client (modo mock — não precisa do server):${c.reset}`);
    console.log(`    cd client && npm run dev`);
  } else {
    console.log(`  ${c.bold}Client (modo mock):${c.reset}`);
    console.log(`    cd client && npm run dev    ${c.dim}# http://localhost:5173${c.reset}`);
    console.log('');
    console.log(`  ${c.bold}Backend (quando quiser):${c.reset}`);
    console.log(`    docker compose up -d`);
    console.log(`    cd server && npm run db:migrate && npm run dev`);
  }
  console.log('');
  console.log(`${c.dim}Leia DOCS/PROJECT_OVERVIEW.md → ARCHITECTURE.md → SECURITY.md → RUNBOOK.md${c.reset}`);
}

// ===== main =====
console.log(`${c.bold}Faithful Persona — bootstrap${c.reset}`);
console.log('');
checkNode();
await installDeps();
ensureServerEnv();
const dockerUp = await setupDocker();
printNextSteps(dockerUp);
