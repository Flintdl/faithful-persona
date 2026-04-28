import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE } from '@/config/GameConfig';
import { saveSystem } from '@/systems/SaveSystem';
import { log } from '@/utils/Logger';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    // Loading bar
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    this.add.graphics().fillStyle(PALETTE.uiBg).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.add
      .text(cx, cy - 40, 'FAITHFUL PERSONA', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#d9b262',
      })
      .setOrigin(0.5);

    const barW = 240;
    const barH = 6;
    const barX = cx - barW / 2;
    const barY = cy + 10;
    this.add.graphics().fillStyle(PALETTE.uiBgSoft).fillRect(barX, barY, barW, barH);
    const barFill = this.add.graphics();
    const label = this.add
      .text(cx, cy + 30, 'preparando…', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#b9c9a3',
      })
      .setOrigin(0.5);

    this.load.on('progress', (p: number) => {
      barFill.clear().fillStyle(PALETTE.uiAccent).fillRect(barX, barY, barW * p, barH);
    });
    this.load.on('complete', () => label.setText('inicializando save…'));

    // Tilemap + props reais carregam no BootScene (antes do AssetGenerator).
    // Aqui ficam apenas placeholders pra futuros loads opcionais (audio, fontes etc.)
    //
    // Exemplo (Sprout Lands by Cup Nooble — 16x16):
    //
    // this.load.image('tile-grass-0',     'assets/sprites/grass_a.png');
    // this.load.image('tile-grass-1',     'assets/sprites/grass_b.png');
    // this.load.image('tile-grass-2',     'assets/sprites/grass_c.png');
    // this.load.image('tile-grass-3',     'assets/sprites/grass_d.png');
    // this.load.image('tile-path-0',      'assets/sprites/path_a.png');
    // this.load.image('tile-path-1',      'assets/sprites/path_b.png');
    // this.load.image('tile-path-2',      'assets/sprites/path_c.png');
    // this.load.image('tile-water-0',     'assets/sprites/water_a.png');
    // this.load.image('tile-water-1',     'assets/sprites/water_b.png');
    // this.load.image('tile-water-shore-n','assets/sprites/water_shore_n.png');
    // this.load.image('tile-cliff-top',   'assets/sprites/cliff_top.png');
    // this.load.image('tile-cliff-face',  'assets/sprites/cliff_face.png');
    // this.load.image('tile-stairs',      'assets/sprites/stairs.png');
    // this.load.image('tile-bridge',      'assets/sprites/bridge.png');
    // this.load.image('tile-bridge-rail-n','assets/sprites/bridge_rail_n.png');
    // this.load.image('prop-tree',        'assets/sprites/tree.png');
    // this.load.image('prop-stone',       'assets/sprites/stone.png');
    // this.load.image('prop-stone-big',   'assets/sprites/stone_big.png');
    // this.load.image('prop-pebble',      'assets/sprites/pebble.png');
    // this.load.image('prop-bush',        'assets/sprites/bush.png');
    // this.load.image('prop-flower-pink', 'assets/sprites/flower_pink.png');
    // this.load.image('prop-flower-yellow','assets/sprites/flower_yellow.png');
    // this.load.image('prop-flower-white','assets/sprites/flower_white.png');
    // this.load.image('prop-sign',        'assets/sprites/sign.png');
    //
    // // Player spritesheet 24x32, 4 colunas × 4 linhas (down, up, left, right)
    // this.load.spritesheet('player', 'assets/sprites/player.png', {
    //   frameWidth: 24, frameHeight: 32,
    // });
    //
    // // Coin spritesheet 14x14, 6 frames
    // this.load.spritesheet('coin', 'assets/sprites/coin.png', {
    //   frameWidth: 14, frameHeight: 14,
    // });
    //
    // // UI
    // this.load.image('ui-heart-full',  'assets/ui/heart_full.png');
    // this.load.image('ui-heart-half',  'assets/ui/heart_half.png');
    // this.load.image('ui-heart-empty', 'assets/ui/heart_empty.png');
    //
    // // Tilemap (Tiled JSON) — opcional, pra substituir geração programática do mapa
    // this.load.tilemapTiledJSON('map_meadow', 'assets/tilemaps/meadow.json');
    // this.load.image('tileset_world',          'assets/sprites/tileset_world.png');
    //
    // // Áudio
    // this.load.audio('bgm_meadow', ['assets/audio/bgm_meadow.ogg', 'assets/audio/bgm_meadow.mp3']);
    // this.load.audio('sfx_coin',   ['assets/audio/sfx_coin.ogg',   'assets/audio/sfx_coin.mp3']);
    //
    // Após carregar, o AssetGenerator não regrava texturas com a mesma key
    // (faz `if (textures.exists(key)) return;`), então as suas substituem.
  }

  async create(): Promise<void> {
    try {
      await saveSystem.init();
      log.info('save loaded, going to Lobby');

      const loader = document.getElementById('boot-loader');
      loader?.classList.add('hidden');
      setTimeout(() => loader?.remove(), 600);

      this.scene.start('Lobby');
    } catch (err) {
      log.error('failed to init save', { err });
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, 'Erro ao iniciar. Recarregue a página.', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#e89aa8',
        })
        .setOrigin(0.5);
    }
  }
}
