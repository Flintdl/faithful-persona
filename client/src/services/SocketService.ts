import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL, STORAGE_TOKEN_KEY, STORAGE_USERNAME_KEY } from '@/config/GameConfig';
import type {
  AchievementsErrorEvent,
  AchievementsResult,
  AuthAuthenticatePayload,
  AuthAuthenticateResult,
  AuthLoginPayload,
  AuthLoginResult,
  AuthRegisterPayload,
  AuthRegisterResult,
  CharacterDataResult,
  CharacterErrorEvent,
  CharacterPayload,
  CharacterUpdatedEvent,
  GetMatchHistoryPayload,
  GetShopItemsPayload,
  GetUserStatsPayload,
  MatchHistoryResult,
  OwnedItemsResult,
  PurchaseItemPayload,
  SettingsGetResult,
  SettingsUpdatePayload,
  SettingsUpdateResult,
  ShopErrorEvent,
  ShopItemsResult,
  SilenceUser,
  StatsErrorEvent,
  UserBalanceResult,
  UserStatsResult,
} from '@/events/socket.events';
import { log } from '@/utils/Logger';

/**
 * SocketService — singleton TypeScript adaptado do silence-project.
 *
 * Regras herdadas:
 * - `connect()` é idempotente (não reconecta se já conectado/conectando)
 * - Token salvo em localStorage; auto-reauth ao reconectar
 * - `socket.userId` só existe APÓS `auth:authenticate` (server seta)
 *
 * Diferenças vs silence:
 * - TS strict
 * - Sem fila de eventos (MVP) — emite direto; adicionar se perda for problema
 * - Heartbeat/refresh ficam para iteração futura
 */
class SocketService {
  private socket: Socket | null = null;
  private connectingPromise: Promise<Socket> | null = null;
  private authToken: string | null = null;
  private currentUser: SilenceUser | null = null;

  constructor() {
    this.loadStoredToken();
  }

  /** Conecta ao backend. Idempotente. */
  async connect(): Promise<Socket> {
    if (this.socket?.connected) return this.socket;
    if (this.connectingPromise) return this.connectingPromise;

    log.info('SocketService: connecting', { url: SOCKET_URL });

    this.connectingPromise = new Promise<Socket>((resolve, reject) => {
      const sock = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        timeout: 10000,
      });

      const onConnect = () => {
        sock.off('connect_error', onError);
        this.socket = sock;
        this.connectingPromise = null;
        log.info('SocketService: connected', { id: sock.id });
        resolve(sock);
      };
      const onError = (err: Error) => {
        sock.off('connect', onConnect);
        this.connectingPromise = null;
        log.error('SocketService: connect error', { msg: err.message });
        reject(err);
      };

      sock.once('connect', onConnect);
      sock.once('connect_error', onError);

      sock.on('disconnect', (reason) => log.warn('SocketService: disconnected', { reason }));
      sock.io.on('reconnect', (attempt) => {
        log.info('SocketService: reconnected', { attempt });
        if (this.authToken) void this.reauthenticate();
      });
    });

    return this.connectingPromise;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connectingPromise = null;
  }

  isConnected(): boolean {
    return this.socket?.connected === true;
  }

  getSocket(): Socket {
    if (!this.socket) throw new Error('SocketService.getSocket: not connected (call connect first)');
    return this.socket;
  }

  emit<T = unknown>(event: string, data?: T): void {
    if (!this.socket?.connected) {
      log.warn('emit on disconnected socket', { event });
      return;
    }
    this.socket.emit(event, data);
  }

  on<T = unknown>(event: string, handler: (payload: T) => void): void {
    if (!this.socket) {
      log.warn('on() called before connect()', { event });
      return;
    }
    this.socket.on(event, handler as (...args: unknown[]) => void);
  }

  off<T = unknown>(event: string, handler?: (payload: T) => void): void {
    if (!this.socket) return;
    if (handler) this.socket.off(event, handler as (...args: unknown[]) => void);
    else this.socket.off(event);
  }

  // ============== AUTH HELPERS ==============

  async login(payload: AuthLoginPayload): Promise<AuthLoginResult> {
    await this.connect();
    return this.requestResponse<AuthLoginPayload, AuthLoginResult>('auth:login', payload, 'auth:login:result');
  }

  async register(payload: AuthRegisterPayload): Promise<AuthRegisterResult> {
    await this.connect();
    return this.requestResponse<AuthRegisterPayload, AuthRegisterResult>(
      'auth:register',
      payload,
      'auth:register:result',
    );
  }

  async authenticate(token: string): Promise<AuthAuthenticateResult> {
    await this.connect();
    const result = await this.requestResponse<AuthAuthenticatePayload, AuthAuthenticateResult>(
      'auth:authenticate',
      { token },
      'auth:authenticate:result',
    );
    if (result.success) {
      this.authToken = token;
      this.currentUser = result.user;
      this.persistToken(token, result.user.username);
    }
    return result;
  }

  /** Conveniência: faz login + authenticate sequencial. Retorna o user final. */
  async loginAndAuthenticate(payload: AuthLoginPayload): Promise<AuthLoginResult> {
    const loginRes = await this.login(payload);
    if (!loginRes.success) return loginRes;
    const authRes = await this.authenticate(loginRes.token);
    if (!authRes.success) {
      return { success: false, message: authRes.message };
    }
    return loginRes;
  }

  getCurrentUser(): SilenceUser | null {
    return this.currentUser;
  }

  getToken(): string | null {
    return this.authToken;
  }

  hasStoredToken(): boolean {
    return Boolean(this.authToken);
  }

  clearToken(): void {
    this.authToken = null;
    this.currentUser = null;
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_TOKEN_KEY);
      window.localStorage.removeItem(STORAGE_USERNAME_KEY);
    }
  }

  // ============== SETTINGS HELPERS ==============

  async getSettings(): Promise<SettingsGetResult> {
    await this.connect();
    return this.requestResponse<undefined, SettingsGetResult>('settings:get', undefined, 'settings:result');
  }

  async updateSettings(payload: SettingsUpdatePayload): Promise<SettingsUpdateResult> {
    await this.connect();
    return this.requestResponse<SettingsUpdatePayload, SettingsUpdateResult>(
      'settings:update',
      payload,
      'settings:update:result',
    );
  }

  // ============== CHARACTER HELPERS ==============
  // Backend não emite o updated em :result único — usa requestResponse com fallback de erro.

  async getCharacter(): Promise<CharacterDataResult> {
    await this.connect();
    // Backend emite ou {success:true, character} ou {success:false, message}
    type Ok = Extract<CharacterDataResult, { success: true }>;
    type Err = Extract<CharacterDataResult, { success: false }>;
    return this.requestResponseEither<undefined, Ok, Err>(
      'get_character',
      undefined,
      'character_data',
      'character_get_error',
      (errPayload) => ({ success: false as const, message: errPayload.message }),
    );
  }

  async updateCharacter(payload: CharacterPayload): Promise<CharacterUpdatedEvent | { success: false; message: string }> {
    await this.connect();
    return this.requestResponseEither<CharacterPayload, CharacterUpdatedEvent, { success: false; message: string }>(
      'update_character',
      payload,
      'character_updated',
      'character_update_error',
      (errPayload) => ({ success: false as const, message: errPayload.message }),
    );
  }

  // ============== STATS HELPERS ==============
  // Backend emite ou {stats} ou {error} no mesmo evento — checa via discriminator.

  async getUserStats(userId?: string): Promise<UserStatsResult> {
    await this.connect();
    return this.requestResponseEither<GetUserStatsPayload, UserStatsResult, UserStatsResult>(
      'get_user_stats',
      { userId },
      'user_stats',
      'user_stats_error',
      (errPayload: StatsErrorEvent) => ({ error: errPayload.message ?? errPayload.error ?? 'Erro desconhecido' }),
    );
  }

  async getMatchHistory(payload: GetMatchHistoryPayload = {}): Promise<MatchHistoryResult> {
    await this.connect();
    return this.requestResponseEither<GetMatchHistoryPayload, MatchHistoryResult, MatchHistoryResult>(
      'get_match_history',
      payload,
      'match_history',
      'match_history_error',
      (errPayload: StatsErrorEvent) => ({ error: errPayload.message ?? errPayload.error ?? 'Erro desconhecido' }),
    );
  }

  async getAchievements(): Promise<AchievementsResult | { error: string }> {
    await this.connect();
    return this.requestResponseEither<undefined, AchievementsResult, { error: string }, AchievementsErrorEvent>(
      'get_achievements',
      undefined,
      'achievements',
      'achievements_error',
      (errPayload) => ({ error: errPayload.message ?? 'Erro desconhecido' }),
    );
  }

  // ============== SHOP HELPERS ==============

  async getShopItems(category?: string): Promise<ShopItemsResult | { error: string }> {
    await this.connect();
    return this.requestResponseEither<GetShopItemsPayload, ShopItemsResult, { error: string }, ShopErrorEvent>(
      'get_shop_items',
      { category },
      'shop_items',
      'shop_items_error',
      (errPayload) => ({ error: errPayload.message ?? 'Erro desconhecido' }),
    );
  }

  async getUserBalance(): Promise<UserBalanceResult | { error: string }> {
    await this.connect();
    return this.requestResponseEither<undefined, UserBalanceResult, { error: string }, ShopErrorEvent>(
      'get_user_balance',
      undefined,
      'user_balance',
      'balance_error',
      (errPayload) => ({ error: errPayload.message ?? 'Erro desconhecido' }),
    );
  }

  /** Compra item — backend emite purchase_success ou purchase_error globalmente. */
  emitPurchase(itemId: string): void {
    const payload: PurchaseItemPayload = { itemId };
    this.emit('purchase_item', payload);
  }

  async getOwnedItems(): Promise<OwnedItemsResult | { error: string }> {
    await this.connect();
    return this.requestResponseEither<undefined, OwnedItemsResult, { error: string }, ShopErrorEvent>(
      'get_owned_items',
      undefined,
      'owned_items',
      'owned_items_error',
      (errPayload) => ({ error: errPayload.message ?? 'Erro desconhecido' }),
    );
  }

  // ============== INTERNALS ==============

  private async reauthenticate(): Promise<void> {
    if (!this.authToken) return;
    log.info('SocketService: reauthenticating after reconnect');
    const result = await this.authenticate(this.authToken);
    if (!result.success) {
      log.warn('reauth failed', { msg: result.message });
      this.clearToken();
    }
  }

  private loadStoredToken(): void {
    if (typeof window === 'undefined') return;
    const token = window.localStorage.getItem(STORAGE_TOKEN_KEY);
    if (token) this.authToken = token;
  }

  private persistToken(token: string, username: string): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_TOKEN_KEY, token);
    window.localStorage.setItem(STORAGE_USERNAME_KEY, username);
  }

  /** Helper: emite evento e aguarda resposta (com timeout). */
  private requestResponse<TReq, TRes>(
    eventOut: string,
    payload: TReq,
    eventIn: string,
    timeoutMs = 10000,
  ): Promise<TRes> {
    const sock = this.getSocket();
    return new Promise<TRes>((resolve, reject) => {
      const timer = setTimeout(() => {
        sock.off(eventIn, onResult);
        reject(new Error(`SocketService.${eventOut}: timeout`));
      }, timeoutMs);

      const onResult = (data: TRes) => {
        clearTimeout(timer);
        sock.off(eventIn, onResult);
        resolve(data);
      };

      sock.once(eventIn, onResult);
      sock.emit(eventOut, payload);
    });
  }

  /**
   * Helper: como requestResponse mas escuta DOIS eventos (success + error)
   * porque o CharacterHandler do backend emite eventos separados ao invés de
   * um único {success, ...}.
   */
  private requestResponseEither<TReq, TOk, TErr, TErrPayload = CharacterErrorEvent>(
    eventOut: string,
    payload: TReq,
    eventInOk: string,
    eventInErr: string,
    mapError: (err: TErrPayload) => TErr,
    timeoutMs = 10000,
  ): Promise<TOk | TErr> {
    const sock = this.getSocket();
    return new Promise<TOk | TErr>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        sock.off(eventInOk, onOk);
        sock.off(eventInErr, onErr);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`SocketService.${eventOut}: timeout`));
      }, timeoutMs);
      const onOk = (data: TOk) => {
        cleanup();
        resolve(data);
      };
      const onErr = (err: TErrPayload) => {
        cleanup();
        resolve(mapError(err));
      };
      sock.once(eventInOk, onOk);
      sock.once(eventInErr, onErr);
      sock.emit(eventOut, payload);
    });
  }
}

export const socketService = new SocketService();
