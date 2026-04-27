import Phaser from 'phaser';
import {
  CAMERA_DEADZONE,
  CAMERA_LERP,
  CAMERA_ZOOM,
  INTERACT_RADIUS,
  MAP_TILES_H,
  MAP_TILES_W,
  TILE_SIZE,
} from '@/config/GameConfig';
import { Coin } from '@/entities/Coin';
import { InteractableObject } from '@/entities/InteractableObject';
import { createPlayer, type Player } from '@/entities/Player';
import type { MapId } from '@shared/types/game.types';
import { saveSystem } from '@/systems/SaveSystem';
import { InputSystem } from '@/systems/InputSystem';
import { emit } from '@/utils/EventBus';
import { log } from '@/utils/Logger';

const MAP_W = MAP_TILES_W * TILE_SIZE;
const MAP_H = MAP_TILES_H * TILE_SIZE;

// Layout do mapa (em tiles)
const RIVER_HEIGHT = 4; // tiles
const RIVER_Y_TILE = MAP_TILES_H - RIVER_HEIGHT; // primeira linha de água
const BRIDGE_X_START = Math.floor(MAP_TILES_W / 2) - 1;
const BRIDGE_X_END = BRIDGE_X_START + 2; // 2 tiles de largura
const CLIFF_Y_TILE = 4; // primeira linha de face do penhasco
const CLIFF_X_START = 3;
const CLIFF_X_END = MAP_TILES_W - 3;
const STAIRS_X_START = Math.floor(MAP_TILES_W / 2) - 1;
const STAIRS_X_END = STAIRS_X_START + 2;

/**
 * WorldScene — área verde com grama, caminhos, árvores, pedras, flores,
 * penhasco com escada, rio inferior e ponte de madeira.
 *
 * Mapa gerado proceduralmente. Quando arte hand-drawn entrar (Tiled JSON),
 * substitua build*() por load.tilemapTiledJSON em PreloadScene.
 */
export class WorldScene extends Phaser.Scene {
  private player!: Player;
  private playerUpdate!: () => void;
  private controls!: InputSystem;

  private collidersGroup!: Phaser.Physics.Arcade.StaticGroup;
  private interactablesGroup!: Phaser.GameObjects.Group;
  private coinsGroup!: Phaser.GameObjects.Group;
  private waterTiles: Phaser.GameObjects.Image[] = [];

  private nearbyInteractable: InteractableObject | null = null;
  private waterAnimTimer = 0;

  constructor() {
    super('World');
  }

  create(): void {
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.physics.world.setBounds(0, 0, MAP_W, MAP_H);

    this.collidersGroup = this.physics.add.staticGroup();
    this.interactablesGroup = this.add.group();
    this.coinsGroup = this.add.group();

    this.drawGroundLayer();
    this.drawCliff();
    this.drawRiverAndBridge();
    this.drawTrees();
    this.drawStonesAndPebbles();
    this.drawBushes();
    this.drawFlowers();
    this.spawnCoins();
    this.spawnSign();

    // Player
    const state = saveSystem.get();
    const startInMeadow = state.position.mapId === 'world_meadow';
    const startX = startInMeadow ? state.position.x : MAP_W / 2;
    const startY = startInMeadow ? state.position.y : MAP_H / 2;

    this.controls = new InputSystem(this);
    const created = createPlayer(this, this.controls, startX, startY);
    this.player = created.player;
    this.player.setFacing(state.position.facing);
    this.playerUpdate = created.updater;

    this.physics.add.collider(this.player, this.collidersGroup);
    this.physics.add.overlap(this.player, this.coinsGroup, (_p, coinObj) => {
      const coin = coinObj as Coin;
      coin.destroy();
      const cur = saveSystem.get();
      const next = cur.coins + 1;
      saveSystem.update({ coins: next });
      emit('coin:collected', { total: next });
    });

    // Câmera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W, MAP_H);
    cam.startFollow(this.player, true, CAMERA_LERP, CAMERA_LERP);
    cam.setDeadzone(CAMERA_DEADZONE, CAMERA_DEADZONE);
    cam.setZoom(CAMERA_ZOOM);

    // Trigger ponte → próxima área
    const bridgeCenterX = ((BRIDGE_X_START + BRIDGE_X_END) / 2) * TILE_SIZE;
    const bridgeCenterY = (RIVER_Y_TILE + RIVER_HEIGHT - 1) * TILE_SIZE + TILE_SIZE / 2;
    const bridge = this.add.zone(bridgeCenterX, bridgeCenterY, TILE_SIZE * 2, TILE_SIZE / 2);
    this.physics.add.existing(bridge, true);
    this.physics.add.overlap(this.player, bridge, () => this.tryTransition('world_forest'));

    const kb = this.input.keyboard;
    kb?.once('keydown-ESC', () => this.returnToLobby());

    this.events.on('shutdown', () => void saveSystem.flush());
    this.events.on('destroy', () => void saveSystem.flush());

    log.info('WorldScene ready', { startX, startY });
  }

  override update(_time: number, delta: number): void {
    this.playerUpdate();
    this.checkInteractionPrompt();
    this.handleInteractInput();
    this.animateWater(delta);
    this.persistPosition();
  }

  // ============================================================
  // CHÃO (grama + caminho)
  // ============================================================
  private drawGroundLayer(): void {
    for (let y = 0; y < MAP_TILES_H; y++) {
      for (let x = 0; x < MAP_TILES_W; x++) {
        const v = (x * 7 + y * 13) % 4;
        this.add.image(x * TILE_SIZE, y * TILE_SIZE, `tile-grass-${v}`).setOrigin(0).setDepth(-100);
      }
    }

    // Caminho de terra do topo (escada) até a ponte
    const pathStartY = CLIFF_Y_TILE + 2; // logo após a escada
    const pathEndY = RIVER_Y_TILE - 1; // até antes da água
    for (let y = pathStartY; y <= pathEndY; y++) {
      const baseX = MAP_TILES_W / 2 + Math.sin(y * 0.4) * 2;
      for (const dx of [-1, 0]) {
        const v = (y + dx) % 3;
        this.add
          .image((Math.floor(baseX) + dx) * TILE_SIZE, y * TILE_SIZE, `tile-path-${v}`)
          .setOrigin(0)
          .setDepth(-99);
      }
    }
  }

  // ============================================================
  // PENHASCO (topo do mapa) + ESCADA
  // ============================================================
  private drawCliff(): void {
    for (let x = CLIFF_X_START; x < CLIFF_X_END; x++) {
      const isStairs = x >= STAIRS_X_START && x < STAIRS_X_END;
      if (isStairs) {
        // top + escada (passável)
        this.add.image(x * TILE_SIZE, (CLIFF_Y_TILE - 1) * TILE_SIZE, 'tile-cliff-top').setOrigin(0).setDepth(-95);
        this.add.image(x * TILE_SIZE, CLIFF_Y_TILE * TILE_SIZE, 'tile-stairs').setOrigin(0).setDepth(-95);
        this.add.image(x * TILE_SIZE, (CLIFF_Y_TILE + 1) * TILE_SIZE, 'tile-stairs').setOrigin(0).setDepth(-95);
        continue;
      }
      // top do penhasco (visual, sem colisão por cima)
      this.add.image(x * TILE_SIZE, (CLIFF_Y_TILE - 1) * TILE_SIZE, 'tile-cliff-top').setOrigin(0).setDepth(-94);
      // 2 linhas de face com colisão
      this.add.image(x * TILE_SIZE, CLIFF_Y_TILE * TILE_SIZE, 'tile-cliff-face').setOrigin(0).setDepth(-94);
      this.add.image(x * TILE_SIZE, (CLIFF_Y_TILE + 1) * TILE_SIZE, 'tile-cliff-face').setOrigin(0).setDepth(-94);

      const c = this.collidersGroup.create(
        x * TILE_SIZE + TILE_SIZE / 2,
        CLIFF_Y_TILE * TILE_SIZE + TILE_SIZE,
        'ui-pixel',
      ) as Phaser.Physics.Arcade.Sprite;
      c.setVisible(false).setDisplaySize(TILE_SIZE, TILE_SIZE * 2);
      (c.body as Phaser.Physics.Arcade.StaticBody).setSize(TILE_SIZE, TILE_SIZE * 2);
      c.refreshBody();
    }
  }

  // ============================================================
  // RIO + PONTE
  // ============================================================
  private drawRiverAndBridge(): void {
    for (let y = 0; y < RIVER_HEIGHT; y++) {
      for (let x = 0; x < MAP_TILES_W; x++) {
        const tileX = x * TILE_SIZE;
        const tileY = (RIVER_Y_TILE + y) * TILE_SIZE;
        const isBridge = x >= BRIDGE_X_START && x < BRIDGE_X_END;
        const isShoreNorth = y === 0;

        if (isBridge) {
          if (isShoreNorth) {
            // borda norte da ponte: tile com guard rail / tora
            this.add.image(tileX, tileY, 'tile-bridge-rail-n').setOrigin(0).setDepth(-39);
          } else {
            this.add.image(tileX, tileY, 'tile-bridge').setOrigin(0).setDepth(-40);
          }
        } else {
          // água: usa shore na primeira linha (transição com grama)
          const tex = isShoreNorth
            ? 'tile-water-shore-n'
            : (x + y) % 2 === 0
              ? 'tile-water-0'
              : 'tile-water-1';
          const img = this.add.image(tileX, tileY, tex).setOrigin(0).setDepth(-50);
          this.waterTiles.push(img);

          // colisão da água (player não entra)
          const c = this.collidersGroup.create(
            tileX + TILE_SIZE / 2,
            tileY + TILE_SIZE / 2,
            'ui-pixel',
          ) as Phaser.Physics.Arcade.Sprite;
          c.setVisible(false).setDisplaySize(TILE_SIZE, TILE_SIZE);
          (c.body as Phaser.Physics.Arcade.StaticBody).setSize(TILE_SIZE, TILE_SIZE);
          c.refreshBody();
        }
      }
    }
  }

  // ============================================================
  // ÁRVORES (bordas do mapa)
  // ============================================================
  private drawTrees(): void {
    const positions: Array<[number, number]> = [];

    // borda esquerda + direita (linha contínua)
    for (let y = CLIFF_Y_TILE + 3; y < RIVER_Y_TILE - 1; y += 2) {
      if ((y * 31) % 5 < 4) positions.push([1, y]);
      if ((y * 17) % 7 < 5) positions.push([MAP_TILES_W - 2, y]);
    }
    // pequena segunda linha (mais profundidade)
    for (let y = CLIFF_Y_TILE + 4; y < RIVER_Y_TILE - 2; y += 3) {
      if ((y * 11) % 4 < 2) positions.push([3, y]);
      if ((y * 19) % 4 < 2) positions.push([MAP_TILES_W - 4, y]);
    }
    // árvores no platô superior
    for (let i = 0; i < 5; i++) {
      const tx = 5 + ((i * 7 + 3) % (MAP_TILES_W - 10));
      const ty = 1 + (i % 2);
      positions.push([tx, ty]);
    }

    for (const [tx, ty] of positions) {
      const px = tx * TILE_SIZE + TILE_SIZE / 2;
      const py = ty * TILE_SIZE + TILE_SIZE; // base do tronco
      const tree = this.add.image(px, py, 'prop-tree').setOrigin(0.5, 1);
      tree.setDepth(py); // y-sort

      const c = this.collidersGroup.create(px, py - 6, 'ui-pixel') as Phaser.Physics.Arcade.Sprite;
      c.setVisible(false).setDisplaySize(14, 8);
      (c.body as Phaser.Physics.Arcade.StaticBody).setSize(14, 8);
      c.refreshBody();
    }
  }

  // ============================================================
  // PEDRAS + PEDRINHAS
  // ============================================================
  private drawStonesAndPebbles(): void {
    // pedras médias / grandes (com colisão)
    for (let i = 0; i < 10; i++) {
      const tx = 5 + ((i * 13 + 7) % (MAP_TILES_W - 10));
      const ty = CLIFF_Y_TILE + 3 + ((i * 17) % (MAP_TILES_H - CLIFF_Y_TILE - 9));
      // evita centro (caminho)
      if (Math.abs(tx - MAP_TILES_W / 2) < 3) continue;
      const big = i % 3 === 0;
      const tex = big ? 'prop-stone-big' : 'prop-stone';
      const px = tx * TILE_SIZE + TILE_SIZE / 2;
      const py = ty * TILE_SIZE + TILE_SIZE / 2;
      this.add.image(px, py, tex).setOrigin(0.5, 0.7).setDepth(py);
      const c = this.collidersGroup.create(px, py + 2, 'ui-pixel') as Phaser.Physics.Arcade.Sprite;
      c.setVisible(false).setDisplaySize(big ? 28 : 18, big ? 10 : 7);
      (c.body as Phaser.Physics.Arcade.StaticBody).setSize(big ? 28 : 18, big ? 10 : 7);
      c.refreshBody();
    }

    // pedrinhas pequenas decorativas perto do rio
    for (let i = 0; i < 14; i++) {
      const x = (i * 89) % (MAP_W - 40) + 20;
      const y = (RIVER_Y_TILE - 1) * TILE_SIZE + ((i * 7) % 16);
      // não colocar no centro (ponte)
      if (Math.abs(x - MAP_W / 2) < TILE_SIZE * 2) continue;
      this.add.image(x, y, 'prop-pebble').setOrigin(0.5, 1).setDepth(y);
    }
  }

  // ============================================================
  // ARBUSTOS
  // ============================================================
  private drawBushes(): void {
    const spots: Array<[number, number]> = [
      [6, CLIFF_Y_TILE + 4],
      [MAP_TILES_W - 6, CLIFF_Y_TILE + 5],
      [10, RIVER_Y_TILE - 3],
      [MAP_TILES_W - 9, RIVER_Y_TILE - 2],
      [Math.floor(MAP_TILES_W / 2) + 5, CLIFF_Y_TILE + 4],
    ];
    for (const [tx, ty] of spots) {
      const px = tx * TILE_SIZE + TILE_SIZE / 2;
      const py = ty * TILE_SIZE + TILE_SIZE / 2;
      this.add.image(px, py, 'prop-bush').setOrigin(0.5, 0.8).setDepth(py);
      const c = this.collidersGroup.create(px, py + 2, 'ui-pixel') as Phaser.Physics.Arcade.Sprite;
      c.setVisible(false).setDisplaySize(20, 8);
      (c.body as Phaser.Physics.Arcade.StaticBody).setSize(20, 8);
      c.refreshBody();
    }
  }

  // ============================================================
  // FLORES (decorativas)
  // ============================================================
  private drawFlowers(): void {
    const tints = ['prop-flower-pink', 'prop-flower-yellow', 'prop-flower-white'];
    for (let i = 0; i < 60; i++) {
      const tx = 2 + ((i * 23) % (MAP_TILES_W - 4));
      const ty = CLIFF_Y_TILE + 3 + ((i * 31) % (MAP_TILES_H - CLIFF_Y_TILE - 8));
      // pula caminho central
      if (Math.abs(tx - MAP_TILES_W / 2) < 2) continue;
      const tex = tints[i % tints.length]!;
      this.add
        .image(
          tx * TILE_SIZE + ((i * 7) % TILE_SIZE),
          ty * TILE_SIZE + ((i * 11) % TILE_SIZE),
          tex,
        )
        .setOrigin(0.5, 1)
        .setDepth(-1);
    }
  }

  // ============================================================
  // MOEDAS
  // ============================================================
  private spawnCoins(): void {
    const positions: Array<[number, number]> = [
      [MAP_W / 2 - 80, MAP_H / 2 - 20],
      [MAP_W / 2 + 80, MAP_H / 2 - 30],
      [MAP_W / 2 - 140, MAP_H / 2 + 40],
      [MAP_W / 2 + 140, MAP_H / 2 + 50],
      [MAP_W / 2 - 60, MAP_H / 2 + 100],
      [MAP_W / 2 + 60, MAP_H / 2 + 110],
      [MAP_W / 2 - 200, MAP_H / 2 + 20],
      [MAP_W / 2 + 200, MAP_H / 2 + 30],
    ];
    for (const [x, y] of positions) {
      this.coinsGroup.add(new Coin(this, x, y));
    }
  }

  // ============================================================
  // PLACA INTERATIVA (no centro do caminho)
  // ============================================================
  private spawnSign(): void {
    const x = MAP_W / 2 + TILE_SIZE * 2;
    const y = (CLIFF_Y_TILE + 3) * TILE_SIZE;
    const sign = new InteractableObject(this, x, y, 'prop-sign', {
      id: 'sign-welcome',
      label: 'Ler placa',
      bodyW: 16,
      bodyH: 8,
      onInteract: () => emit('interact:trigger', { targetId: 'sign-welcome' }),
    });
    this.collidersGroup.add(sign);
    this.interactablesGroup.add(sign);
  }

  // ============================================================
  // INTERAÇÃO
  // ============================================================
  private checkInteractionPrompt(): void {
    let nearest: InteractableObject | null = null;
    let nearestDist = INTERACT_RADIUS;
    const px = this.player.x;
    const py = this.player.y;
    for (const obj of this.interactablesGroup.getChildren()) {
      const o = obj as InteractableObject;
      const d = Phaser.Math.Distance.Between(px, py, o.x, o.y);
      if (d < nearestDist) {
        nearest = o;
        nearestDist = d;
      }
    }
    if (nearest !== this.nearbyInteractable) {
      this.nearbyInteractable = nearest;
      emit('interact:prompt', { show: !!nearest, label: nearest?.label });
    }
  }

  private handleInteractInput(): void {
    const snap = this.controls.snapshot();
    if (snap.interact && this.nearbyInteractable) this.nearbyInteractable.onInteract();
  }

  // ============================================================
  // ANIMAÇÃO ÁGUA
  // ============================================================
  private animateWater(delta: number): void {
    this.waterAnimTimer += delta;
    if (this.waterAnimTimer < 600) return;
    this.waterAnimTimer = 0;
    for (const img of this.waterTiles) {
      if (!img.active) continue;
      const cur = img.texture.key;
      if (cur === 'tile-water-0') img.setTexture('tile-water-1');
      else if (cur === 'tile-water-1') img.setTexture('tile-water-0');
    }
  }

  // ============================================================
  // PERSISTÊNCIA
  // ============================================================
  private persistPosition(): void {
    const state = saveSystem.get();
    const moved =
      Math.abs(state.position.x - this.player.x) > 8 ||
      Math.abs(state.position.y - this.player.y) > 8 ||
      state.position.facing !== this.player.facing;
    if (moved) {
      saveSystem.update({
        position: {
          mapId: 'world_meadow',
          x: Math.round(this.player.x),
          y: Math.round(this.player.y),
          facing: this.player.facing,
        },
      });
    }
  }

  private tryTransition(to: MapId): void {
    if (saveSystem.get().position.mapId === to) return;
    log.info('map transition', { from: 'world_meadow', to });
    saveSystem.update({
      position: { mapId: to, x: MAP_W / 2, y: 80, facing: 'down' },
    });
    void saveSystem.flush();
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      // próximo mapa ainda placeholder; volta ao lobby
      this.scene.stop('Hud');
      this.scene.start('Lobby');
    });
  }

  private returnToLobby(): void {
    void saveSystem.flush();
    this.scene.stop('Hud');
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Lobby'));
  }
}
