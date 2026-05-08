import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE } from '@/config/GameConfig';
import { characterService } from '@/services/CharacterService';
import { friendsService } from '@/services/FriendsService';
import { settingsService } from '@/services/SettingsService';
import { shopService } from '@/services/ShopService';
import { socketService } from '@/services/SocketService';
import { soundManager } from '@/services/SoundManager';
import { overlayManager } from '@/utils/OverlayManager';
import { log } from '@/utils/Logger';

type AuthMode = 'login' | 'register';

/**
 * LoginScene — fundo Phaser + overlay HTML para o formulário.
 *
 * Por que HTML em vez de Phaser DOMElement: melhor UX (autocomplete real, validação nativa,
 * acessibilidade, mobile keyboard correto), código mais simples. O canvas Phaser fica como
 * fundo decorativo (logo + avatar idle) atrás do overlay translúcido.
 */
export class LoginScene extends Phaser.Scene {
  private overlay!: HTMLElement;
  private form!: HTMLFormElement;
  private usernameInput!: HTMLInputElement;
  private emailRow!: HTMLElement;
  private emailInput!: HTMLInputElement;
  private passwordInput!: HTMLInputElement;
  private submitButton!: HTMLButtonElement;
  private errorBox!: HTMLElement;
  private switchLink!: HTMLElement;
  private switchPrompt!: HTMLElement;
  private subtitle!: HTMLElement;

  private mode: AuthMode = 'login';
  private busy = false;
  private submitHandler?: (e: Event) => void;
  private switchHandler?: (e: Event) => void;

  constructor() {
    super('Login');
  }

  create(): void {
    // Login = HTML puro. Canvas Phaser fica escondido pra evitar resíduos visuais.
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    overlayManager.hideCanvas();

    this.bindOverlay();
    this.applyMode('login');
    overlayManager.setWorldBg('/assets/bg/login_bg.png');
    overlayManager.showOnly('login-overlay');
    this.usernameInput.focus();

    void socketService.connect().catch((err) => {
      this.showError(`Não foi possível conectar ao servidor: ${err.message}`);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.tearDownOverlay());
  }

  // ============== BACKDROP ==============
  private drawBackdrop(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // Vinheta sutil
    const g = this.add.graphics();
    g.fillStyle(PALETTE.bgMid, 0.6);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Estrelas estáticas
    const stars = this.add.graphics();
    stars.fillStyle(0xfff5d0, 0.18);
    for (let i = 0; i < 60; i++) {
      stars.fillRect(Math.random() * GAME_WIDTH, Math.random() * GAME_HEIGHT, 1, 1);
    }

    // Avatar idle decorativo
    if (this.textures.exists('player-idle-down')) {
      const avatar = this.add.sprite(cx, cy + 90, 'player-idle-down', 0).setScale(2);
      avatar.anims.play('player-idle-down');
      this.tweens.add({
        targets: avatar,
        y: cy + 86,
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    this.add
      .text(cx, 60, 'FAITHFUL PERSONA', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#d4a017',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 86, 'cliente 2D — Silence Project', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#8a8aa6',
      })
      .setOrigin(0.5);
  }

  // ============== HTML OVERLAY ==============
  private bindOverlay(): void {
    this.overlay = document.getElementById('login-overlay')!;
    this.form = document.getElementById('auth-form') as HTMLFormElement;
    this.usernameInput = document.getElementById('auth-username') as HTMLInputElement;
    this.emailRow = document.getElementById('auth-email-row')!;
    this.emailInput = document.getElementById('auth-email') as HTMLInputElement;
    this.passwordInput = document.getElementById('auth-password') as HTMLInputElement;
    this.submitButton = document.getElementById('auth-submit') as HTMLButtonElement;
    this.errorBox = document.getElementById('auth-error')!;
    this.switchLink = document.getElementById('auth-switch-link')!;
    this.switchPrompt = document.getElementById('auth-switch-prompt')!;
    this.subtitle = document.getElementById('auth-subtitle')!;

    this.submitHandler = (e: Event) => {
      e.preventDefault();
      void this.handleSubmit();
    };
    this.switchHandler = (e: Event) => {
      e.preventDefault();
      this.applyMode(this.mode === 'login' ? 'register' : 'login');
    };

    this.form.addEventListener('submit', this.submitHandler);
    this.switchLink.addEventListener('click', this.switchHandler);
  }

  private tearDownOverlay(): void {
    overlayManager.hide('login-overlay');
    if (this.submitHandler) this.form.removeEventListener('submit', this.submitHandler);
    if (this.switchHandler) this.switchLink.removeEventListener('click', this.switchHandler);
  }

  private applyMode(mode: AuthMode): void {
    this.mode = mode;
    this.clearError();
    if (mode === 'login') {
      this.subtitle.textContent = 'Entrar na sua conta';
      this.submitButton.textContent = 'ENTRAR';
      this.emailRow.style.display = 'none';
      this.passwordInput.autocomplete = 'current-password';
      this.switchPrompt.textContent = 'Não tem conta?';
      this.switchLink.textContent = 'Cadastrar';
    } else {
      this.subtitle.textContent = 'Criar nova conta';
      this.submitButton.textContent = 'CADASTRAR';
      this.emailRow.style.display = 'block';
      this.passwordInput.autocomplete = 'new-password';
      this.switchPrompt.textContent = 'Já tem conta?';
      this.switchLink.textContent = 'Entrar';
    }
  }

  // ============== AUTH FLOW ==============
  private async handleSubmit(): Promise<void> {
    if (this.busy) return;
    const username = this.usernameInput.value.trim();
    const password = this.passwordInput.value;
    const email = this.emailInput.value.trim();

    if (this.mode === 'login') {
      if (!username || !password) {
        this.showError('Preencha usuário e senha.');
        return;
      }
    } else {
      if (username.length < 3 || !/^[a-zA-Z0-9]+$/.test(username)) {
        this.showError('Usuário: 3-20 caracteres, apenas letras e números.');
        return;
      }
      if (password.length < 6) {
        this.showError('Senha precisa ter no mínimo 6 caracteres.');
        return;
      }
    }

    this.setBusy(true);
    this.clearError();

    try {
      if (this.mode === 'register') {
        const reg = await socketService.register({
          username,
          password,
          ...(email ? { email } : {}),
        });
        if (!reg.success) {
          this.showError(reg.message);
          this.setBusy(false);
          return;
        }
        log.info('LoginScene: registered, logging in');
      }

      const result = await socketService.loginAndAuthenticate({ username, password });
      if (!result.success) {
        this.showError(result.message);
        this.setBusy(false);
        return;
      }

      log.info('LoginScene: authenticated, going to Lobby', { username });
      // Submit foi um clique do user — destrava autoplay de áudio do browser
      soundManager.unlock();
      // Carrega settings + character oficiais do servidor (background, não bloqueia)
      void settingsService.loadFromServer();
      void characterService.loadFromServer();
      void characterService.loadOwnedFromServer();
      void friendsService.init();
      void shopService.loadBalance();
      overlayManager.hide('login-overlay');
      // Sem fade entre menu ↔ menu — transição imediata
      this.scene.start('Lobby');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.showError(`Falha de comunicação: ${msg}`);
      this.setBusy(false);
    }
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.submitButton.disabled = busy;
    this.usernameInput.disabled = busy;
    this.passwordInput.disabled = busy;
    this.emailInput.disabled = busy;
    if (busy) this.submitButton.textContent = '...';
    else this.submitButton.textContent = this.mode === 'login' ? 'ENTRAR' : 'CADASTRAR';
  }

  private showError(msg: string): void {
    this.errorBox.textContent = msg;
    this.errorBox.classList.add('visible');
  }

  private clearError(): void {
    this.errorBox.textContent = '';
    this.errorBox.classList.remove('visible');
  }
}
