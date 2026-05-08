import { settingsService } from '@/services/SettingsService';
import { log } from '@/utils/Logger';

/**
 * SoundManager — singleton de áudio (HTML5 Audio nativo).
 *
 * Espelha o padrão do silence-project (sem Howler).
 * - Música: 1 track ativa por vez, fadeOut/fadeIn nas trocas
 * - SFX: múltiplas instâncias simultâneas (clona o Audio antes de tocar)
 * - Volume e mute reativos ao SettingsService
 * - Gate de autoplay: navegadores bloqueiam áudio sem interação do user;
 *   `unlock()` deve ser chamado em algum click/keydown antes da primeira play.
 */

type MusicKey = 'adventure' | 'chase' | 'forestwalk' | 'epic';
type SfxKey = 'click' | 'select' | 'slide' | 'turn' | 'tick';

const MUSIC_PATHS: Record<MusicKey, string> = {
  adventure: '/assets/audio/music/Adventure.mp3',
  chase: '/assets/audio/music/Chase.mp3',
  forestwalk: '/assets/audio/music/ForestWalk.mp3',
  epic: '/assets/audio/music/The_Epic.mp3',
};

const SFX_PATHS: Record<SfxKey, string> = {
  click: '/assets/audio/sfx/click-menu.mp3',
  select: '/assets/audio/sfx/menu-selection.mp3',
  slide: '/assets/audio/sfx/slide.mp3',
  turn: '/assets/audio/sfx/you_turn.mp3',
  tick: '/assets/audio/sfx/clock-ticking-time.mp3',
};

const FADE_MS = 600;

class SoundManager {
  private musicEl: HTMLAudioElement | null = null;
  private currentMusic: MusicKey | null = null;
  private sfxCache = new Map<SfxKey, HTMLAudioElement>();
  private unlocked = false;
  private fadeRaf: number | null = null;

  constructor() {
    settingsService.subscribe((state) => this.applySettings(state));
  }

  /** Marca que o user já interagiu — libera autoplay do browser. */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    log.info('SoundManager: unlocked (user interacted)');
    // Se já tinha música pedida, tenta tocar agora
    if (this.musicEl && this.musicEl.paused) {
      void this.musicEl.play().catch(() => {});
    }
  }

  // ============== MUSIC ==============
  playMusic(key: MusicKey, opts: { loop?: boolean; fade?: boolean } = {}): void {
    if (this.currentMusic === key && this.musicEl && !this.musicEl.paused) return;
    const settings = settingsService.get();
    if (!settings.musicEnabled) {
      // Mesmo desabilitado, registra qual track é a "atual" pra retomar depois
      this.currentMusic = key;
      return;
    }
    const fade = opts.fade ?? true;
    if (this.musicEl && fade) {
      this.fadeOutAndSwap(key, opts.loop ?? true);
    } else {
      this.swapMusic(key, opts.loop ?? true);
    }
  }

  stopMusic(fade = true): void {
    this.currentMusic = null;
    if (!this.musicEl) return;
    if (fade) {
      this.fadeOut(this.musicEl, () => {
        this.musicEl?.pause();
        this.musicEl = null;
      });
    } else {
      this.musicEl.pause();
      this.musicEl = null;
    }
  }

  // ============== SFX ==============
  playSfx(key: SfxKey, volumeMul = 1): void {
    const settings = settingsService.get();
    if (!settings.soundEnabled || settings.soundVolume <= 0) return;
    const base = this.getOrLoadSfx(key);
    if (!base) return;
    // Clona pra permitir overlap (cliques rápidos)
    const inst = base.cloneNode(true) as HTMLAudioElement;
    inst.volume = Math.min(1, Math.max(0, settings.soundVolume * volumeMul));
    void inst.play().catch((err) => log.warn('SoundManager: sfx play error', { key, err }));
  }

  // ============== INTERNALS ==============
  private getOrLoadSfx(key: SfxKey): HTMLAudioElement | null {
    let cached = this.sfxCache.get(key);
    if (!cached) {
      cached = new Audio(SFX_PATHS[key]);
      cached.preload = 'auto';
      this.sfxCache.set(key, cached);
    }
    return cached;
  }

  private swapMusic(key: MusicKey, loop: boolean): void {
    if (this.musicEl) {
      this.musicEl.pause();
    }
    const el = new Audio(MUSIC_PATHS[key]);
    el.loop = loop;
    el.volume = settingsService.get().musicVolume;
    this.musicEl = el;
    this.currentMusic = key;
    void el.play().catch((err) => {
      // Bloqueio de autoplay — vai destravar no primeiro click via unlock()
      log.info('SoundManager: music play blocked (waiting for user interaction)', { key, err: err.message });
    });
  }

  private fadeOutAndSwap(key: MusicKey, loop: boolean): void {
    const old = this.musicEl;
    if (!old) {
      this.swapMusic(key, loop);
      return;
    }
    this.fadeOut(old, () => {
      old.pause();
      this.swapMusic(key, loop);
    });
  }

  private fadeOut(el: HTMLAudioElement, onDone: () => void): void {
    if (this.fadeRaf) cancelAnimationFrame(this.fadeRaf);
    const startVol = el.volume;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / FADE_MS);
      el.volume = startVol * (1 - t);
      if (t < 1) {
        this.fadeRaf = requestAnimationFrame(tick);
      } else {
        this.fadeRaf = null;
        onDone();
      }
    };
    this.fadeRaf = requestAnimationFrame(tick);
  }

  /** Reage a mudanças de settings (volume / mute). */
  private applySettings(state: { musicEnabled: boolean; musicVolume: number; soundEnabled: boolean; soundVolume: number }): void {
    if (this.musicEl) {
      if (!state.musicEnabled) {
        this.musicEl.pause();
      } else {
        this.musicEl.volume = state.musicVolume;
        if (this.musicEl.paused && this.unlocked) {
          void this.musicEl.play().catch(() => {});
        }
      }
    } else if (state.musicEnabled && this.currentMusic) {
      // Música estava desligada, ligou agora — retoma a track salva
      this.swapMusic(this.currentMusic, true);
    }
  }
}

export const soundManager = new SoundManager();
export type { MusicKey, SfxKey };
