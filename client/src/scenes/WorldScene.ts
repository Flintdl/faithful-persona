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
import { DEFAULT_MAP_ID, MAPS, type MapDef } from '@/config/maps';
import { Coin } from '@/entities/Coin';
import { InteractableObject } from '@/entities/InteractableObject';
import { Mob } from '@/entities/Mob';
import { createPlayer, type Facing, type Player } from '@/entities/Player';
import type { MapId } from '@shared/types/game.types';
import { saveSystem } from '@/systems/SaveSystem';
import { InputSystem } from '@/systems/InputSystem';
import { emit, on, off } from '@/utils/EventBus';
import { log } from '@/utils/Logger';

const MAP_W = MAP_TILES_W * TILE_SIZE;
const MAP_H = MAP_TILES_H * TILE_SIZE;

export type WorldInitData = {
  mapId?: MapId;
  /** Se vier, override do spawn point do tilemap (usado em transições) */
  spawnX?: number;
  spawnY?: number;
};

/**
 * WorldScene — agora multi-mapa via MAPS registry.
 *
 * Init data opcional: `scene.start('World', { mapId: 'world_forest' })`.
 * Sem init data, usa `saveSystem.get().position.mapId` (último mapa salvo).
 *
 * Layer `ground` (Tiled JSON) com colisão via property `collides`.
 * Object layer `spawns` define player_spawn, transition_*, sign_*.
 * Props (árvores/pedras/arbustos) e mobs lidos de `MAPS[mapId]`.
 */
export class WorldScene extends Phaser.Scene {
  private player!: Player;
  private playerUpdate!: () => void;
  private controls!: InputSystem;
  private currentMapId!: MapId;
  private mapDef!: MapDef;

  private collidersGroup!: Phaser.Physics.Arcade.StaticGroup;
  private interactablesGroup!: Phaser.GameObjects.Group;
  private coinsGroup!: Phaser.GameObjects.Group;
  private mobsGroup!: Phaser.GameObjects.Group;

  private nearbyInteractable: InteractableObject | null = null;
  private spawnPoint: { x: number; y: number } = { x: 0, y: 0 };
  private playerAttackHandler?: (p: { x: number; y: number; facing: Facing }) => void;
  private mobDiedHandler?: (p: { x: number; y: number }) => void;
  private playerDiedHandler?: () => void;

  /** Override de spawn vindo de init data (transição de outro mapa) */
  private spawnOverride?: { x: number; y: number };

  constructor() {
    super('World');
  }

  init(data: WorldInitData): void {
    // Prioridade: init data > save state > default
    const fromSave = saveSystem.get().position.mapId as MapId;
    this.currentMapId = data.mapId ?? fromSave ?? DEFAULT_MAP_ID;
    this.mapDef = MAPS[this.currentMapId];
    if (data.spawnX !== undefined && data.spawnY !== undefined) {
      this.spawnOverride = { x: data.spawnX, y: data.spawnY };
    } else {
      this.spawnOverride = undefined;
    }
  }

  create(): void {
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.cameras.main.setBackgroundColor(this.mapDef.cameraBg);
    this.physics.world.setBounds(0, 0, MAP_W, MAP_H);

    this.collidersGroup = this.physics.add.staticGroup();
    this.interactablesGroup = this.add.group();
    this.coinsGroup = this.add.group();
    this.mobsGroup = this.add.group();

    // === Tilemap ===
    const map = this.make.tilemap({ key: this.mapDef.tilemapKey });
    const tileset = map.addTilesetImage('world', 'tileset_world');
    if (!tileset) throw new Error(`WorldScene: failed to load tileset for ${this.currentMapId}`);
    const ground = map.createLayer('ground', tileset, 0, 0);
    if (!ground) throw new Error(`WorldScene: failed to create ground layer for ${this.currentMapId}`);
    ground.setDepth(-100);
    ground.setCollisionByProperty({ collides: true });

    // === Decoração ===
    this.spawnProps();

    // === Sign + Player spawn (do tilemap object layer) ===
    const playerSpawnObj = this.findObject(map, 'player_spawn');
    const fallbackX = playerSpawnObj?.x ?? MAP_W / 2;
    const fallbackY = playerSpawnObj?.y ?? MAP_H / 2;
    const startX = this.spawnOverride?.x ?? this.savedXOrFallback(fallbackX);
    const startY = this.spawnOverride?.y ?? this.savedYOrFallback(fallbackY);
    this.spawnPoint = { x: fallbackX, y: fallbackY };

    // === Player ===
    this.controls = new InputSystem(this);
    const created = createPlayer(this, this.controls, startX, startY);
    this.player = created.player;
    this.player.setFacing(saveSystem.get().position.facing);
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

    // === Sign (placa interativa, opcional por mapa) ===
    if (this.mapDef.signObjectName) {
      const signObj = this.findObject(map, this.mapDef.signObjectName);
      if (signObj && signObj.x !== undefined && signObj.y !== undefined) {
        const text = this.mapDef.signText ?? '...';
        const sign = new InteractableObject(this, signObj.x, signObj.y, 'prop-sign', {
          id: this.mapDef.signObjectName,
          label: 'Ler placa',
          bodyW: 16,
          bodyH: 8,
          onInteract: () => emit('interact:trigger', { targetId: this.mapDef.signObjectName!, text }),
        });
        this.collidersGroup.add(sign);
        this.interactablesGroup.add(sign);
      }
    }

    // === Mobs (varia por mapa) ===
    this.spawnMobs();
    this.physics.add.collider(this.mobsGroup, this.collidersGroup);
    this.physics.add.collider(this.mobsGroup, this.mobsGroup);

    // === Combat events ===
    this.wireCombatEvents();

    // === Câmera ===
    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W, MAP_H);
    cam.startFollow(this.player, true, CAMERA_LERP, CAMERA_LERP);
    cam.setDeadzone(CAMERA_DEADZONE, CAMERA_DEADZONE);
    cam.setZoom(CAMERA_ZOOM);

    // === Transições (varre todas as zonas declaradas no mapDef) ===
    for (const [objectName, targetMapId] of Object.entries(this.mapDef.transitions)) {
      const transObj = this.findObject(map, objectName);
      if (!transObj) {
        log.warn(`map ${this.currentMapId}: transition object "${objectName}" not found in tilemap`);
        continue;
      }
      const tx = transObj.x ?? 0;
      const ty = transObj.y ?? 0;
      const tw = transObj.width ?? TILE_SIZE;
      const th = transObj.height ?? TILE_SIZE;
      const zone = this.add.zone(tx + tw / 2, ty + th / 2, tw, th);
      this.physics.add.existing(zone, true);
      this.physics.add.overlap(this.player, zone, () => this.tryTransition(targetMapId));
    }

    // ESC volta ao lobby
    const kb = this.input.keyboard;
    kb?.once('keydown-ESC', () => this.returnToLobby());

    this.events.on('shutdown', () => {
      void saveSystem.flush();
      this.unwireCombatEvents();
    });
    this.events.on('destroy', () => {
      void saveSystem.flush();
      this.unwireCombatEvents();
    });

    // Banner do nome do mapa após o fade-in completar
    this.cameras.main.once('camerafadeincomplete', () => {
      emit('map:entered', { mapId: this.currentMapId, label: this.mapDef.label });
    });

    log.info('WorldScene ready', { mapId: this.currentMapId, startX, startY });
  }

  override update(): void {
    this.playerUpdate();
    this.checkInteractionPrompt();
    this.handleInteractInput();
    this.persistPosition();
    this.mobsGroup.children.iterate((m) => {
      (m as Mob).tick();
      return true;
    });
  }

  // ============================================================
  // SPAWNERS — todos lêem do mapDef (registry)
  // ============================================================
  private spawnProps(): void {
    const TREE_SCALE = 0.85;
    const BUSH_SCALE = 0.9;
    const ROCK_SCALE = 1.0;

    for (const [tx, ty] of this.mapDef.treeClusters) {
      const px = tx * TILE_SIZE + TILE_SIZE / 2 + ((tx * 13) % 12 - 6);
      const py = ty * TILE_SIZE + TILE_SIZE + ((ty * 7) % 8);
      const tree = this.add.sprite(px, py, 'prop-tree', 0).setOrigin(0.5, 1).setScale(TREE_SCALE);
      tree.setDepth(py);
      this.addStaticCollider(px, py - 12, 28, 14);
    }

    for (const [tx, ty, key] of this.mapDef.rocks) {
      const px = tx * TILE_SIZE + TILE_SIZE / 2;
      const py = ty * TILE_SIZE + TILE_SIZE / 2;
      this.add.image(px, py, key).setOrigin(0.5, 0.7).setScale(ROCK_SCALE).setDepth(py);
      this.addStaticCollider(px, py + 6, 40, 18);
    }

    for (const [tx, ty] of this.mapDef.bushes) {
      const px = tx * TILE_SIZE + TILE_SIZE / 2 + ((tx * 11) % 10 - 5);
      const py = ty * TILE_SIZE + TILE_SIZE / 2;
      this.add.sprite(px, py, 'prop-bush', 0).setOrigin(0.5, 0.7).setScale(BUSH_SCALE).setDepth(py);
      this.addStaticCollider(px, py + 10, 50, 22);
    }
  }

  private spawnMobs(): void {
    for (const [x, y] of this.mapDef.mobSpawns) {
      const mob = new Mob(this, x, y);
      mob.setTarget(this.player);
      mob.setOnContactDamage(() => {
        this.player.takeDamage(1, mob.x, mob.y);
      });
      this.mobsGroup.add(mob);
    }
  }

  private addStaticCollider(x: number, y: number, w: number, h: number): void {
    const c = this.collidersGroup.create(x, y, 'ui-pixel') as Phaser.Physics.Arcade.Sprite;
    c.setVisible(false).setDisplaySize(w, h);
    (c.body as Phaser.Physics.Arcade.StaticBody).setSize(w, h);
    c.refreshBody();
  }

  // ============================================================
  // COMBAT EVENTS
  // ============================================================
  private wireCombatEvents(): void {
    this.playerAttackHandler = ({ x, y, facing }) => {
      this.spawnPlayerAttackHitbox(x, y, facing);
    };
    on('player:attack', this.playerAttackHandler);

    this.mobDiedHandler = ({ x, y }) => {
      this.coinsGroup.add(new Coin(this, x, y));
    };
    on('mob:died', this.mobDiedHandler);

    this.playerDiedHandler = () => {
      this.cameras.main.fadeOut(400, 60, 10, 10);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.pause();
        this.scene.launch('GameOver');
      });
    };
    on('player:died', this.playerDiedHandler);
  }

  private unwireCombatEvents(): void {
    if (this.playerAttackHandler) off('player:attack', this.playerAttackHandler);
    if (this.mobDiedHandler) off('mob:died', this.mobDiedHandler);
    if (this.playerDiedHandler) off('player:died', this.playerDiedHandler);
  }

  private spawnPlayerAttackHitbox(x: number, y: number, facing: Facing): void {
    const reach = 36;
    const wide = 36;
    const dirOffsets: Record<Facing, [number, number, number, number]> = {
      up: [0, -reach, wide, reach],
      down: [0, reach, wide, reach],
      left: [-reach, 0, reach, wide],
      right: [reach, 0, reach, wide],
    };
    const [dx, dy, w, h] = dirOffsets[facing];
    const zone = this.add.zone(x + dx, y + dy, w, h);
    this.physics.add.existing(zone, true);

    const hitOnce = new Set<Mob>();
    const overlap = this.physics.add.overlap(zone, this.mobsGroup, (_z, mobObj) => {
      const mob = mobObj as Mob;
      if (hitOnce.has(mob)) return;
      hitOnce.add(mob);
      mob.takeDamage(1, x, y);
    });

    this.time.delayedCall(220, () => {
      overlap.destroy();
      zone.destroy();
    });
  }

  /** Chamado pela GameOverScene quando o user clica RESPAWN. */
  respawnPlayer(): void {
    const cur = saveSystem.get();
    saveSystem.update({ hp: cur.maxHp });
    emit('player:healed', { hp: cur.maxHp, maxHp: cur.maxHp });
    this.player.reset(this.spawnPoint.x, this.spawnPoint.y);
    saveSystem.update({
      position: {
        mapId: this.currentMapId,
        x: this.spawnPoint.x,
        y: this.spawnPoint.y,
        facing: 'down',
      },
    });
    this.scene.resume();
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  // ============================================================
  // HELPERS / BOILERPLATE
  // ============================================================
  private findObject(map: Phaser.Tilemaps.Tilemap, name: string): Phaser.Types.Tilemaps.TiledObject | undefined {
    const layer = map.getObjectLayer('spawns');
    return layer?.objects.find((o) => o.name === name);
  }

  /** Restaura X salvo se o save é do mapa atual; senão usa spawn do tilemap. */
  private savedXOrFallback(fallback: number): number {
    const pos = saveSystem.get().position;
    return pos.mapId === this.currentMapId ? pos.x : fallback;
  }
  private savedYOrFallback(fallback: number): number {
    const pos = saveSystem.get().position;
    return pos.mapId === this.currentMapId ? pos.y : fallback;
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
      state.position.mapId !== this.currentMapId ||
      Math.abs(state.position.x - this.player.x) > 8 ||
      Math.abs(state.position.y - this.player.y) > 8 ||
      state.position.facing !== this.player.facing;
    if (moved) {
      saveSystem.update({
        position: {
          mapId: this.currentMapId,
          x: Math.round(this.player.x),
          y: Math.round(this.player.y),
          facing: this.player.facing,
        },
      });
    }
  }

  private tryTransition(to: MapId): void {
    if (to === this.currentMapId) return;
    const targetDef = MAPS[to];
    if (!targetDef) {
      log.warn(`tryTransition: unknown mapId "${to}"`);
      return;
    }
    log.info('map transition', { from: this.currentMapId, to });
    emit('map:transition', { from: this.currentMapId, to });
    void saveSystem.flush();
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      // restart com novo mapId — init() roda de novo, props/mobs/transições do novo mapa
      this.scene.restart({ mapId: to } satisfies WorldInitData);
    });
  }

  private returnToLobby(): void {
    void saveSystem.flush();
    this.scene.stop('Hud');
    this.cameras.main.fadeOut(250, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Lobby'));
  }
}
