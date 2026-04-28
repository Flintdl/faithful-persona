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

/**
 * WorldScene — mapa "meadow" carregado de Tiled JSON (Tiny Swords tileset).
 * Layer `ground` (grass + water + dirt) com colisão na propriedade `collides`.
 * Objetos do tilemap (`spawns` layer) definem player_spawn, transition_zone, sign.
 * Props decorativos (árvores/pedras/arbustos) são spawnados via positions array.
 */
export class WorldScene extends Phaser.Scene {
  private player!: Player;
  private playerUpdate!: () => void;
  private controls!: InputSystem;

  private collidersGroup!: Phaser.Physics.Arcade.StaticGroup;
  private interactablesGroup!: Phaser.GameObjects.Group;
  private coinsGroup!: Phaser.GameObjects.Group;

  private nearbyInteractable: InteractableObject | null = null;

  constructor() {
    super('World');
  }

  create(): void {
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.physics.world.setBounds(0, 0, MAP_W, MAP_H);

    this.collidersGroup = this.physics.add.staticGroup();
    this.interactablesGroup = this.add.group();
    this.coinsGroup = this.add.group();

    // === Tilemap ===
    const map = this.make.tilemap({ key: 'map_meadow' });
    const tileset = map.addTilesetImage('world', 'tileset_world');
    if (!tileset) throw new Error('WorldScene: failed to load tileset');
    const ground = map.createLayer('ground', tileset, 0, 0);
    if (!ground) throw new Error('WorldScene: failed to create ground layer');
    ground.setDepth(-100);
    ground.setCollisionByProperty({ collides: true });

    // === Decoração (árvores/pedras/arbustos) ===
    this.spawnProps();

    // === Spawns do tilemap ===
    const spawnPoint = this.findObject(map, 'player_spawn');
    const transitionZone = this.findObject(map, 'transition_forest');
    const signSpawn = this.findObject(map, 'sign_welcome');

    // === Player ===
    const state = saveSystem.get();
    const startInMeadow = state.position.mapId === 'world_meadow';
    const spawnX: number = spawnPoint?.x ?? MAP_W / 2;
    const spawnY: number = spawnPoint?.y ?? MAP_H / 2;
    const startX = startInMeadow ? state.position.x : spawnX;
    const startY = startInMeadow ? state.position.y : spawnY;

    this.controls = new InputSystem(this);
    const created = createPlayer(this, this.controls, startX, startY);
    this.player = created.player;
    this.player.setFacing(state.position.facing);
    this.playerUpdate = created.updater;

    this.physics.add.collider(this.player, ground);
    this.physics.add.collider(this.player, this.collidersGroup);
    this.physics.add.overlap(this.player, this.coinsGroup, (_p, coinObj) => {
      const coin = coinObj as Coin;
      coin.destroy();
      const cur = saveSystem.get();
      const next = cur.coins + 1;
      saveSystem.update({ coins: next });
      emit('coin:collected', { total: next });
    });

    // === Sign (placa interativa) ===
    if (signSpawn && signSpawn.x !== undefined && signSpawn.y !== undefined) {
      const sign = new InteractableObject(this, signSpawn.x, signSpawn.y, 'prop-sign', {
        id: 'sign-welcome',
        label: 'Ler placa',
        bodyW: 16,
        bodyH: 8,
        onInteract: () => emit('interact:trigger', { targetId: 'sign-welcome' }),
      });
      this.collidersGroup.add(sign);
      this.interactablesGroup.add(sign);
    }

    // === Coins ===
    this.spawnCoins();

    // === Câmera ===
    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W, MAP_H);
    cam.startFollow(this.player, true, CAMERA_LERP, CAMERA_LERP);
    cam.setDeadzone(CAMERA_DEADZONE, CAMERA_DEADZONE);
    cam.setZoom(CAMERA_ZOOM);

    // === Transição (borda direita do mapa) ===
    if (transitionZone) {
      const tx = transitionZone.x ?? 0;
      const ty = transitionZone.y ?? 0;
      const tw = transitionZone.width ?? TILE_SIZE;
      const th = transitionZone.height ?? TILE_SIZE;
      const zone = this.add.zone(tx + tw / 2, ty + th / 2, tw, th);
      this.physics.add.existing(zone, true);
      this.physics.add.overlap(this.player, zone, () => this.tryTransition('world_forest'));
    }

    const kb = this.input.keyboard;
    kb?.once('keydown-ESC', () => this.returnToLobby());

    this.events.on('shutdown', () => void saveSystem.flush());
    this.events.on('destroy', () => void saveSystem.flush());

    log.info('WorldScene ready', { startX, startY });
  }

  override update(): void {
    this.playerUpdate();
    this.checkInteractionPrompt();
    this.handleInteractInput();
    this.persistPosition();
  }

  // ============================================================
  // PROPS — proporção realista (árvores ~2-3x altura do player)
  // ============================================================
  private spawnProps(): void {
    const TREE_SCALE = 0.85;
    const BUSH_SCALE = 0.9;
    const ROCK_SCALE = 1.0;

    // Árvores em CLUSTERS nas bordas (mais natural que pontos isolados)
    // Cada cluster: tile central + 2-3 vizinhos. Y-sort por base.
    const treeClusters: Array<[number, number]> = [
      // borda norte (cima)
      [2, 1], [3, 1], [3, 2],
      [6, 1], [7, 0], [8, 1],
      [11, 0], [12, 1], [13, 1],
      [16, 0],
      // borda oeste
      [1, 4], [0, 5], [1, 6],
      [1, 9], [0, 10], [1, 11],
      // borda sul
      [3, 12], [4, 13], [5, 12],
      [9, 13], [10, 12], [11, 13],
      [14, 12], [15, 13],
      // borda leste (longe da transição em y=4-7)
      [18, 1], [18, 2],
      [18, 10], [18, 11], [18, 12],
    ];
    for (const [tx, ty] of treeClusters) {
      const px = tx * TILE_SIZE + TILE_SIZE / 2 + ((tx * 13) % 12 - 6);
      const py = ty * TILE_SIZE + TILE_SIZE + ((ty * 7) % 8); // jitter sutil
      const tree = this.add.sprite(px, py, 'prop-tree', 0).setOrigin(0.5, 1).setScale(TREE_SCALE);
      tree.setDepth(py);
      // hitbox no tronco apenas (parte de baixo)
      this.addStaticCollider(px, py - 12, 28, 14);
    }

    // Pedras em clusters perto do lago e bordas
    const rocks: Array<[number, number, string]> = [
      [5, 3, 'prop-rock-1'], [5, 4, 'prop-rock-2'],
      [15, 5, 'prop-rock-3'], [15, 6, 'prop-rock-1'],
      [3, 8, 'prop-rock-2'], [4, 9, 'prop-rock-3'],
      [16, 9, 'prop-rock-1'],
      [9, 11, 'prop-rock-2'],
    ];
    for (const [tx, ty, key] of rocks) {
      const px = tx * TILE_SIZE + TILE_SIZE / 2;
      const py = ty * TILE_SIZE + TILE_SIZE / 2;
      this.add.image(px, py, key).setOrigin(0.5, 0.7).setScale(ROCK_SCALE).setDepth(py);
      this.addStaticCollider(px, py + 6, 40, 18);
    }

    // Arbustos preenchendo espaços vazios
    const bushes: Array<[number, number]> = [
      [4, 6], [6, 4], [13, 3], [14, 6],
      [5, 11], [13, 11], [16, 11],
      [4, 2], [15, 11],
    ];
    for (const [tx, ty] of bushes) {
      const px = tx * TILE_SIZE + TILE_SIZE / 2 + ((tx * 11) % 10 - 5);
      const py = ty * TILE_SIZE + TILE_SIZE / 2;
      this.add.sprite(px, py, 'prop-bush', 0).setOrigin(0.5, 0.7).setScale(BUSH_SCALE).setDepth(py);
      this.addStaticCollider(px, py + 10, 50, 22);
    }
  }

  private addStaticCollider(x: number, y: number, w: number, h: number): void {
    const c = this.collidersGroup.create(x, y, 'ui-pixel') as Phaser.Physics.Arcade.Sprite;
    c.setVisible(false).setDisplaySize(w, h);
    (c.body as Phaser.Physics.Arcade.StaticBody).setSize(w, h);
    c.refreshBody();
  }

  // ============================================================
  // MOEDAS — espalhadas pelo mapa, evitando lago/dirt
  // ============================================================
  private spawnCoins(): void {
    // posições em pixel, longe do lago (cols 7-12, rows 5-8 = px 448-832, 320-576)
    const positions: Array<[number, number]> = [
      [200, 200], [400, 250], [600, 350],
      [350, 700], [550, 700], [750, 750],
      [900, 200], [1100, 400], [1100, 700],
    ];
    for (const [x, y] of positions) {
      this.coinsGroup.add(new Coin(this, x, y));
    }
  }

  // ============================================================
  // HELPERS
  // ============================================================
  private findObject(map: Phaser.Tilemaps.Tilemap, name: string): Phaser.Types.Tilemaps.TiledObject | undefined {
    const layer = map.getObjectLayer('spawns');
    return layer?.objects.find((o) => o.name === name);
  }

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
