import type { PlayerState } from '@shared/types/game.types';
import {
  CURRENT_SAVE_SCHEMA_VERSION,
  DEFAULT_PLAYER_STATE,
} from '@shared/types/game.types';
import { AUTOSAVE_DEBOUNCE_MS } from '@/config/GameConfig';
import { api } from '@/services';
import { emit, on } from '@/utils/EventBus';
import { log } from '@/utils/Logger';

const logger = log.child('save');

/**
 * SaveSystem — gerencia o estado do player e persiste com debounce.
 * Singleton. Inicializado no PreloadScene.
 */
class SaveSystem {
  private state: PlayerState | null = null;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;

  async init(): Promise<PlayerState> {
    let session = await api.me();

    // No MVP, "auto-login" anônimo: cria conta mock se não existir.
    // Em produção real, isso vira tela de login obrigatória.
    if (!session) {
      const guestEmail = `guest-${crypto.randomUUID()}@local.fp`;
      const guestPwd = crypto.randomUUID();
      session = await api.signup({
        email: guestEmail,
        password: guestPwd,
        name: 'Wanderer',
      });
      logger.info('auto-created guest account', { userId: session.userId });
    }

    const remote = await api.getSave();
    let state = remote.state;

    if (!state) {
      state = DEFAULT_PLAYER_STATE(session.userId, 'Wanderer');
      await api.putSave({ state });
      logger.info('initialized default save');
    } else {
      state = this.migrate(state);
    }

    this.state = state;
    on('state:dirty', () => this.markDirty());
    return state;
  }

  get(): PlayerState {
    if (!this.state) throw new Error('SaveSystem.get: not initialized');
    return this.state;
  }

  /** Atualiza parcialmente. Marca dirty pra autosave. */
  update(patch: Partial<PlayerState>): void {
    if (!this.state) return;
    this.state = { ...this.state, ...patch, updatedAt: new Date().toISOString() };
    this.markDirty();
  }

  /** Marca como modificado e agenda autosave. */
  markDirty(): void {
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), AUTOSAVE_DEBOUNCE_MS);
  }

  /** Persiste imediatamente. */
  async flush(): Promise<void> {
    if (!this.state || !this.dirty || this.inFlight) return;
    this.inFlight = true;
    try {
      const res = await api.putSave({ state: this.state });
      if (res.ok) {
        this.dirty = false;
        emit('state:saved', { at: res.updatedAt });
        logger.debug('save flushed', { at: res.updatedAt });
      } else {
        logger.warn('save rejected', { reason: res.reason });
      }
    } catch (err) {
      logger.error('save failed', { err });
    } finally {
      this.inFlight = false;
    }
  }

  private migrate(state: PlayerState): PlayerState {
    if (state.schemaVersion === CURRENT_SAVE_SCHEMA_VERSION) return state;
    // adicionar migrações conforme bumpar schemaVersion
    logger.warn('schema mismatch, resetting to defaults', {
      from: state.schemaVersion,
      to: CURRENT_SAVE_SCHEMA_VERSION,
    });
    return { ...state, schemaVersion: CURRENT_SAVE_SCHEMA_VERSION };
  }
}

export const saveSystem = new SaveSystem();
