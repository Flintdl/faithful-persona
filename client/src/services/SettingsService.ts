import type { SettingsState, SettingsUpdatePayload } from '@/events/socket.events';
import { socketService } from '@/services/SocketService';
import { log } from '@/utils/Logger';

const STORAGE_KEY = 'fp:settings';
const SYNC_DEBOUNCE_MS = 500;

const DEFAULTS: SettingsState = {
  soundEnabled: true,
  musicEnabled: true,
  soundVolume: 0.6,
  musicVolume: 0.4,
  bgLobby: 1,
  showChatTimestamps: true,
  gameNotifications: true,
  autoSkipVote: false,
  animationsEnabled: true,
};

type Listener = (state: SettingsState) => void;

/**
 * SettingsService — singleton com source of truth das settings do user.
 *
 * Fluxo:
 * 1. `loadFromCache()` no boot — usa localStorage pra ter algo até o backend responder
 * 2. `loadFromServer()` após auth — pega valores oficiais do backend e mescla
 * 3. `update(partial)` — atualiza local, persiste cache, sincroniza backend (debounce 500ms)
 * 4. `subscribe(listener)` — UI/SoundManager reagem a mudanças
 *
 * Espelha o padrão do silence-project (Zustand `persist` + emit `settings:update` debounced).
 */
class SettingsService {
  private state: SettingsState = { ...DEFAULTS };
  private listeners = new Set<Listener>();
  private pendingUpdate: SettingsUpdatePayload = {};
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private loadedFromServer = false;

  constructor() {
    this.loadFromCache();
  }

  // ============== PUBLIC API ==============
  get(): Readonly<SettingsState> {
    return this.state;
  }

  /** Atualização parcial: aplica local, notifica listeners, agenda sync com backend. */
  update(partial: SettingsUpdatePayload): void {
    let changed = false;
    const next: SettingsState = { ...this.state };
    for (const k of Object.keys(partial) as Array<keyof SettingsState>) {
      const v = partial[k];
      if (v === undefined) continue;
      if ((next[k] as unknown) !== v) {
        // type-safe assign — backend valida tipos, frontend confia
        (next[k] as unknown) = v;
        (this.pendingUpdate[k] as unknown) = v;
        changed = true;
      }
    }
    if (!changed) return;
    this.state = next;
    this.persistToCache();
    this.notify();
    this.scheduleSync();
  }

  /** Carrega settings do servidor (chamar após auth). Mescla com cache. */
  async loadFromServer(): Promise<void> {
    try {
      const res = await socketService.getSettings();
      if (!res.success) {
        log.warn('SettingsService: server load failed', { msg: res.message });
        return;
      }
      // Mescla — backend é source of truth pros campos que conhece, defaults pro resto
      this.state = { ...DEFAULTS, ...res.settings };
      this.loadedFromServer = true;
      this.persistToCache();
      this.notify();
      log.info('SettingsService: loaded from server', { state: this.state });
    } catch (err) {
      log.warn('SettingsService: loadFromServer error', { err });
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    // Dispara imediatamente com estado atual pra inicializar UI
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  isLoadedFromServer(): boolean {
    return this.loadedFromServer;
  }

  // ============== INTERNALS ==============
  private loadFromCache(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SettingsState>;
      this.state = { ...DEFAULTS, ...parsed };
    } catch (err) {
      log.warn('SettingsService: cache parse error', { err });
    }
  }

  private persistToCache(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (err) {
      log.warn('SettingsService: cache persist error', { err });
    }
  }

  private notify(): void {
    for (const l of this.listeners) l(this.state);
  }

  private scheduleSync(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      void this.flushSync();
    }, SYNC_DEBOUNCE_MS);
  }

  private async flushSync(): Promise<void> {
    const payload = this.pendingUpdate;
    this.pendingUpdate = {};
    if (Object.keys(payload).length === 0) return;
    try {
      const res = await socketService.updateSettings(payload);
      if (!res.success) log.warn('SettingsService: server rejected update', { msg: res.message });
    } catch (err) {
      log.warn('SettingsService: sync error', { err });
    }
  }
}

export const settingsService = new SettingsService();
