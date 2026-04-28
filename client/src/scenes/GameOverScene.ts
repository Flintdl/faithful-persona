import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE } from '@/config/GameConfig';

/**
 * GameOverScene — overlay sobre WorldScene (que fica pausada).
 * Botão RESPAWN chama WorldScene.respawnPlayer() e fecha esta cena.
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(): void {
    // backdrop semi-transparente vermelho
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.7);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    bg.fillStyle(0x6e1f1f, 0.25);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // título
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, 'VOCÊ CAIU', {
        fontFamily: 'monospace',
        fontSize: '40px',
        color: '#e8e2d0',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setShadow(0, 2, '#000000', 4);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 16, 'O slime te derrotou…', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#b9c9a3',
      })
      .setOrigin(0.5);

    // botão RESPAWN (mesmo estilo do JOGAR no Lobby)
    const w = 240;
    const h = 52;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2 + 50;

    const btn = this.add.container(cx, cy);

    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.5);
    shadow.fillRoundedRect(-w / 2 + 2, -h / 2 + 4, w, h, 10);

    const btnBg = this.add.graphics();
    const drawBg = (color: number) => {
      btnBg.clear();
      btnBg.fillStyle(color, 1);
      btnBg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
      btnBg.lineStyle(2, 0xfff1b8, 0.9);
      btnBg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    };
    drawBg(PALETTE.uiAccent);

    const label = this.add
      .text(0, -3, 'RESPAWN', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#1a1f1a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const sub = this.add
      .text(0, 16, '[ENTER] · começar do início', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#3a3a2a',
      })
      .setOrigin(0.5);

    btn.add([shadow, btnBg, label, sub]);
    btn.setSize(w, h).setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => drawBg(0xfff1b8));
    btn.on('pointerout', () => drawBg(PALETTE.uiAccent));
    btn.on('pointerdown', () => this.respawn());

    const enterKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    enterKey?.once('down', () => this.respawn());
    const spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    spaceKey?.once('down', () => this.respawn());

    // pulse sutil
    this.tweens.add({
      targets: btn,
      scale: { from: 1, to: 1.03 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private respawn(): void {
    const world = this.scene.get('World') as Phaser.Scene & { respawnPlayer?: () => void };
    world.respawnPlayer?.();
    this.scene.stop();
  }
}
