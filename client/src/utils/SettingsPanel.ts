import { settingsService } from '@/services/SettingsService';
import { soundManager } from '@/services/SoundManager';
import { overlayManager } from '@/utils/OverlayManager';

/**
 * SettingsPanel — controller do overlay #settings-modal.
 *
 * Bind de inputs ↔ SettingsService. Toda mudança chama settingsService.update(),
 * que persiste em cache + sincroniza backend (debounced) + notifica SoundManager.
 *
 * Singleton-style: chamar `settingsPanel.attach()` UMA vez no boot e depois
 * `open()` / `close()` quando o user clicar em CONFIGURAÇÕES.
 */
class SettingsPanel {
  private attached = false;
  private unsubscribe?: () => void;

  // Refs
  private modal!: HTMLElement;
  private closeBtn!: HTMLElement;
  private doneBtn!: HTMLElement;
  private tabs!: NodeListOf<HTMLElement>;
  private panes!: NodeListOf<HTMLElement>;
  private musicEnabled!: HTMLInputElement;
  private musicVolume!: HTMLInputElement;
  private soundEnabled!: HTMLInputElement;
  private soundVolume!: HTMLInputElement;
  private gameNotif!: HTMLInputElement;
  private chatTs!: HTMLInputElement;
  private autoSkip!: HTMLInputElement;
  private animations!: HTMLInputElement;

  attach(): void {
    if (this.attached) return;
    this.attached = true;

    this.modal = document.getElementById('settings-modal')!;
    this.closeBtn = document.getElementById('settings-close')!;
    this.doneBtn = document.getElementById('settings-done')!;
    this.tabs = document.querySelectorAll<HTMLElement>('.settings-tab');
    this.panes = document.querySelectorAll<HTMLElement>('.settings-pane');
    this.musicEnabled = document.getElementById('set-music-enabled') as HTMLInputElement;
    this.musicVolume = document.getElementById('set-music-volume') as HTMLInputElement;
    this.soundEnabled = document.getElementById('set-sound-enabled') as HTMLInputElement;
    this.soundVolume = document.getElementById('set-sound-volume') as HTMLInputElement;
    this.gameNotif = document.getElementById('set-game-notif') as HTMLInputElement;
    this.chatTs = document.getElementById('set-chat-ts') as HTMLInputElement;
    this.autoSkip = document.getElementById('set-auto-skip') as HTMLInputElement;
    this.animations = document.getElementById('set-animations') as HTMLInputElement;

    this.closeBtn.addEventListener('click', () => this.close());
    this.doneBtn.addEventListener('click', () => this.close());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    for (const tab of this.tabs) {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab ?? 'sounds'));
    }

    // Inputs → settingsService.update (apenas SFX feedback nas mudanças, não na inicialização)
    this.musicEnabled.addEventListener('change', () => {
      soundManager.unlock();
      soundManager.playSfx('click');
      settingsService.update({ musicEnabled: this.musicEnabled.checked });
    });
    this.musicVolume.addEventListener('input', () => {
      settingsService.update({ musicVolume: Number(this.musicVolume.value) / 100 });
    });
    this.soundEnabled.addEventListener('change', () => {
      soundManager.unlock();
      settingsService.update({ soundEnabled: this.soundEnabled.checked });
      if (this.soundEnabled.checked) soundManager.playSfx('click');
    });
    this.soundVolume.addEventListener('input', () => {
      settingsService.update({ soundVolume: Number(this.soundVolume.value) / 100 });
    });
    this.soundVolume.addEventListener('change', () => soundManager.playSfx('click'));
    this.gameNotif.addEventListener('change', () => {
      soundManager.playSfx('click');
      settingsService.update({ gameNotifications: this.gameNotif.checked });
    });
    this.chatTs.addEventListener('change', () => {
      soundManager.playSfx('click');
      settingsService.update({ showChatTimestamps: this.chatTs.checked });
    });
    this.autoSkip.addEventListener('change', () => {
      soundManager.playSfx('click');
      settingsService.update({ autoSkipVote: this.autoSkip.checked });
    });
    this.animations.addEventListener('change', () => {
      soundManager.playSfx('click');
      settingsService.update({ animationsEnabled: this.animations.checked });
    });

    // Settings → UI (reativo)
    this.unsubscribe = settingsService.subscribe((s) => {
      this.musicEnabled.checked = s.musicEnabled;
      this.musicVolume.value = String(Math.round(s.musicVolume * 100));
      this.soundEnabled.checked = s.soundEnabled;
      this.soundVolume.value = String(Math.round(s.soundVolume * 100));
      this.gameNotif.checked = s.gameNotifications;
      this.chatTs.checked = s.showChatTimestamps;
      this.autoSkip.checked = s.autoSkipVote;
      this.animations.checked = s.animationsEnabled;
    });
  }

  private switchTab(name: string): void {
    soundManager.playSfx('click');
    for (const t of this.tabs) t.classList.toggle('active', t.dataset.tab === name);
    for (const p of this.panes) p.classList.toggle('active', p.dataset.pane === name);
  }

  open(): void {
    if (!this.attached) this.attach();
    soundManager.unlock();
    soundManager.playSfx('slide');
    overlayManager.show('settings-modal');
  }

  close(): void {
    soundManager.playSfx('slide');
    overlayManager.hide('settings-modal');
  }

  detach(): void {
    if (this.unsubscribe) this.unsubscribe();
    this.attached = false;
  }
}

export const settingsPanel = new SettingsPanel();
