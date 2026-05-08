import Phaser from 'phaser';
import { BG_SCENARIOS, PLAYER_SPRITE_H, PLAYER_SPRITE_W } from '@/config/GameConfig';
import { log } from '@/utils/Logger';

const PLAYER_DIRS = ['down', 'up', 'left', 'right'] as const;
const PLAYER_ANIMS = ['idle', 'run', 'attack1', 'attack2'] as const;
const PLAYER_RUN_FRAMES = 8;
const PLAYER_IDLE_FRAMES = 8;

/**
 * BootScene — carrega o sprite Adventurer do player e cria as anims base.
 * Skins reais por papel/cosmético virão via PreloadScene quando o catálogo for definido.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    for (const a of PLAYER_ANIMS) {
      for (const d of PLAYER_DIRS) {
        this.load.spritesheet(`player-${a}-${d}`, `assets/sprites/adventurer/${a}/${a}_${d}.png`, {
          frameWidth: PLAYER_SPRITE_W,
          frameHeight: PLAYER_SPRITE_H,
        });
      }
    }
    // BGs do lobby — carregadas como Image (cover-fit no canvas via LobbyScene)
    for (const bg of BG_SCENARIOS) {
      this.load.image(bg.textureKey, bg.url);
    }
  }

  create(): void {
    log.info('BootScene: creating player anims');
    this.createPlayerAnims();
    this.scene.start('Preload');
  }

  private createPlayerAnims(): void {
    if (!this.textures.exists('player-idle-down')) return;

    const make = (key: string, textureKey: string, frames: number, rate: number, repeat: number) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(textureKey, { start: 0, end: frames - 1 }),
        frameRate: rate,
        repeat,
      });
    };

    for (const d of PLAYER_DIRS) {
      make(`player-idle-${d}`, `player-idle-${d}`, PLAYER_IDLE_FRAMES, 6, -1);
      make(`player-walk-${d}`, `player-run-${d}`, PLAYER_RUN_FRAMES, 12, -1);
      make(`player-attack-${d}`, `player-attack1-${d}`, 6, 14, 0);
    }
  }
}
