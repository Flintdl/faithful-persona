// Contratos de API compartilhados client ↔ server.
// Use Zod nos dois lados pra runtime validation (em shared/schemas/ futuro).

import type { PlayerState } from './game.types.js';

// ===== Auth =====
export type SignupRequest = { email: string; password: string; name: string };
export type LoginRequest = { email: string; password: string };

export type AuthSession = {
  userId: string;
  email: string;
  expiresAt: string;
};

// ===== Save =====
export type SaveGetResponse = { state: PlayerState | null };
export type SavePutRequest = { state: PlayerState };
export type SavePutResponse = { ok: true; updatedAt: string } | { ok: false; reason: string };

// ===== Shop (futuro) =====
export type ShopItem = {
  id: string;
  type: string;
  name: string;
  price: number;
  stock: number;
};
export type ShopListResponse = { items: ShopItem[] };
export type ShopBuyRequest = { itemId: string; qty: number };
export type ShopBuyResponse = { ok: true; newBalance: number } | { ok: false; reason: string };

// ===== Erros padronizados =====
export type ApiError = {
  code: string; // 'AUTH_INVALID' | 'RATE_LIMITED' | 'VALIDATION' | 'NOT_FOUND' | 'INTERNAL'
  message: string;
};

// ===== Interface única do client =====
export interface ApiClient {
  // auth
  signup(req: SignupRequest): Promise<AuthSession>;
  login(req: LoginRequest): Promise<AuthSession>;
  logout(): Promise<void>;
  me(): Promise<AuthSession | null>;

  // save
  getSave(): Promise<SaveGetResponse>;
  putSave(req: SavePutRequest): Promise<SavePutResponse>;
}
