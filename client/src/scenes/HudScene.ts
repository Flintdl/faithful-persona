import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE } from '@/config/GameConfig';
import { saveSystem } from '@/systems/SaveSystem';
import { on } from '@/utils/EventBus';

/**
 * HudScene — sobreposto à WorldScene. Renderiza vida, moedas, prompts e mensagens.
 * Roda em paralelo (`scene.launch`).
 */
export class HudScene extends Phaser.Scene {
  private hearts: Phaser.GameObjects.Image[] = [];
  private coinText!: Phaser.GameObjects.Text;
  private interactPrompt!: Phaser.GameObjects.Container;
  private dialog!: Phaser.GameObjects.Container;
  private saveIndicator!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'Hud', active: false });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    this.buildHearts();
    this.buildCoins();
    this.buildInteractPrompt();
    this.buildDialog();
    this.buildSaveIndicator();
    this.wireEvents();
  }

  // ===== Vida (canto inferior esquerdo) =====
  private buildHearts(): void {
    const state = saveSystem.get();
    const max = Math.ceil(state.maxHp / 2); // cada coração = 2 hp
    const startX = 16;
    const baseY = GAME_HEIGHT - 22;

    // background frame
    const frame = this.add.graphics();
    frame.fillStyle(PALETTE.uiBg, 0.7);
    frame.fillRoundedRect(8, GAME_HEIGHT - 32, 28 + max * 18, 22, 4);
    frame.lineStyle(1, PALETTE.uiBgSoft, 1);
    frame.strokeRoundedRect(8, GAME_HEIGHT - 32, 28 + max * 18, 22, 4);

    for (let i = 0; i < max; i++) {
      const h = this.add.image(startX + i * 18, baseY, 'ui-heart-full').setOrigin(0, 0.5).setScale(1.4);
      this.hearts.push(h);
    }
    this.refreshHearts(state.hp, state.maxHp);
  }

  private refreshHearts(hp: number, maxHp: number): void {
    const max = Math.ceil(maxHp / 2);
    for (let i = 0; i < this.hearts.length; i++) {
      const heart = this.hearts[i];
      if (!heart) continue;
      const filled = (i + 1) * 2 <= hp;
      const halved = !filled && i * 2 + 1 === hp;
      heart.setTexture(filled ? 'ui-heart-full' : halved ? 'ui-heart-half' : 'ui-heart-empty');
      heart.setVisible(i < max);
    }
  }

  // ===== Moedas (canto superior direito) =====
  private buildCoins(): void {
    const state = saveSystem.get();
    const x = GAME_WIDTH - 16;
    const y = 18;

    const frame = this.add.graphics();
    frame.fillStyle(PALETTE.uiBg, 0.7);
    frame.fillRoundedRect(GAME_WIDTH - 96, 8, 88, 22, 4);
    frame.lineStyle(1, PALETTE.uiBgSoft, 1);
    frame.strokeRoundedRect(GAME_WIDTH - 96, 8, 88, 22, 4);

    this.add.sprite(GAME_WIDTH - 84, y, 'coin', 0).setOrigin(0, 0.5).setScale(1.6).play('coin-spin');

    this.coinText = this.add
      .text(x, y, String(state.coins), {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#f3c54a',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0.5);
  }

  // ===== Prompt "[E] interagir" =====
  private buildInteractPrompt(): void {
    const c = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 78).setVisible(false);
    const bg = this.add.graphics();
    bg.fillStyle(PALETTE.uiBg, 0.85);
    bg.fillRoundedRect(-70, -12, 140, 24, 4);
    bg.lineStyle(1, PALETTE.uiAccent, 0.8);
    bg.strokeRoundedRect(-70, -12, 140, 24, 4);

    const txt = this.add
      .text(0, 0, '[E] interagir', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#e8e2d0',
      })
      .setOrigin(0.5);

    c.add([bg, txt]);
    c.setData('text', txt);
    this.interactPrompt = c;

    this.tweens.add({
      targets: c,
      y: GAME_HEIGHT - 82,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // ===== Dialog box (mostrada em interact:trigger) =====
  private buildDialog(): void {
    const c = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 60).setVisible(false);
    const w = GAME_WIDTH - 80;
    const h = 80;

    const bg = this.add.graphics();
    bg.fillStyle(PALETTE.uiBg, 0.96);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.lineStyle(2, PALETTE.uiAccent, 0.8);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);

    const txt = this.add
      .text(-w / 2 + 14, -h / 2 + 14, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#e8e2d0',
        wordWrap: { width: w - 28 },
        lineSpacing: 4,
      })
      .setOrigin(0, 0);

    const hint = this.add
      .text(w / 2 - 14, h / 2 - 14, '[E] continuar', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#8a9a78',
      })
      .setOrigin(1, 1);

    c.add([bg, txt, hint]);
    c.setData('text', txt);
    this.dialog = c;
  }

  // ===== Indicador "salvo" (canto inferior direito) =====
  private buildSaveIndicator(): void {
    this.saveIndicator = this.add
      .text(GAME_WIDTH - 8, GAME_HEIGHT - 8, '', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#8a9a78',
      })
      .setOrigin(1, 1);
  }

  // ===== Wire eventos =====
  private wireEvents(): void {
    on('coin:collected', ({ total }) => {
      this.coinText.setText(String(total));
      this.tweens.add({
        targets: this.coinText,
        scale: { from: 1.4, to: 1 },
        duration: 200,
        ease: 'Back.easeOut',
      });
    });

    on('player:damaged', ({ hp, maxHp }) => {
      this.refreshHearts(hp, maxHp);
    });

    on('player:healed', ({ hp, maxHp }) => {
      this.refreshHearts(hp, maxHp);
    });

    on('interact:prompt', ({ show, label }) => {
      this.interactPrompt.setVisible(show);
      if (show && label) {
        const t = this.interactPrompt.getData('text') as Phaser.GameObjects.Text;
        t.setText(`[E] ${label}`);
      }
    });

    on('interact:trigger', ({ targetId, text }) => {
      // text vem do mapDef.signText quando emit é da WorldScene; fallback pra dialogFor
      this.showDialog(text ?? this.dialogFor(targetId));
    });

    on('map:entered', ({ label }) => {
      this.showMapBanner(label);
    });

    on('state:saved', ({ at }) => {
      const time = new Date(at).toLocaleTimeString('pt-BR');
      this.saveIndicator.setText(`✓ salvo às ${time}`);
      this.tweens.add({
        targets: this.saveIndicator,
        alpha: { from: 1, to: 0.3 },
        duration: 1800,
        ease: 'Linear',
      });
    });
  }

  private dialogFor(id: string): string {
    // Fallback pra signs sem text customizado no mapDef.
    return id ? `(sem texto: ${id})` : '...';
  }

  /** Banner curto top-center exibido ao entrar num novo mapa. Fade in/out 2s. */
  private showMapBanner(label: string): void {
    const x = GAME_WIDTH / 2;
    const y = 64;

    const bg = this.add.graphics().setAlpha(0);
    const labelW = label.length * 14 + 60;
    bg.fillStyle(PALETTE.uiBg, 0.85);
    bg.fillRoundedRect(x - labelW / 2, y - 18, labelW, 36, 6);
    bg.lineStyle(1, PALETTE.uiAccent, 0.9);
    bg.strokeRoundedRect(x - labelW / 2, y - 18, labelW, 36, 6);

    const text = this.add
      .text(x, y, label, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#d9b262',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({
      targets: [bg, text],
      alpha: { from: 0, to: 1 },
      duration: 250,
      yoyo: true,
      hold: 1400,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        bg.destroy();
        text.destroy();
      },
    });
  }

  private showDialog(text: string): void {
    const t = this.dialog.getData('text') as Phaser.GameObjects.Text;
    t.setText(text);
    this.dialog.setVisible(true);
    this.dialog.setAlpha(0);
    this.tweens.add({ targets: this.dialog, alpha: 1, duration: 150 });

    const kb = this.input.keyboard;
    const close = () => {
      this.tweens.add({
        targets: this.dialog,
        alpha: 0,
        duration: 120,
        onComplete: () => this.dialog.setVisible(false),
      });
      kb?.off('keydown-E', close);
      kb?.off('keydown-ENTER', close);
      kb?.off('keydown-SPACE', close);
    };
    // pequeno delay pra não capturar o E que abriu o dialog
    this.time.delayedCall(150, () => {
      kb?.once('keydown-E', close);
      kb?.once('keydown-ENTER', close);
      kb?.once('keydown-SPACE', close);
    });
  }
}
