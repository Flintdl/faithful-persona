import Phaser from 'phaser';
import {
  BONFIRE_X,
  BONFIRE_Y,
  CAMERA_DEADZONE,
  CAMERA_LERP,
  CAMERA_ZOOM,
  MOVE_THROTTLE_MS,
  PALETTE,
  PLAYER_SCALE,
  PLAYER_SPEED,
  PLAYER_SPRITE_W,
  WORLD_H,
  WORLD_W,
} from '@/config/GameConfig';
import type {
  GameMovePayload,
  GamePlayerMovedEvent,
  GamePlayersStateEvent,
  MafiaActionType,
  MafiaPhase,
  MafiaPhaseChangedEvent,
  MafiaPlayerDiedEvent,
  MafiaRoleAssignedEvent,
  MafiaUseAbilityPayload,
  MafiaVotePayload,
  RoomPlayer,
  RoomSummary,
} from '@/events/socket.events';
import { getSkin } from '@/config/Skins';
import { characterService } from '@/services/CharacterService';
import { socketService } from '@/services/SocketService';
import { soundManager } from '@/services/SoundManager';
import { overlayManager } from '@/utils/OverlayManager';
import { log } from '@/utils/Logger';

const FACINGS = ['down', 'up', 'left', 'right'] as const;
type Facing = (typeof FACINGS)[number];

type WorldInitData = { room: RoomSummary };

type RemotePlayerSprite = {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  username: string;
  facing: Facing;
  targetX: number;
  targetY: number;
  alive: boolean;
};

/**
 * WorldScene — clareira 2D top-down com fogueira central.
 *
 * Movimento livre (WASD/setas), sync via `game:move` / `game:player_moved`.
 * Coords no socket em PORCENTAGEM 0-100 (mesmo padrão de LobbyMovementHandler).
 *
 * HUD overlay (timer, role card, fases) chega na task 7.
 * Teleport para fogueira em DAY chega na task 7.
 */
export class WorldScene extends Phaser.Scene {
  private room!: RoomSummary;
  private localUserId!: string;
  private localUsername!: string;
  private players = new Map<string, RoomPlayer>();
  private remoteSprites = new Map<string, RemotePlayerSprite>();

  private localSprite!: Phaser.Physics.Arcade.Sprite;
  private localLabel!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  /** Action keys — tecla varia conforme fase + papel */
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyF!: Phaser.Input.Keyboard.Key;
  private keyQ!: Phaser.Input.Keyboard.Key;
  /** Alvo aproximado (highlight). null = ninguém perto o suficiente. */
  private targetUserId: string | null = null;

  private bonfireFlame!: Phaser.GameObjects.Graphics;
  private flameTime = 0;

  private lastEmit = 0;
  private lastEmittedX = -1;
  private lastEmittedY = -1;
  private facing: Facing = 'down';

  private currentPhase: MafiaPhase = 'LOBBY';
  /** Em discussão (DAY_DISCUSSION/VOTING), teleporta pra fogueira e bloqueia movimento. */
  private movementLocked = false;
  private myRole?: string;
  private alive = new Set<string>();
  private actionPrompt!: Phaser.GameObjects.Text;

  // Bound socket handlers (referência estável pra remoção)
  private onPlayersState = (data: GamePlayersStateEvent) => this.applyPlayersState(data);
  private onPlayerMoved = (data: GamePlayerMovedEvent) => this.applyRemoteMove(data);
  private onPlayerLeft = (data: { userId: string }) => this.removeRemoteSprite(data.userId);
  private onPhaseChanged = (data: MafiaPhaseChangedEvent) => this.applyPhaseChange(data);
  private onRoleAssigned = (data: MafiaRoleAssignedEvent) => {
    this.myRole = data.role;
  };
  private onPlayerDied = (data: MafiaPlayerDiedEvent) => this.applyPlayerDied(data);

  constructor() {
    super('World');
  }

  init(data: WorldInitData): void {
    this.room = data.room;
    const user = socketService.getCurrentUser();
    if (!user) throw new Error('WorldScene: no current user');
    this.localUserId = user.userId;
    this.localUsername = user.username;
    for (const p of this.room.players) {
      this.players.set(p.userId, p);
      this.alive.add(p.userId);
    }
  }

  create(): void {
    overlayManager.hideAll();
    overlayManager.hideWorldBg();
    overlayManager.showCanvas();
    this.cameras.main.fadeIn(400, 0, 0, 0);

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    this.drawGround();
    this.drawClearingDecor();
    this.drawBonfire();

    this.spawnLocalPlayer();
    this.setupInput();
    this.setupCamera();

    this.wireSocket();
    socketService.emit('game:get_state');

    // Action prompt (canto superior central) — informa ação disponível por fase
    this.actionPrompt = this.add
      .text(BONFIRE_X, 24, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#d4a017',
        backgroundColor: 'rgba(6,7,17,0.75)',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(2000);
    this.actionPrompt.setVisible(false);

    // HUD overlay paralela (timer, role card, lista de jogadores)
    this.scene.launch('Hud', { room: this.room });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.tearDown());

    log.info('WorldScene ready', { roomId: this.room.id, players: this.players.size });
  }

  override update(time: number, _delta: number): void {
    if (!this.localSprite) return;

    let vx = 0;
    let vy = 0;
    if (!this.movementLocked) {
      if (this.cursors.left?.isDown || this.keyA.isDown) vx -= 1;
      if (this.cursors.right?.isDown || this.keyD.isDown) vx += 1;
      if (this.cursors.up?.isDown || this.keyW.isDown) vy -= 1;
      if (this.cursors.down?.isDown || this.keyS.isDown) vy += 1;
    }

    if (vx !== 0 && vy !== 0) {
      const inv = 1 / Math.SQRT2;
      vx *= inv;
      vy *= inv;
    }

    const body = this.localSprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED);

    const moving = vx !== 0 || vy !== 0;
    if (moving) {
      let next: Facing = this.facing;
      if (Math.abs(vy) >= Math.abs(vx)) next = vy < 0 ? 'up' : 'down';
      else next = vx < 0 ? 'left' : 'right';
      this.facing = next;
      this.playAnim(this.localSprite, `player-walk-${next}`);
    } else {
      this.playAnim(this.localSprite, `player-idle-${this.facing}`);
    }

    // Depth = y para z-ordering correto entre players e fogueira
    this.localSprite.setDepth(this.localSprite.y);
    this.localLabel.setPosition(this.localSprite.x, this.localSprite.y - 50);
    this.localLabel.setDepth(this.localSprite.y + 1);

    for (const [, r] of this.remoteSprites) {
      const dx = r.targetX - r.sprite.x;
      const dy = r.targetY - r.sprite.y;
      const moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
      r.sprite.x += dx * 0.2;
      r.sprite.y += dy * 0.2;
      r.sprite.setDepth(r.sprite.y);
      r.label.setPosition(r.sprite.x, r.sprite.y - 50);
      r.label.setDepth(r.sprite.y + 1);
      if (moved) this.playAnim(r.sprite, `player-walk-${r.facing}`);
      else this.playAnim(r.sprite, `player-idle-${r.facing}`);
    }

    this.animateBonfire(time);
    this.maybeEmitMove(time);
    this.updateNearestTarget();
  }

  // ============== CENÁRIO ==============
  private drawGround(): void {
    // Cor base (clareira de noite — verde-musgo escuro)
    const g = this.add.graphics();
    g.fillStyle(0x1a2418, 1);
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    g.setDepth(-100);

    // Padrão de hexágonos sutil para textura
    g.fillStyle(0xffffff, 0.02);
    for (let y = 0; y < WORLD_H; y += 40) {
      for (let x = 0; x < WORLD_W; x += 40) {
        if ((Math.floor(x / 40) + Math.floor(y / 40)) % 2 === 0) {
          g.fillRect(x, y, 20, 20);
        }
      }
    }

    // Halo de luz da fogueira (gradient fake com círculos concêntricos)
    const halo = this.add.graphics();
    halo.setDepth(-99);
    for (let r = 320; r > 60; r -= 16) {
      const t = (r - 60) / (320 - 60);
      const alpha = 0.04 * (1 - t);
      halo.fillStyle(0xf3c54a, alpha);
      halo.fillCircle(BONFIRE_X, BONFIRE_Y, r);
    }
  }

  private drawClearingDecor(): void {
    // Bordas de mata (faixas escuras nas 4 bordas)
    const g = this.add.graphics();
    g.setDepth(-50);
    const BORDER = 60;
    g.fillStyle(0x080c08, 1);
    g.fillRect(0, 0, WORLD_W, BORDER);
    g.fillRect(0, WORLD_H - BORDER, WORLD_W, BORDER);
    g.fillRect(0, 0, BORDER, WORLD_H);
    g.fillRect(WORLD_W - BORDER, 0, BORDER, WORLD_H);

    // Pontos esparsos (arbustos/pedras) — círculos escuros
    const decor = this.add.graphics();
    const seed = 13;
    let r = seed;
    for (let i = 0; i < 40; i++) {
      r = (r * 9301 + 49297) % 233280;
      const px = BORDER + 20 + ((r >> 4) % (WORLD_W - BORDER * 2 - 40));
      r = (r * 9301 + 49297) % 233280;
      const py = BORDER + 20 + ((r >> 4) % (WORLD_H - BORDER * 2 - 40));
      // Não desenhar perto da fogueira
      const dx = px - BONFIRE_X;
      const dy = py - BONFIRE_Y;
      if (Math.hypot(dx, dy) < 140) continue;
      decor.fillStyle(0x111810, 1);
      decor.fillCircle(px, py + 4, 12);
      decor.fillStyle(0x182218, 1);
      decor.fillCircle(px, py, 10);
      decor.setDepth(py);
    }
  }

  private drawBonfire(): void {
    // Pedras da base (cinza escuro, anel)
    const stones = this.add.graphics();
    stones.setDepth(BONFIRE_Y - 20);
    stones.fillStyle(0x3a3a44, 1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const sx = BONFIRE_X + Math.cos(a) * 32;
      const sy = BONFIRE_Y + Math.sin(a) * 14 + 18;
      stones.fillEllipse(sx, sy, 18, 12);
    }

    // Toras cruzadas (marrom escuro)
    const logs = this.add.graphics();
    logs.setDepth(BONFIRE_Y - 10);
    logs.fillStyle(0x4a2a14, 1);
    logs.fillRect(BONFIRE_X - 26, BONFIRE_Y + 4, 52, 8);
    logs.fillStyle(0x6f4324, 1);
    logs.fillRect(BONFIRE_X - 4, BONFIRE_Y - 14, 8, 28);

    // Chamas — graphic atualizado por frame em update()
    this.bonfireFlame = this.add.graphics();
    this.bonfireFlame.setDepth(BONFIRE_Y);
  }

  private animateBonfire(time: number): void {
    this.flameTime = time;
    const g = this.bonfireFlame;
    g.clear();

    const phase = (time / 100) % (Math.PI * 2);
    const pulse = Math.sin(phase) * 2 + Math.sin(phase * 2.3) * 1;

    // Chama externa (laranja)
    g.fillStyle(0xf3c54a, 0.5);
    g.fillEllipse(BONFIRE_X, BONFIRE_Y - 14, 30 + pulse, 38 + pulse);
    // Chama média (laranja vibrante)
    g.fillStyle(0xf06a1a, 0.85);
    g.fillEllipse(BONFIRE_X, BONFIRE_Y - 16, 22 + pulse * 0.7, 30 + pulse);
    // Núcleo amarelo
    g.fillStyle(0xfff1b8, 0.95);
    g.fillEllipse(BONFIRE_X, BONFIRE_Y - 18, 12, 18 + pulse * 0.5);
    // Faísca topo (variando)
    if (Math.sin(phase * 5) > 0.6) {
      g.fillStyle(0xfff1b8, 0.9);
      g.fillCircle(BONFIRE_X + Math.sin(phase * 7) * 6, BONFIRE_Y - 30 - pulse * 2, 1.5);
    }
  }

  // ============== PLAYERS ==============
  private spawnLocalPlayer(): void {
    const spawn = this.spawnPositionForUser(this.localUserId);
    this.localSprite = this.physics.add.sprite(spawn.x, spawn.y, 'player-idle-down', 0);
    this.localSprite.setScale(PLAYER_SCALE);
    this.localSprite.setTint(characterService.getSkin().tint);
    const body = this.localSprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(16, 10);
    body.setOffset((PLAYER_SPRITE_W - 16) / 2, 60);
    body.setCollideWorldBounds(true);
    this.localSprite.anims.play('player-idle-down');

    this.localLabel = this.add
      .text(spawn.x, spawn.y - 50, this.localUsername, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#d4a017',
        backgroundColor: 'rgba(6,7,17,0.7)',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5);
  }

  /** Posiciona players ao redor da fogueira em pontos distintos por hash do userId. */
  private spawnPositionForUser(userId: string): { x: number; y: number } {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
    const angle = (hash % 360) * (Math.PI / 180);
    const radius = 140 + (hash % 40);
    return {
      x: BONFIRE_X + Math.cos(angle) * radius,
      y: BONFIRE_Y + Math.sin(angle) * radius,
    };
  }

  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keyW = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyE = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyF = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.keyQ = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q);

    // Edge-trigger (justDown) pra evitar repetição enquanto a tecla é segurada
    this.keyE.on('down', () => this.handleActionKey('E'));
    this.keyF.on('down', () => this.handleActionKey('F'));
    this.keyQ.on('down', () => this.handleActionKey('Q'));
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.startFollow(this.localSprite, true, CAMERA_LERP, CAMERA_LERP);
    cam.setDeadzone(CAMERA_DEADZONE, CAMERA_DEADZONE);
    cam.setZoom(CAMERA_ZOOM);
    cam.setBackgroundColor(PALETTE.bgDeep);
  }

  private playAnim(sprite: Phaser.GameObjects.Sprite, key: string): void {
    if (sprite.anims.currentAnim?.key !== key) sprite.anims.play(key, true);
  }

  // ============== EMIT MOVE ==============
  private maybeEmitMove(time: number): void {
    if (time - this.lastEmit < MOVE_THROTTLE_MS) return;
    const pct = this.toPercent(this.localSprite.x, this.localSprite.y);
    if (Math.abs(pct.x - this.lastEmittedX) < 0.1 && Math.abs(pct.y - this.lastEmittedY) < 0.1) return;
    this.lastEmit = time;
    this.lastEmittedX = pct.x;
    this.lastEmittedY = pct.y;
    const payload: GameMovePayload = { x: pct.x, y: pct.y };
    socketService.emit('game:move', payload);
  }

  private toPercent(px: number, py: number): { x: number; y: number } {
    return { x: (px / WORLD_W) * 100, y: (py / WORLD_H) * 100 };
  }

  private toPixel(pctX: number, pctY: number): { x: number; y: number } {
    return { x: (pctX / 100) * WORLD_W, y: (pctY / 100) * WORLD_H };
  }

  // ============== REMOTE PLAYERS ==============
  private applyPlayersState(data: GamePlayersStateEvent): void {
    for (const pos of data.positions) {
      if (pos.userId === this.localUserId) continue;
      this.ensureRemoteSprite(pos.userId);
      const r = this.remoteSprites.get(pos.userId);
      if (r) {
        const pix = this.toPixel(pos.x, pos.y);
        r.targetX = pix.x;
        r.targetY = pix.y;
        r.sprite.x = pix.x;
        r.sprite.y = pix.y;
      }
    }
  }

  private applyRemoteMove(data: GamePlayerMovedEvent): void {
    if (data.userId === this.localUserId) return;
    this.ensureRemoteSprite(data.userId);
    const r = this.remoteSprites.get(data.userId);
    if (!r) return;
    const pix = this.toPixel(data.x, data.y);
    const dx = pix.x - r.targetX;
    const dy = pix.y - r.targetY;
    r.targetX = pix.x;
    r.targetY = pix.y;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      let next: Facing = r.facing;
      if (Math.abs(dy) >= Math.abs(dx)) next = dy < 0 ? 'up' : 'down';
      else next = dx < 0 ? 'left' : 'right';
      r.facing = next;
    }
  }

  private ensureRemoteSprite(userId: string): void {
    if (this.remoteSprites.has(userId)) return;
    const player = this.players.get(userId);
    const username = player?.username ?? userId.slice(0, 6);
    const skinId = (player?.character?.name ?? '').toString();
    const spawn = this.spawnPositionForUser(userId);
    const sprite = this.add.sprite(spawn.x, spawn.y, 'player-idle-down', 0);
    sprite.setScale(PLAYER_SCALE);
    sprite.setTint(getSkin(skinId).tint);
    sprite.anims.play('player-idle-down');

    const label = this.add
      .text(spawn.x, spawn.y - 50, username, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#e8e2d0',
        backgroundColor: 'rgba(6,7,17,0.7)',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5);
    this.remoteSprites.set(userId, {
      sprite,
      label,
      username,
      facing: 'down',
      targetX: spawn.x,
      targetY: spawn.y,
      alive: true,
    });
  }

  private removeRemoteSprite(userId: string): void {
    const r = this.remoteSprites.get(userId);
    if (!r) return;
    r.sprite.destroy();
    r.label.destroy();
    this.remoteSprites.delete(userId);
  }

  // ============== PHASE / TELEPORT ==============
  private applyPhaseChange(data: MafiaPhaseChangedEvent): void {
    this.currentPhase = data.phase;
    log.info('WorldScene: phase change', { phase: data.phase, day: data.dayNumber });
    if (data.phase === 'DAY_DISCUSSION') {
      // Discussão: todos teleportados pra fogueira + lock (foco no chat/discussão)
      this.gatherAtBonfire();
    } else if (data.phase === 'VOTING') {
      // Votação: teleporta de volta pra fogueira mas LIBERA movimento
      // (precisa caminhar até o alvo + apertar [E])
      this.gatherAtBonfire();
      this.movementLocked = false;
    } else {
      // NIGHT, ROLE_ASSIGNMENT etc — movimento livre
      this.movementLocked = false;
    }
    // Prompt é atualizado a cada frame em update() via updateNearestTarget()
  }

  // Raio de proximidade pra "interagir"
  private static readonly TARGET_RADIUS = 80;
  private static readonly BONFIRE_RADIUS = 110;

  /** Ação NOTURNA (proximidade): só Lobisomem/Vidente. Aldeão e dia: null. */
  private nightAbilityForRole(): {
    actionType: MafiaActionType;
    primaryKey: 'F' | 'Q';
    verb: string;
  } | null {
    if (this.currentPhase !== 'NIGHT') return null;
    if (!this.alive.has(this.localUserId)) return null;
    const role = (this.myRole ?? '').toLowerCase();
    if (role.includes('werewolf') || role.includes('lobisomem') || role === 'werewolf') {
      return { actionType: 'KILL', primaryKey: 'F', verb: 'matar' };
    }
    if (role.includes('seer') || role.includes('vidente')) {
      return { actionType: 'CHECK', primaryKey: 'Q', verb: 'investigar' };
    }
    return null;
  }

  /** Distância do player local até a fogueira. */
  private distanceToBonfire(): number {
    return Phaser.Math.Distance.Between(this.localSprite.x, this.localSprite.y, BONFIRE_X, BONFIRE_Y);
  }

  private isNearBonfire(): boolean {
    return this.distanceToBonfire() < WorldScene.BONFIRE_RADIUS;
  }

  /** Recalcula highlight + prompt a cada frame. */
  private updateNearestTarget(): void {
    if (this.voteMenuOpen) {
      this.actionPrompt.setVisible(false);
      return;
    }

    const nightAction = this.nightAbilityForRole();

    // VOTING: prompt na fogueira
    if (this.currentPhase === 'VOTING' && this.alive.has(this.localUserId)) {
      this.clearTargetHighlight();
      this.targetUserId = null;
      if (this.isNearBonfire()) {
        this.actionPrompt.setText('[E] votar   ·   [Q] pular voto');
      } else {
        this.actionPrompt.setText('aproxime-se da fogueira para votar');
      }
      this.actionPrompt.setVisible(true);
      return;
    }

    // NIGHT: proximidade do alvo (Lobo/Vidente)
    if (nightAction) {
      let nearestId: string | null = null;
      let nearestDist = WorldScene.TARGET_RADIUS;
      for (const [userId, r] of this.remoteSprites) {
        if (!r.alive) continue;
        if (userId === this.localUserId) continue;
        const d = Phaser.Math.Distance.Between(this.localSprite.x, this.localSprite.y, r.sprite.x, r.sprite.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearestId = userId;
        }
      }
      if (nearestId !== this.targetUserId) {
        this.clearTargetHighlight();
        this.targetUserId = nearestId;
        if (nearestId) {
          const r = this.remoteSprites.get(nearestId);
          if (r) {
            r.sprite.setTint(0xffd870);
            r.label.setColor('#ffd870');
          }
        }
      }
      const targetName = nearestId ? this.players.get(nearestId)?.username ?? nearestId.slice(0, 6) : null;
      this.actionPrompt.setText(
        targetName
          ? `[${nightAction.primaryKey}] ${nightAction.verb} ${targetName}`
          : `aproxime-se de um jogador para [${nightAction.primaryKey}] ${nightAction.verb}`,
      );
      this.actionPrompt.setVisible(true);
      return;
    }

    // Sem ação disponível
    this.clearTargetHighlight();
    this.targetUserId = null;
    this.actionPrompt.setVisible(false);
  }

  private clearTargetHighlight(): void {
    if (!this.targetUserId) return;
    const prev = this.remoteSprites.get(this.targetUserId);
    if (prev) {
      prev.sprite.clearTint();
      prev.label.setColor('#e8e2d0');
    }
  }

  private handleActionKey(key: 'E' | 'F' | 'Q'): void {
    if (this.voteMenuOpen) {
      // Menu aberto consome E/Q? Não — fechamos em ESC; deixamos as teclas pra menu (gerenciado lá)
      return;
    }
    if (!this.alive.has(this.localUserId)) return;

    // VOTING — interação com a fogueira
    if (this.currentPhase === 'VOTING') {
      if (!this.isNearBonfire()) return;
      if (key === 'E') {
        this.openVoteMenu();
        return;
      }
      if (key === 'Q') {
        socketService.emit('mafia:skip_vote');
        this.actionPrompt.setText('✓ voto pulado');
        soundManager.playSfx('click');
        return;
      }
      return;
    }

    // NIGHT — ability por proximidade (Lobo/Vidente)
    const nightAction = this.nightAbilityForRole();
    if (!nightAction) return;
    if (key !== nightAction.primaryKey) return;
    if (!this.targetUserId) return;

    const targetId = this.targetUserId;
    const targetName = this.players.get(targetId)?.username ?? targetId.slice(0, 6);
    const payload: MafiaUseAbilityPayload = { actionType: nightAction.actionType, targetId };
    socketService.emit('mafia:use_ability', payload);
    const verbDone = nightAction.actionType === 'KILL' ? 'Alvo marcado pra morrer' : 'Investigando';
    this.actionPrompt.setText(`✓ ${verbDone}: ${targetName}`);
    soundManager.playSfx('select');
  }

  // ============== VOTE MENU (overlay Phaser, fixo na câmera) ==============
  private voteMenuOpen = false;
  private voteMenuContainer?: Phaser.GameObjects.Container;

  private openVoteMenu(): void {
    if (this.voteMenuOpen) return;
    this.voteMenuOpen = true;
    soundManager.playSfx('slide');
    const cam = this.cameras.main;
    const W = cam.width;
    const H = cam.height;

    const c = this.add.container(0, 0);
    c.setScrollFactor(0);
    c.setDepth(2500);
    this.voteMenuContainer = c;

    // Backdrop
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.78);
    bg.fillRect(0, 0, W, H);

    // Card central
    const cardW = 360;
    const alivePlayers = Array.from(this.players.values()).filter(
      (p) => this.alive.has(p.userId) && p.userId !== this.localUserId,
    );
    const lineH = 36;
    const cardH = 110 + alivePlayers.length * lineH + 60;
    const cardX = (W - cardW) / 2;
    const cardY = (H - cardH) / 2;

    const card = this.add.graphics();
    card.fillStyle(0x14141c, 1);
    card.fillRoundedRect(cardX, cardY, cardW, cardH, 12);
    card.lineStyle(2, 0xd4a017, 0.9);
    card.strokeRoundedRect(cardX, cardY, cardW, cardH, 12);

    const title = this.add
      .text(W / 2, cardY + 24, 'EM QUEM VOCÊ VOTA?', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#d4a017',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);

    const subtitle = this.add
      .text(W / 2, cardY + 50, 'Linchar o jogador escolhido', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#8a8aa6',
      })
      .setOrigin(0.5, 0);

    c.add([bg, card, title, subtitle]);

    // Botões dos players
    let cursorY = cardY + 84;
    for (const p of alivePlayers) {
      const row = this.add.container(W / 2, cursorY + lineH / 2);
      const rowBg = this.add.graphics();
      rowBg.fillStyle(0x0e0e16, 1);
      rowBg.fillRoundedRect(-cardW / 2 + 16, -lineH / 2 + 4, cardW - 32, lineH - 8, 6);
      rowBg.lineStyle(1, 0x2a2a3a, 1);
      rowBg.strokeRoundedRect(-cardW / 2 + 16, -lineH / 2 + 4, cardW - 32, lineH - 8, 6);

      const name = this.add
        .text(0, 0, p.username, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#e8e2d0',
        })
        .setOrigin(0.5);

      row.add([rowBg, name]);
      row.setSize(cardW - 32, lineH - 8);
      row.setInteractive({ useHandCursor: true });
      row.on('pointerover', () => {
        rowBg.clear();
        rowBg.fillStyle(0x1f1f2a, 1);
        rowBg.fillRoundedRect(-cardW / 2 + 16, -lineH / 2 + 4, cardW - 32, lineH - 8, 6);
        rowBg.lineStyle(1, 0xd4a017, 1);
        rowBg.strokeRoundedRect(-cardW / 2 + 16, -lineH / 2 + 4, cardW - 32, lineH - 8, 6);
        name.setColor('#d4a017');
      });
      row.on('pointerout', () => {
        rowBg.clear();
        rowBg.fillStyle(0x0e0e16, 1);
        rowBg.fillRoundedRect(-cardW / 2 + 16, -lineH / 2 + 4, cardW - 32, lineH - 8, 6);
        rowBg.lineStyle(1, 0x2a2a3a, 1);
        rowBg.strokeRoundedRect(-cardW / 2 + 16, -lineH / 2 + 4, cardW - 32, lineH - 8, 6);
        name.setColor('#e8e2d0');
      });
      row.on('pointerdown', () => {
        const payload: MafiaVotePayload = { targetId: p.userId };
        socketService.emit('mafia:vote', payload);
        this.actionPrompt.setText(`✓ Voto registrado em ${p.username}`);
        soundManager.playSfx('select');
        this.closeVoteMenu();
      });

      c.add(row);
      cursorY += lineH;
    }

    // Skip e cancel
    const skip = this.add
      .text(W / 2 - 72, cardY + cardH - 28, '[ PULAR VOTO ]', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#8a8aa6',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    skip.on('pointerdown', () => {
      socketService.emit('mafia:skip_vote');
      this.actionPrompt.setText('✓ voto pulado');
      soundManager.playSfx('click');
      this.closeVoteMenu();
    });

    const cancel = this.add
      .text(W / 2 + 72, cardY + cardH - 28, '[ CANCELAR · ESC ]', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#5a5a72',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    cancel.on('pointerdown', () => {
      soundManager.playSfx('slide');
      this.closeVoteMenu();
    });

    c.add([skip, cancel]);

    // ESC fecha
    const escHandler = () => {
      soundManager.playSfx('slide');
      this.closeVoteMenu();
    };
    this.input.keyboard?.once('keydown-ESC', escHandler);

    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 160 });
  }

  private closeVoteMenu(): void {
    if (!this.voteMenuOpen) return;
    this.voteMenuOpen = false;
    const c = this.voteMenuContainer;
    if (c) {
      this.tweens.add({
        targets: c,
        alpha: 0,
        duration: 140,
        onComplete: () => c.destroy(),
      });
    }
    this.voteMenuContainer = undefined;
  }

  private applyPlayerDied(data: MafiaPlayerDiedEvent): void {
    this.alive.delete(data.playerId);
    if (data.playerId === this.localUserId) {
      // Local morreu: pode mexer (modo fantasma) — sem lock
      this.movementLocked = false;
    }
    const r = this.remoteSprites.get(data.playerId);
    if (r) {
      r.alive = false;
      r.sprite.setTint(0x555566);
      r.sprite.setAlpha(0.5);
      r.label.setColor('#5a5a72');
    } else if (data.playerId === this.localUserId) {
      this.localSprite.setTint(0x555566);
      this.localSprite.setAlpha(0.5);
      this.localLabel.setColor('#5a5a72');
    }
  }

  /** Teleporta o player local pra perto da fogueira e bloqueia movimento (discussão). */
  private gatherAtBonfire(): void {
    if (!this.localSprite) return;
    let hash = 0;
    for (let i = 0; i < this.localUserId.length; i++) {
      hash = (hash * 31 + this.localUserId.charCodeAt(i)) >>> 0;
    }
    const angle = (hash % 360) * (Math.PI / 180);
    const radius = 70 + (hash % 20);
    const x = BONFIRE_X + Math.cos(angle) * radius;
    const y = BONFIRE_Y + Math.sin(angle) * radius;

    this.localSprite.setPosition(x, y);
    const body = this.localSprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.movementLocked = true;

    // Voltar a olhar pra fogueira
    const dx = BONFIRE_X - x;
    const dy = BONFIRE_Y - y;
    if (Math.abs(dx) > Math.abs(dy)) this.facing = dx < 0 ? 'left' : 'right';
    else this.facing = dy < 0 ? 'up' : 'down';
    this.playAnim(this.localSprite, `player-idle-${this.facing}`);

    // Forçar emit imediato pro server (ignora throttle)
    this.lastEmit = 0;
    this.lastEmittedX = -1;
    this.lastEmittedY = -1;
  }

  // ============== SOCKET WIRE ==============
  private wireSocket(): void {
    socketService.on<GamePlayersStateEvent>('game:players_state', this.onPlayersState);
    socketService.on<GamePlayerMovedEvent>('game:player_moved', this.onPlayerMoved);
    socketService.on<{ userId: string }>('room:player_left', this.onPlayerLeft);
    socketService.on<MafiaPhaseChangedEvent>('mafia:phase_changed', this.onPhaseChanged);
    socketService.on<MafiaRoleAssignedEvent>('mafia:role_assigned', this.onRoleAssigned);
    socketService.on<MafiaPlayerDiedEvent>('mafia:player_died', this.onPlayerDied);
  }

  private unwireSocket(): void {
    socketService.off('game:players_state', this.onPlayersState);
    socketService.off('game:player_moved', this.onPlayerMoved);
    socketService.off('room:player_left', this.onPlayerLeft);
    socketService.off('mafia:phase_changed', this.onPhaseChanged);
    socketService.off('mafia:role_assigned', this.onRoleAssigned);
    socketService.off('mafia:player_died', this.onPlayerDied);
  }

  private tearDown(): void {
    this.unwireSocket();
    for (const [id] of this.remoteSprites) this.removeRemoteSprite(id);
    this.scene.stop('Hud');
  }
}
