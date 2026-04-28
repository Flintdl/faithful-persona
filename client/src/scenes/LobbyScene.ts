import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE } from '@/config/GameConfig';
import { saveSystem } from '@/systems/SaveSystem';

/**
 * LobbyScene — hub central estilo Fortnite.
 * Avatar grande no centro, painéis de PLAY/INVENTORY/SHOP/SETTINGS,
 * info da conta no topo. Botão PLAY transita pra WorldScene.
 */
export class LobbyScene extends Phaser.Scene {
  private playButton?: Phaser.GameObjects.Container;

  constructor() {
    super('Lobby');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a1f1a');

    this.drawBackdrop();
    this.drawTopBar();
    this.drawAvatarPanel();
    this.drawSidePanels();
    this.drawPlayButton();
    this.drawFooter();
  }

  // ============ Backdrop com gradiente sutil ============
  private drawBackdrop(): void {
    const g = this.add.graphics();
    // Gradiente fake: várias faixas horizontais
    const steps = 30;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const r = 0x1a + Math.floor(t * 0x10);
      const gC = 0x1f + Math.floor(t * 0x18);
      const b = 0x1a + Math.floor(t * 0x10);
      const color = (r << 16) | (gC << 8) | b;
      g.fillStyle(color, 1);
      g.fillRect(0, (i * GAME_HEIGHT) / steps, GAME_WIDTH, GAME_HEIGHT / steps + 1);
    }

    // Vinheta nos cantos
    const vignette = this.add.graphics();
    vignette.fillStyle(0x000000, 0.35);
    vignette.fillRect(0, 0, GAME_WIDTH, 30);
    vignette.fillRect(0, GAME_HEIGHT - 30, GAME_WIDTH, 30);

    // Particles simulados (estrelinhas estáticas)
    const stars = this.add.graphics();
    stars.fillStyle(0xfff5d0, 0.3);
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * GAME_WIDTH;
      const y = Math.random() * GAME_HEIGHT;
      stars.fillRect(x, y, 1, 1);
    }
  }

  // ============ Top bar: nome, level, moedas, build ============
  private drawTopBar(): void {
    const state = saveSystem.get();

    const bar = this.add.graphics();
    bar.fillStyle(PALETTE.uiBg, 0.85);
    bar.fillRect(0, 0, GAME_WIDTH, 36);
    bar.lineStyle(1, PALETTE.uiAccent, 0.6);
    bar.lineBetween(0, 36, GAME_WIDTH, 36);

    // Logo / título
    this.add
      .text(16, 18, 'FAITHFUL PERSONA', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#d9b262',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);

    // Player info (centro-esquerda)
    this.add
      .text(GAME_WIDTH - 16, 12, state.name, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#e8e2d0',
      })
      .setOrigin(1, 0.5);

    this.add
      .text(GAME_WIDTH - 16, 26, `LV ${state.level}  ·  ${state.coins} ◉`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#b9c9a3',
      })
      .setOrigin(1, 0.5);
  }

  // ============ Avatar central (preview do personagem) ============
  private drawAvatarPanel(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2 - 20;

    // Pedestal/plataforma
    const platform = this.add.graphics();
    platform.fillStyle(0x000000, 0.4);
    platform.fillEllipse(cx, cy + 80, 130, 20);
    platform.fillStyle(PALETTE.uiBgSoft, 1);
    platform.fillEllipse(cx, cy + 78, 120, 16);
    platform.lineStyle(2, PALETTE.uiAccent, 0.8);
    platform.strokeEllipse(cx, cy + 78, 120, 16);

    // Avatar grande — usa idle anim do Adventurer pack pra ter respiração
    const avatar = this.add.sprite(cx, cy + 30, 'player-idle-down', 0).setScale(2.5);
    avatar.anims.play('player-idle-down');
    this.tweens.add({
      targets: avatar,
      y: cy + 26,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Glow circular
    const glow = this.add.graphics();
    glow.fillStyle(PALETTE.uiAccent, 0.08);
    glow.fillCircle(cx, cy + 20, 80);
    glow.fillStyle(PALETTE.uiAccent, 0.05);
    glow.fillCircle(cx, cy + 20, 110);
  }

  // ============ Side panels (Inventory, Shop, Settings, Friends) ============
  private drawSidePanels(): void {
    const panels = [
      { x: 30, y: 80, label: 'INVENTÁRIO', sub: 'Itens & equips', icon: '▤' },
      { x: 30, y: 200, label: 'AMIGOS', sub: 'Online: 0', icon: '◉' },
      { x: GAME_WIDTH - 30 - 200, y: 80, label: 'LOJA', sub: 'Cosméticos', icon: '◊' },
      { x: GAME_WIDTH - 30 - 200, y: 200, label: 'CONFIGURAÇÕES', sub: 'Áudio · Controles', icon: '⚙' },
    ];

    for (const p of panels) {
      this.makePanel(p.x, p.y, 200, 90, p.label, p.sub, p.icon);
    }
  }

  private makePanel(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    sub: string,
    icon: string,
  ): void {
    const c = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(PALETTE.uiBg, 0.85);
    bg.fillRoundedRect(0, 0, w, h, 6);
    bg.lineStyle(1, PALETTE.uiBgSoft, 1);
    bg.strokeRoundedRect(0, 0, w, h, 6);

    const accent = this.add.graphics();
    accent.fillStyle(PALETTE.uiAccent, 1);
    accent.fillRect(0, 0, 3, h);

    const iconText = this.add
      .text(20, h / 2, icon, {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#d9b262',
      })
      .setOrigin(0, 0.5);

    const labelText = this.add.text(56, h / 2 - 10, label, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#e8e2d0',
      fontStyle: 'bold',
    });

    const subText = this.add.text(56, h / 2 + 6, sub, {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#8a9a78',
    });

    const lock = this.add
      .text(w - 10, h - 10, '— em breve', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#6a7a58',
      })
      .setOrigin(1, 1);

    c.add([bg, accent, iconText, labelText, subText, lock]);
    c.setSize(w, h).setInteractive({ useHandCursor: true });
    c.on('pointerover', () => bg.clear()
      .fillStyle(PALETTE.uiBgSoft, 0.95)
      .fillRoundedRect(0, 0, w, h, 6)
      .lineStyle(1, PALETTE.uiAccent, 1)
      .strokeRoundedRect(0, 0, w, h, 6),
    );
    c.on('pointerout', () => bg.clear()
      .fillStyle(PALETTE.uiBg, 0.85)
      .fillRoundedRect(0, 0, w, h, 6)
      .lineStyle(1, PALETTE.uiBgSoft, 1)
      .strokeRoundedRect(0, 0, w, h, 6),
    );
  }

  // ============ Botão PLAY (CTA grande) ============
  private drawPlayButton(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT - 70;
    const w = 260;
    const h = 56;

    const c = this.add.container(cx, cy);
    this.playButton = c;

    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.4);
    shadow.fillRoundedRect(-w / 2 + 2, -h / 2 + 4, w, h, 10);

    const bg = this.add.graphics();
    const drawBg = (color: number) => {
      bg.clear();
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
      bg.lineStyle(2, 0xfff1b8, 0.9);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    };
    drawBg(PALETTE.uiAccent);

    const label = this.add
      .text(0, -4, 'JOGAR', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#1a1f1a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const sub = this.add
      .text(0, 16, '[ENTER] · explorar o mundo', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#3a3a2a',
      })
      .setOrigin(0.5);

    c.add([shadow, bg, label, sub]);
    c.setSize(w, h).setInteractive({ useHandCursor: true });
    c.on('pointerover', () => {
      drawBg(0xfff1b8);
      this.tweens.add({ targets: c, scale: 1.04, duration: 120 });
    });
    c.on('pointerout', () => {
      drawBg(PALETTE.uiAccent);
      this.tweens.add({ targets: c, scale: 1, duration: 120 });
    });
    c.on('pointerdown', () => this.startGame());

    const enterKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    enterKey?.on('down', () => this.startGame());
    const spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    spaceKey?.on('down', () => this.startGame());

    // Pulsing glow
    this.tweens.add({
      targets: c,
      scale: { from: 1, to: 1.02 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private startGame(): void {
    if (!this.playButton) return;
    this.playButton.disableInteractive();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('World');
      this.scene.launch('Hud');
    });
  }

  // ============ Footer com versão e dicas ============
  private drawFooter(): void {
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 14, 'WASD/setas: mover · E: interagir · ESC: voltar ao lobby', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#8a9a78',
      })
      .setOrigin(0.5);

    this.add
      .text(8, GAME_HEIGHT - 14, `v0.1.0 · build ${import.meta.env.VITE_BUILD_ID ?? 'dev'}`, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#5a6a48',
      })
      .setOrigin(0, 1);
  }
}
