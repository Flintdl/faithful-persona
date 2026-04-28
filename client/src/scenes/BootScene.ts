import Phaser from 'phaser';
import { PLAYER_SPRITE_H, PLAYER_SPRITE_W } from '@/config/GameConfig';
import { MAPS } from '@/config/maps';
import { AssetGenerator } from '@/gen/AssetGenerator';
import { log } from '@/utils/Logger';

const PLAYER_DIRS = ['down', 'up', 'left', 'right'] as const;
const PLAYER_ANIMS = ['idle', 'run', 'attack1', 'attack2'] as const;
const PLAYER_RUN_FRAMES = 8;
const PLAYER_IDLE_FRAMES = 8;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // === Adventurer (player) — 16 spritesheets, 8 frames cada, 96x80 por frame ===
    for (const a of PLAYER_ANIMS) {
      for (const d of PLAYER_DIRS) {
        this.load.spritesheet(`player-${a}-${d}`, `assets/sprites/adventurer/${a}/${a}_${d}.png`, {
          frameWidth: PLAYER_SPRITE_W,
          frameHeight: PLAYER_SPRITE_H,
        });
      }
    }

    // === Tiny Swords (mundo) — tileset compartilhado + props ===
    this.load.image('tileset_world', 'assets/tilemaps/tileset.png');
    this.load.spritesheet('prop-tree', 'assets/sprites/world/tree.png', { frameWidth: 192, frameHeight: 256 });
    this.load.spritesheet('prop-bush', 'assets/sprites/world/bush.png', { frameWidth: 128, frameHeight: 128 });
    this.load.image('prop-rock-1', 'assets/sprites/world/rock1.png');
    this.load.image('prop-rock-2', 'assets/sprites/world/rock2.png');
    this.load.image('prop-rock-3', 'assets/sprites/world/rock3.png');

    // === Tilemaps — loop sobre MAPS registry (DRY pra adicionar novos) ===
    // Dedup por tilemapKey (world_village hoje é alias de meadow → não recarrega)
    const loaded = new Set<string>();
    for (const m of Object.values(MAPS)) {
      if (loaded.has(m.tilemapKey)) continue;
      loaded.add(m.tilemapKey);
      this.load.tilemapTiledJSON(m.tilemapKey, m.jsonPath);
    }
  }

  create(): void {
    log.info('BootScene: generating procedural assets');
    new AssetGenerator(this).generateAll();
    this.createPlayerAnims();
    this.scene.start('Preload');
  }

  /**
   * Cria as anims do player a partir das spritesheets carregadas no preload.
   * Mapeia anim names internas (idle, walk) pras spritesheets externas (idle, run).
   */
  private createPlayerAnims(): void {
    if (!this.textures.exists('player-idle-down')) return; // assets não carregaram

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
      // jogo usa "walk" como nome lógico; pack chama de "run"
      make(`player-walk-${d}`, `player-run-${d}`, PLAYER_RUN_FRAMES, 12, -1);
      make(`player-attack-${d}`, `player-attack1-${d}`, 6, 14, 0);
    }
  }
}
