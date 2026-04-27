import { z } from 'zod';
import type {
  ApiClient,
  AuthSession,
  LoginRequest,
  SaveGetResponse,
  SavePutRequest,
  SavePutResponse,
  SignupRequest,
} from '@shared/types/api.types';
import {
  CURRENT_SAVE_SCHEMA_VERSION,
  DEFAULT_PLAYER_STATE,
  type PlayerState,
} from '@shared/types/game.types';
import { Logger } from '@/utils/Logger';

const logger = new Logger('mock-api');

// Schemas Zod pra validar entrada (mesmo no mock — exercita o pipeline real)
const SignupSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(10).max(128),
  name: z.string().min(2).max(32).regex(/^[\p{L}\p{N}\s_-]+$/u),
});

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

const PlayerStateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  level: z.number().int().min(1),
  hp: z.number().min(0),
  maxHp: z.number().min(1),
  coins: z.number().int().min(0),
  position: z.object({
    mapId: z.enum(['world_meadow', 'world_forest', 'world_village']),
    x: z.number(),
    y: z.number(),
    facing: z.enum(['up', 'down', 'left', 'right']),
  }),
  inventory: z.array(z.object({ type: z.string(), qty: z.number().int().min(0) })),
  flags: z.record(z.string(), z.boolean()),
  updatedAt: z.string(),
  schemaVersion: z.number().int(),
});

const STORAGE_KEYS = {
  session: 'fp:mock:session',
  state: 'fp:mock:state',
  users: 'fp:mock:users',
} as const;

type MockUser = {
  id: string;
  email: string;
  name: string;
  // Em mock guardamos a senha em texto pra simplicidade — em prod NUNCA. Argon2id.
  password: string;
  createdAt: string;
};

const NETWORK_DELAY_MS = 80; // simula latência

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const uuid = (): string => {
  // crypto.randomUUID disponível em browsers modernos + Node 19+
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // fallback determinístico-ish
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

function loadJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn('failed to parse storage', { key, err });
    return null;
  }
}

function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    logger.error('failed to write storage', { key, err });
  }
}

export class MockApiClient implements ApiClient {
  private getUsers(): MockUser[] {
    return loadJSON<MockUser[]>(STORAGE_KEYS.users) ?? [];
  }

  private setUsers(users: MockUser[]): void {
    saveJSON(STORAGE_KEYS.users, users);
  }

  async signup(req: SignupRequest): Promise<AuthSession> {
    await sleep(NETWORK_DELAY_MS);
    const parsed = SignupSchema.safeParse(req);
    if (!parsed.success) throw new Error('VALIDATION:invalid signup payload');

    const users = this.getUsers();
    if (users.some((u) => u.email.toLowerCase() === parsed.data.email.toLowerCase())) {
      throw new Error('AUTH_INVALID:email already used');
    }

    const user: MockUser = {
      id: uuid(),
      email: parsed.data.email,
      name: parsed.data.name,
      password: parsed.data.password, // SÓ NO MOCK
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    this.setUsers(users);

    const session: AuthSession = {
      userId: user.id,
      email: user.email,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString(),
    };
    saveJSON(STORAGE_KEYS.session, session);

    // cria save inicial
    const initialState = DEFAULT_PLAYER_STATE(user.id, user.name);
    saveJSON(`${STORAGE_KEYS.state}:${user.id}`, initialState);

    logger.info('signup ok', { userId: user.id, email: user.email });
    return session;
  }

  async login(req: LoginRequest): Promise<AuthSession> {
    await sleep(NETWORK_DELAY_MS);
    const parsed = LoginSchema.safeParse(req);
    if (!parsed.success) throw new Error('VALIDATION:invalid login payload');

    const users = this.getUsers();
    const user = users.find((u) => u.email.toLowerCase() === parsed.data.email.toLowerCase());
    // resposta em tempo constante — sempre faz uma "comparação"
    const ok = user ? user.password === parsed.data.password : false;
    if (!ok || !user) throw new Error('AUTH_INVALID:credentials');

    const session: AuthSession = {
      userId: user.id,
      email: user.email,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString(),
    };
    saveJSON(STORAGE_KEYS.session, session);
    logger.info('login ok', { userId: user.id });
    return session;
  }

  async logout(): Promise<void> {
    await sleep(NETWORK_DELAY_MS / 2);
    localStorage.removeItem(STORAGE_KEYS.session);
  }

  async me(): Promise<AuthSession | null> {
    const session = loadJSON<AuthSession>(STORAGE_KEYS.session);
    if (!session) return null;
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      localStorage.removeItem(STORAGE_KEYS.session);
      return null;
    }
    return session;
  }

  async getSave(): Promise<SaveGetResponse> {
    const session = await this.me();
    if (!session) return { state: null };
    const raw = loadJSON<unknown>(`${STORAGE_KEYS.state}:${session.userId}`);
    if (!raw) return { state: null };
    const parsed = PlayerStateSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn('save corrupted, returning null', { userId: session.userId });
      return { state: null };
    }
    return { state: parsed.data as PlayerState };
  }

  async putSave(req: SavePutRequest): Promise<SavePutResponse> {
    const session = await this.me();
    if (!session) return { ok: false, reason: 'NOT_AUTHENTICATED' };
    if (req.state.id !== session.userId)
      return { ok: false, reason: 'AUTHZ:state.id mismatch session.userId' };
    const parsed = PlayerStateSchema.safeParse(req.state);
    if (!parsed.success) return { ok: false, reason: 'VALIDATION' };

    // server-authoritative checks (até no mock exercitamos isso)
    const s = parsed.data;
    if (s.hp > s.maxHp) return { ok: false, reason: 'INVARIANT:hp>maxHp' };
    if (s.coins < 0) return { ok: false, reason: 'INVARIANT:coins<0' };
    if (s.schemaVersion !== CURRENT_SAVE_SCHEMA_VERSION)
      return { ok: false, reason: 'SCHEMA_MISMATCH' };

    const updatedAt = new Date().toISOString();
    const toSave: PlayerState = { ...(s as PlayerState), updatedAt };
    saveJSON(`${STORAGE_KEYS.state}:${session.userId}`, toSave);
    return { ok: true, updatedAt };
  }
}
