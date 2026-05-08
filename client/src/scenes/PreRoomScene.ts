import Phaser from 'phaser';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  PALETTE,
  PLAYER_SCALE,
  PLAYER_SPEED,
  PLAYER_SPRITE_W,
} from '@/config/GameConfig';
import { getSkin } from '@/config/Skins';
import { characterService } from '@/services/CharacterService';
import type {
  PreroomLobbyStateEvent,
  PreroomMovePayload,
  PreroomPlayerMovedEvent,
  RoomErrorEvent,
  RoomGameStartedEvent,
  RoomPlayer,
  RoomPlayerJoinedEvent,
  RoomPlayerLeftEvent,
  RoomReadyUpdatedEvent,
  RoomSummary,
} from '@/events/socket.events';
import { socketService } from '@/services/SocketService';
import { overlayManager } from '@/utils/OverlayManager';
import { log } from '@/utils/Logger';

const ARENA_PADDING = 40;
const MOVE_THROTTLE_MS = 50;
const FACINGS = ['down', 'up', 'left', 'right'] as const;
type Facing = (typeof FACINGS)[number];

type PreRoomInitData = {
  room: RoomSummary;
};

type RemotePlayerSprite = {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  username: string;
  facing: Facing;
  targetX: number;
  targetY: number;
};

/**
 * PreRoomScene — sala de espera walkable.
 *
 * - Player local: WASD/setas (movimento livre dentro da arena).
 * - Coords no socket são percentagem 0-100 (especificação do LobbyMovementHandler).
 * - Throttle 50ms para emitir `preroom:move`.
 * - Outros players sincronizados via `preroom:player_moved` + `preroom:lobby_state`.
 * - Header HUD em Phaser: nome da sala, lista de players, botão Ready/Start, botão Sair.
 */
export class PreRoomScene extends Phaser.Scene {
  private room!: RoomSummary;
  private players = new Map<string, RoomPlayer>();
  private remoteSprites = new Map<string, RemotePlayerSprite>();
  private localUserId!: string;
  private localUsername!: string;
  private isHost = false;

  private localSprite!: Phaser.Physics.Arcade.Sprite;
  private localLabel!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;

  private headerText!: Phaser.GameObjects.Text;
  private playerListText!: Phaser.GameObjects.Text;
  private actionButton!: Phaser.GameObjects.Container;
  private actionLabel!: Phaser.GameObjects.Text;
  private leaveButton!: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;

  private arenaBounds!: { x: number; y: number; w: number; h: number };
  private lastEmit = 0;
  private lastEmittedX = -1;
  private lastEmittedY = -1;
  private facing: Facing = 'down';
  private isReady = false;

  // Bound socket handlers
  private onLobbyState = (data: PreroomLobbyStateEvent) => this.applyLobbyState(data);
  private onPlayerMoved = (data: PreroomPlayerMovedEvent) => this.applyRemoteMove(data);
  private onPlayerJoined = (data: RoomPlayerJoinedEvent) => this.handlePlayerJoined(data);
  private onPlayerLeft = (data: RoomPlayerLeftEvent) => this.handlePlayerLeft(data);
  private onReadyUpdated = (data: RoomReadyUpdatedEvent) => this.handleReadyUpdated(data);
  private onGameStarted = (data: RoomGameStartedEvent) => this.handleGameStarted(data);
  private onRoomError = (data: RoomErrorEvent) => this.showStatus(data.message, true);

  constructor() {
    super('PreRoom');
  }

  init(data: PreRoomInitData): void {
    this.room = data.room;
    const user = socketService.getCurrentUser();
    if (!user) throw new Error('PreRoomScene: no current user');
    this.localUserId = user.userId;
    this.localUsername = user.username;
    this.isHost = this.room.hostId === this.localUserId;
    for (const p of this.room.players) this.players.set(p.userId, p);
    const me = this.players.get(this.localUserId);
    this.isReady = me?.isReady ?? false;
  }

  create(): void {
    overlayManager.hideAll();
    overlayManager.hideWorldBg();
    overlayManager.showCanvas();
    this.cameras.main.fadeIn(250, 0, 0, 0);
    this.cameras.main.setBackgroundColor(PALETTE.bgMid);

    this.computeArenaBounds();
    this.drawArena();
    this.drawHeader();
    this.drawSidebar();
    this.drawActionButtons();

    this.spawnLocalPlayer();
    this.setupInput();
    this.refreshSidebar();

    this.wireSocket();
    socketService.emit('preroom:get_state');

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.tearDown());
  }

  override update(time: number): void {
    if (!this.localSprite) return;

    let vx = 0;
    let vy = 0;
    if (this.cursors.left?.isDown || this.keyA.isDown) vx -= 1;
    if (this.cursors.right?.isDown || this.keyD.isDown) vx += 1;
    if (this.cursors.up?.isDown || this.keyW.isDown) vy -= 1;
    if (this.cursors.down?.isDown || this.keyS.isDown) vy += 1;

    if (vx !== 0 && vy !== 0) {
      const inv = 1 / Math.SQRT2;
      vx *= inv;
      vy *= inv;
    }

    const body = this.localSprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED);

    const moving = vx !== 0 || vy !== 0;
    let next: Facing = this.facing;
    if (moving) {
      if (Math.abs(vy) >= Math.abs(vx)) next = vy < 0 ? 'up' : 'down';
      else next = vx < 0 ? 'left' : 'right';
      this.facing = next;
      this.playAnim(this.localSprite, `player-walk-${next}`);
    } else {
      this.playAnim(this.localSprite, `player-idle-${this.facing}`);
    }

    this.localLabel.setPosition(this.localSprite.x, this.localSprite.y - 50);

    // Interpola sprites remotos (suavização)
    for (const [, r] of this.remoteSprites) {
      const dx = r.targetX - r.sprite.x;
      const dy = r.targetY - r.sprite.y;
      r.sprite.x += dx * 0.2;
      r.sprite.y += dy * 0.2;
      r.label.setPosition(r.sprite.x, r.sprite.y - 50);
    }

    this.maybeEmitMove(time);
  }

  // ============== ARENA ==============
  private computeArenaBounds(): void {
    const HEADER_H = 80;
    const SIDEBAR_W = 220;
    this.arenaBounds = {
      x: ARENA_PADDING,
      y: HEADER_H + ARENA_PADDING / 2,
      w: GAME_WIDTH - SIDEBAR_W - ARENA_PADDING * 1.5,
      h: GAME_HEIGHT - HEADER_H - ARENA_PADDING - 60,
    };
  }

  private drawArena(): void {
    const { x, y, w, h } = this.arenaBounds;
    const g = this.add.graphics();
    g.fillStyle(PALETTE.bgSoft, 1);
    g.fillRect(x, y, w, h);
    g.lineStyle(1, PALETTE.goldDark, 0.6);
    g.strokeRect(x, y, w, h);

    // Padrão de chão sutil
    g.fillStyle(0xffffff, 0.02);
    for (let i = 0; i < w; i += 32) {
      for (let j = 0; j < h; j += 32) {
        if ((i / 32 + j / 32) % 2 === 0) g.fillRect(x + i, y + j, 32, 32);
      }
    }

    this.physics.world.setBounds(x, y, w, h);
  }

  private drawHeader(): void {
    const g = this.add.graphics();
    g.fillStyle(PALETTE.bgDeep, 0.9);
    g.fillRect(0, 0, GAME_WIDTH, 80);
    g.lineStyle(1, PALETTE.goldDark, 0.4);
    g.lineBetween(0, 80, GAME_WIDTH, 80);

    this.headerText = this.add
      .text(20, 18, this.room.name, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#d4a017',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);

    this.add
      .text(20, 44, `${this.room.gameMode.toUpperCase()} · ${this.isHost ? 'VOCÊ É O HOST' : 'aguardando host iniciar'}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#8a8aa6',
      })
      .setOrigin(0, 0);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, 58, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#8a8aa6',
      })
      .setOrigin(0.5, 0.5);
  }

  private drawSidebar(): void {
    const x = GAME_WIDTH - 200;
    const y = 100;
    const w = 180;
    const h = GAME_HEIGHT - 180;

    const g = this.add.graphics();
    g.fillStyle(PALETTE.bgDeep, 0.85);
    g.fillRect(x, y, w, h);
    g.lineStyle(1, PALETTE.goldDark, 0.4);
    g.strokeRect(x, y, w, h);

    this.add
      .text(x + 10, y + 10, 'JOGADORES', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#d4a017',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);

    this.playerListText = this.add
      .text(x + 10, y + 32, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#e8e2d0',
        lineSpacing: 4,
      })
      .setOrigin(0, 0);
  }

  private drawActionButtons(): void {
    const cx = GAME_WIDTH - 110;

    this.actionButton = this.makeButton(cx, GAME_HEIGHT - 70, 160, 32, this.actionButtonLabel(), () => this.handleAction());
    this.actionLabel = this.actionButton.getAt(1) as Phaser.GameObjects.Text;

    this.leaveButton = this.makeButton(cx, GAME_HEIGHT - 30, 160, 24, '× SAIR', () => this.handleLeave(), 0xe85a5a);
  }

  private makeButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    onClick: () => void,
    color: number = PALETTE.goldMid,
  ): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#14141c',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    c.add([bg, text]);
    c.setSize(w, h).setInteractive({ useHandCursor: true });
    c.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(color, 0.85);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    });
    c.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    });
    c.on('pointerdown', onClick);
    return c;
  }

  // ============== LOCAL PLAYER ==============
  private spawnLocalPlayer(): void {
    const { x, y, w, h } = this.arenaBounds;
    const startX = x + w / 2;
    const startY = y + h / 2;

    this.localSprite = this.physics.add.sprite(startX, startY, 'player-idle-down', 0);
    this.localSprite.setScale(PLAYER_SCALE);
    this.localSprite.setDepth(10);
    this.localSprite.setTint(characterService.getSkin().tint);
    const body = this.localSprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(16, 10);
    body.setOffset((PLAYER_SPRITE_W - 16) / 2, 60);
    body.setCollideWorldBounds(true);
    this.localSprite.anims.play('player-idle-down');

    this.localLabel = this.add
      .text(startX, startY - 50, this.localUsername, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#d4a017',
        backgroundColor: 'rgba(6,7,17,0.6)',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5);
    this.localLabel.setDepth(11);
  }

  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keyW = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
  }

  private playAnim(sprite: Phaser.GameObjects.Sprite, key: string): void {
    if (sprite.anims.currentAnim?.key !== key) sprite.anims.play(key, true);
  }

  // ============== MOVE EMIT ==============
  private maybeEmitMove(time: number): void {
    if (time - this.lastEmit < MOVE_THROTTLE_MS) return;
    const pct = this.toPercent(this.localSprite.x, this.localSprite.y);
    if (Math.abs(pct.x - this.lastEmittedX) < 0.1 && Math.abs(pct.y - this.lastEmittedY) < 0.1) return;
    this.lastEmit = time;
    this.lastEmittedX = pct.x;
    this.lastEmittedY = pct.y;
    const payload: PreroomMovePayload = { x: pct.x, y: pct.y };
    socketService.emit('preroom:move', payload);
  }

  private toPercent(px: number, py: number): { x: number; y: number } {
    const { x, y, w, h } = this.arenaBounds;
    return {
      x: ((px - x) / w) * 100,
      y: ((py - y) / h) * 100,
    };
  }

  private toPixel(pctX: number, pctY: number): { x: number; y: number } {
    const { x, y, w, h } = this.arenaBounds;
    return {
      x: x + (pctX / 100) * w,
      y: y + (pctY / 100) * h,
    };
  }

  // ============== REMOTE PLAYERS ==============
  private applyLobbyState(data: PreroomLobbyStateEvent): void {
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

  private applyRemoteMove(data: PreroomPlayerMovedEvent): void {
    if (data.userId === this.localUserId) return;
    this.ensureRemoteSprite(data.userId);
    const r = this.remoteSprites.get(data.userId);
    if (!r) return;
    const pix = this.toPixel(data.x, data.y);
    const prevX = r.targetX;
    const prevY = r.targetY;
    r.targetX = pix.x;
    r.targetY = pix.y;
    const dx = pix.x - prevX;
    const dy = pix.y - prevY;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      let next: Facing = r.facing;
      if (Math.abs(dy) >= Math.abs(dx)) next = dy < 0 ? 'up' : 'down';
      else next = dx < 0 ? 'left' : 'right';
      r.facing = next;
      this.playAnim(r.sprite, `player-walk-${next}`);
    } else {
      this.playAnim(r.sprite, `player-idle-${r.facing}`);
    }
  }

  private ensureRemoteSprite(userId: string): void {
    if (this.remoteSprites.has(userId)) return;
    const player = this.players.get(userId);
    const username = player?.username ?? userId.slice(0, 6);
    const skinId = (player?.character?.name ?? '').toString();
    const { x, y, w, h } = this.arenaBounds;
    const sprite = this.add.sprite(x + w / 2, y + h / 2, 'player-idle-down', 0);
    sprite.setScale(PLAYER_SCALE);
    sprite.setDepth(9);
    sprite.setTint(getSkin(skinId).tint);
    sprite.anims.play('player-idle-down');
    const label = this.add
      .text(sprite.x, sprite.y - 50, username, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#e8e2d0',
        backgroundColor: 'rgba(6,7,17,0.6)',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.remoteSprites.set(userId, {
      sprite,
      label,
      username,
      facing: 'down',
      targetX: sprite.x,
      targetY: sprite.y,
    });
  }

  private removeRemoteSprite(userId: string): void {
    const r = this.remoteSprites.get(userId);
    if (!r) return;
    r.sprite.destroy();
    r.label.destroy();
    this.remoteSprites.delete(userId);
  }

  // ============== ROOM EVENT HANDLERS ==============
  private handlePlayerJoined(data: RoomPlayerJoinedEvent): void {
    this.players.set(data.player.userId, data.player);
    this.refreshSidebar();
    this.showStatus(`${data.player.username} entrou.`);
  }

  private handlePlayerLeft(data: RoomPlayerLeftEvent): void {
    this.players.delete(data.userId);
    this.removeRemoteSprite(data.userId);
    // host pode ter mudado
    this.room = data.room;
    this.isHost = data.room.hostId === this.localUserId;
    this.refreshSidebar();
    this.showStatus(`${data.username} ${data.kicked ? 'foi expulso' : 'saiu'}.`);
    this.updateActionButton();
  }

  private handleReadyUpdated(data: RoomReadyUpdatedEvent): void {
    const player = this.players.get(data.userId);
    if (player) player.isReady = data.isReady;
    if (data.userId === this.localUserId) this.isReady = data.isReady;
    this.refreshSidebar();
    this.updateActionButton();
  }

  private handleGameStarted(_data: RoomGameStartedEvent): void {
    log.info('PreRoomScene: game started, going to World');
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('World', { room: this.room });
    });
  }

  // ============== ACTION BUTTON ==============
  private actionButtonLabel(): string {
    if (this.isHost) return '▶ INICIAR JOGO';
    return this.isReady ? '✓ PRONTO' : 'MARCAR PRONTO';
  }

  private updateActionButton(): void {
    this.actionLabel.setText(this.actionButtonLabel());
  }

  private handleAction(): void {
    if (this.isHost) {
      socketService.emit('room:start');
      this.showStatus('Iniciando…');
    } else {
      socketService.emit('room:toggle_ready');
    }
  }

  private handleLeave(): void {
    socketService.emit('room:leave');
    this.scene.start('Lobby');
  }

  // ============== SIDEBAR ==============
  private refreshSidebar(): void {
    const lines: string[] = [];
    for (const [, p] of this.players) {
      const isHost = p.userId === this.room.hostId;
      const tag = isHost ? '[H]' : p.isReady ? '[R]' : '[ ]';
      const me = p.userId === this.localUserId ? ' (você)' : '';
      lines.push(`${tag} ${p.username}${me}`);
    }
    this.playerListText.setText(lines.join('\n'));
  }

  private showStatus(msg: string, isError = false): void {
    this.statusText.setText(msg);
    this.statusText.setColor(isError ? '#e85a5a' : '#8a8aa6');
  }

  // ============== SOCKET WIRE ==============
  private wireSocket(): void {
    socketService.on<PreroomLobbyStateEvent>('preroom:lobby_state', this.onLobbyState);
    socketService.on<PreroomPlayerMovedEvent>('preroom:player_moved', this.onPlayerMoved);
    socketService.on<RoomPlayerJoinedEvent>('room:player_joined', this.onPlayerJoined);
    socketService.on<RoomPlayerLeftEvent>('room:player_left', this.onPlayerLeft);
    socketService.on<RoomReadyUpdatedEvent>('room:ready_updated', this.onReadyUpdated);
    socketService.on<RoomGameStartedEvent>('room:game_started', this.onGameStarted);
    socketService.on<RoomErrorEvent>('room:error', this.onRoomError);
  }

  private unwireSocket(): void {
    socketService.off('preroom:lobby_state', this.onLobbyState);
    socketService.off('preroom:player_moved', this.onPlayerMoved);
    socketService.off('room:player_joined', this.onPlayerJoined);
    socketService.off('room:player_left', this.onPlayerLeft);
    socketService.off('room:ready_updated', this.onReadyUpdated);
    socketService.off('room:game_started', this.onGameStarted);
    socketService.off('room:error', this.onRoomError);
  }

  private tearDown(): void {
    this.unwireSocket();
    for (const [id] of this.remoteSprites) this.removeRemoteSprite(id);
  }
}
