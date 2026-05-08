import Phaser from 'phaser';
import { BG_SCENARIOS, type BgScenario } from '@/config/GameConfig';
import { SKINS } from '@/config/Skins';
import type {
  AchievementUnlockedEvent,
  RoomCreatedResult,
  RoomCreatePayload,
  RoomErrorEvent,
  RoomJoinedResult,
  RoomListResult,
  RoomSummary,
} from '@/events/socket.events';
import { characterService } from '@/services/CharacterService';
import { friendsService } from '@/services/FriendsService';
import { settingsService } from '@/services/SettingsService';
import { shopService } from '@/services/ShopService';
import { socketService } from '@/services/SocketService';
import { soundManager } from '@/services/SoundManager';
import { friendsPanel } from '@/utils/FriendsPanel';
import { overlayManager } from '@/utils/OverlayManager';
import { profilePanel } from '@/utils/ProfilePanel';
import { settingsPanel } from '@/utils/SettingsPanel';
import { shopPanel } from '@/utils/ShopPanel';
import { log } from '@/utils/Logger';

const BG_KEY = 'fp:bgLobby';
// Sprite tem 80px de altura no frame mas os pés ficam em y≈70 (10px de padding pra anim attack).
// Origin Y = 70/80 = 0.875 ancora pelos pés, não pelo fundo do frame.
const PLAYER_FEET_ORIGIN = 0.875;
// Personagem sempre ocupa ~55% da altura do canvas (escala dinâmica nearest-neighbor).
// Resolve "personagem pequeno em 1080p" sem perder qualidade — escala por inteiro.
const PLAYER_TARGET_HEIGHT_RATIO = 0.55;
const PLAYER_MIN_SCALE = 4;
const PLAYER_BASELINE_SCALE = 7; // referência da sombra (170x38 em scale 7)

/**
 * LobbyScene — UI em HTML overlay (#hub-overlay), Phaser desenha bg + personagem.
 *
 * Estilo: dark fantasy estilo Wolvesville + silence-project Next.js.
 * Bg = Phaser.Image cover-fit no canvas. Personagem = Phaser.Sprite ancorado
 * na linha de chão da imagem (groundRatio por cenário) — não flutua nem desalinha
 * em resoluções diferentes porque o ground se move junto com o bg renderizado.
 */
export class LobbyScene extends Phaser.Scene {
  // === Phaser objects (canvas) ===
  private bgImage?: Phaser.GameObjects.Image;
  private playerSprite?: Phaser.GameObjects.Sprite;
  private playerShadow?: Phaser.GameObjects.Ellipse;
  private playerNameText?: Phaser.GameObjects.Text;
  private playerTagText?: Phaser.GameObjects.Text;
  private currentScenario: BgScenario = BG_SCENARIOS[0]!;
  private resizeHandler = () => this.layoutScene();

  // === HTML refs ===
  private playBtn!: HTMLElement;
  private createRoomBtn!: HTMLElement;
  private settingsBtn!: HTMLElement;
  private logoutBtn!: HTMLButtonElement;
  private muteBtn!: HTMLButtonElement;
  private muteIconOn!: HTMLElement;
  private muteIconOff!: HTMLElement;
  private userInfoBlock!: HTMLElement;
  private usernameEl!: HTMLElement;
  private friendsBtn!: HTMLElement;
  private friendsBadge!: HTMLElement;
  private shopBtn!: HTMLElement;
  private hubCoinsEl!: HTMLElement;
  private sideToggleBtn!: HTMLElement;
  private sidePanel!: HTMLElement;
  private bgOptions!: NodeListOf<HTMLElement>;
  private skinOptionsContainer!: HTMLElement;
  private skinNameLabel!: HTMLElement;
  private skinOptions: HTMLElement[] = [];
  private disabledPanels!: NodeListOf<HTMLElement>;
  private unsubscribeSettings?: () => void;
  private unsubscribeCharacter?: () => void;
  private unsubscribeFriends?: () => void;
  private unsubscribeFriendNotif?: () => void;
  private unsubscribeBalance?: () => void;
  private unsubscribeOwned?: () => void;

  // Lobby (lista de salas) refs
  private overlay!: HTMLElement;
  private roomsContainer!: HTMLElement;
  private statusEl!: HTMLElement;
  private usernameOverlayEl!: HTMLElement;
  private closeBtn!: HTMLButtonElement;
  private refreshBtn!: HTMLButtonElement;
  private createBtn!: HTMLButtonElement;

  // Modal refs
  private modal!: HTMLElement;
  private modalForm!: HTMLFormElement;
  private modalNameInput!: HTMLInputElement;
  private modalMaxInput!: HTMLSelectElement;
  private modalDescInput!: HTMLInputElement;
  private modalPrivateInput!: HTMLInputElement;
  private modalCancelBtn!: HTMLButtonElement;
  private modalSubmitBtn!: HTMLButtonElement;
  private modalErrorEl!: HTMLElement;

  private joining = false;

  // Bound handlers
  private boundPlay = () => {
    soundManager.unlock();
    soundManager.playSfx('select');
    this.openRoomList();
  };
  private boundCreateRoom = () => {
    soundManager.unlock();
    soundManager.playSfx('select');
    this.openRoomList();
    this.openModal();
  };
  private boundSettings = () => {
    soundManager.unlock();
    settingsPanel.open();
  };
  private boundLogout = () => this.handleLogout();
  private boundMute = () => this.toggleQuickMute();
  private boundOpenProfile = () => {
    soundManager.unlock();
    profilePanel.open();
  };
  private boundOpenFriends = () => {
    soundManager.unlock();
    soundManager.playSfx('select');
    friendsPanel.open();
  };
  private boundOpenShop = () => {
    soundManager.unlock();
    soundManager.playSfx('select');
    shopPanel.open();
  };
  private boundDisabledPanel = (e: Event) => {
    soundManager.playSfx('click');
    const labelEl = (e.currentTarget as HTMLElement).childNodes[0];
    const label = labelEl?.textContent?.trim() ?? 'Esta seção';
    this.showToast(`${label} chegará em breve.`);
  };
  private boundSideToggle = () => {
    soundManager.playSfx('slide');
    this.toggleSidePanel();
  };
  private boundBgSelect = (e: Event) => {
    soundManager.playSfx('click');
    const id = (e.currentTarget as HTMLElement).dataset.bg ?? '1';
    this.setBg(id);
  };
  private boundEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !overlayManager.isVisible('lobby-overlay')) this.openRoomList();
  };
  private boundClose = () => this.closeRoomList();
  private boundRefresh = () => this.requestRoomList();
  private boundOpenModal = () => this.openModal();
  private boundCloseModal = () => this.closeModal();
  private boundSubmitModal = (e: Event) => {
    e.preventDefault();
    void this.handleCreateRoom();
  };
  private onRoomList = (data: RoomListResult) => this.renderRooms(data.rooms);
  private onRoomListUpdate = (data: RoomListResult) => this.renderRooms(data.rooms);
  private onRoomCreated = (data: RoomCreatedResult) => this.enterPreRoom(data.room);
  private onRoomJoined = (data: RoomJoinedResult) => this.enterPreRoom(data.room);
  private onRoomError = (data: RoomErrorEvent) => this.showStatus(data.message, true);
  private onAchievementUnlocked = (data: AchievementUnlockedEvent) => {
    for (const ach of data.achievements ?? []) {
      this.showToast(`🏆 Conquista desbloqueada: ${ach.emoji} ${ach.name}`, 4000);
    }
    soundManager.playSfx('select', 0.9);
  };

  constructor() {
    super('Lobby');
  }

  create(): void {
    // Canvas Phaser visível: desenha bg cover-fit + personagem ancorado no chão.
    // #world-bg fica oculto (canvas tem seu próprio bg).
    overlayManager.showCanvas();
    overlayManager.hideWorldBg();
    this.cameras.main.setBackgroundColor('#060711');

    this.buildScene();
    this.bindHubOverlay();
    this.bindRoomsOverlay();
    this.bindModal();
    this.wireSocket();

    overlayManager.showOnly('hub-overlay');
    this.scale.on('resize', this.resizeHandler);

    // BGM do lobby (Adventure por padrão). Toca se musicEnabled; ignora se mutado.
    soundManager.playMusic('adventure', { loop: true, fade: true });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.tearDown());
  }


  // ============================================================
  // CANVAS — bg cover-fit + personagem ancorado no chão
  // ============================================================
  private buildScene(): void {
    // Source of truth: SettingsService (sincroniza com backend). Cache local é fallback.
    const fromSettings = String(settingsService.get().bgLobby);
    const savedId = fromSettings || localStorage.getItem(BG_KEY) || '1';
    this.currentScenario = BG_SCENARIOS.find((s) => s.id === savedId) ?? BG_SCENARIOS[0]!;

    this.bgImage = this.add.image(0, 0, this.currentScenario.textureKey).setOrigin(0.5, 0.5);
    // Sombra elíptica nos pés do personagem (mesmo Y que o sprite, abaixo do bg do groundY)
    this.playerShadow = this.add.ellipse(0, 0, 170, 38, 0x000000, 0.5).setOrigin(0.5, 2.5);
    if (this.textures.exists('player-idle-down')) {
      this.playerSprite = this.add
        .sprite(0, 0, 'player-idle-down', 0)
        .setOrigin(0.5, PLAYER_FEET_ORIGIN);
      // Escala aplicada em layoutScene (depende da altura do canvas)
      this.playerSprite.anims.play('player-idle-down');
    }
    // Nome + tag flutuando acima do personagem (renderizado no canvas pra acompanhar a posição)
    this.playerNameText = this.add
      .text(0, 0, 'Aventureiro', {
        fontFamily: 'Scrubland, Cinzel, serif',
        fontSize: '32px',
        color: '#e8b94a',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5, -3)
      .setShadow(0, 2, '#000000', 8, true, true);
    this.playerTagText = this.add
      .text(0, 0, 'Sussurros do Bosque', {
        fontFamily: 'Kanit, sans-serif',
        fontSize: '13px',
        color: '#8a8aa6',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, -7);
    this.layoutScene();
  }

  /** Aplica cover-fit no bg + reposiciona player/shadow no chão do bg. */
  private layoutScene(): void {
    if (!this.bgImage) return;
    const w = this.scale.width;
    const h = this.scale.height;
    const tex = this.textures.get(this.currentScenario.textureKey).getSourceImage();
    const tw = (tex as { width: number }).width;
    const th = (tex as { height: number }).height;
    if (!tw || !th) return;

    // Cover-fit: scale = max(w/tw, h/th) — preenche canvas, corta sobras
    const scale = Math.max(w / tw, h / th);
    this.bgImage.setScale(scale);
    this.bgImage.setPosition(w / 2, h / 2);

    // Linha de chão = topo do bg renderizado + groundRatio * altura renderizada
    const renderedH = th * scale;
    const renderedTopY = h / 2 - renderedH / 2;
    const groundY = renderedTopY + renderedH * this.currentScenario.groundRatio;

    // Escala dinâmica do personagem: ~55% da altura do canvas, em inteiros (crisp pixel art)
    const visibleSourceH = 80 * PLAYER_FEET_ORIGIN; // ≈70 px do sprite onde está o personagem
    const targetH = h * PLAYER_TARGET_HEIGHT_RATIO;
    const sprScale = Math.max(PLAYER_MIN_SCALE, Math.floor(targetH / visibleSourceH));

    if (this.playerSprite) {
      this.playerSprite.setScale(sprScale);
      this.playerSprite.setPosition(w / 2, groundY);
    }
    if (this.playerShadow) {
      // Sombra acompanha proporcionalmente o tamanho do sprite
      const shadowFactor = sprScale / PLAYER_BASELINE_SCALE;
      this.playerShadow.setScale(shadowFactor);
      this.playerShadow.setPosition(w / 2, groundY);
    }
    // Nome/tag acima da cabeça do personagem
    const visibleHeight = visibleSourceH * sprScale;
    const headY = groundY - visibleHeight - 8;
    if (this.playerTagText) {
      this.playerTagText.setPosition(w / 2, headY);
    }
    if (this.playerNameText) {
      this.playerNameText.setPosition(w / 2, headY - (this.playerTagText?.height ?? 14) - 2);
    }
  }


  // ============================================================
  // HUB OVERLAY (HTML)
  // ============================================================
  private bindHubOverlay(): void {
    this.playBtn = document.getElementById('hub-play')!;
    this.createRoomBtn = document.getElementById('hub-create-room')!;
    this.settingsBtn = document.getElementById('hub-settings')!;
    this.logoutBtn = document.getElementById('hub-logout') as HTMLButtonElement;
    this.muteBtn = document.getElementById('hub-mute') as HTMLButtonElement;
    this.muteIconOn = document.getElementById('hub-mute-icon-on')!;
    this.muteIconOff = document.getElementById('hub-mute-icon-off')!;
    this.userInfoBlock = document.getElementById('hub-user-info')!;
    this.usernameEl = document.getElementById('hub-username')!;
    this.friendsBtn = document.getElementById('hub-friends')!;
    this.friendsBadge = document.getElementById('hub-friends-badge')!;
    this.shopBtn = document.getElementById('hub-shop')!;
    this.hubCoinsEl = document.getElementById('hub-coins')!;
    this.sideToggleBtn = document.getElementById('hub-side-toggle')!;
    this.sidePanel = document.getElementById('hub-side-panel')!;
    this.bgOptions = document.querySelectorAll<HTMLElement>('.hub-bg-option');
    this.skinOptionsContainer = document.getElementById('hub-skin-options')!;
    this.skinNameLabel = document.getElementById('hub-skin-name')!;
    // FUNÇÕES continua disabled; CONFIGURAÇÕES vira ativo (filtra esse do disabled-list)
    this.disabledPanels = document.querySelectorAll<HTMLElement>('.hub-action.disabled');

    // Constrói skin cards a partir do registry
    this.buildSkinPicker();

    // Painéis HTML idempotentes
    settingsPanel.attach();
    profilePanel.attach();
    friendsPanel.attach();
    shopPanel.setToastFn((msg, dur) => this.showToast(msg, dur));
    shopPanel.attach();

    const user = socketService.getCurrentUser();
    const username = user?.username ?? 'Viajante';
    this.usernameEl.textContent = username;
    if (this.playerNameText) this.playerNameText.setText(username);
    this.layoutScene();

    // Marca opção ativa do bg salvo (canvas já foi configurado em buildScene)
    for (const opt of this.bgOptions) {
      opt.classList.toggle('active', opt.dataset.bg === this.currentScenario.id);
    }

    this.playBtn.addEventListener('click', this.boundPlay);
    this.createRoomBtn.addEventListener('click', this.boundCreateRoom);
    this.settingsBtn.addEventListener('click', this.boundSettings);
    this.logoutBtn.addEventListener('click', this.boundLogout);
    this.muteBtn.addEventListener('click', this.boundMute);
    this.userInfoBlock.addEventListener('click', this.boundOpenProfile);
    this.friendsBtn.addEventListener('click', this.boundOpenFriends);
    this.shopBtn.addEventListener('click', this.boundOpenShop);
    this.sideToggleBtn.addEventListener('click', this.boundSideToggle);
    for (const opt of this.bgOptions) opt.addEventListener('click', this.boundBgSelect);
    for (const panel of this.disabledPanels) panel.addEventListener('click', this.boundDisabledPanel);
    document.addEventListener('keydown', this.boundEnter);

    // Sync ícone de mute com o estado real de áudio
    this.unsubscribeSettings = settingsService.subscribe((s) => {
      const fullyMuted = !s.musicEnabled && !s.soundEnabled;
      this.muteBtn.classList.toggle('muted', fullyMuted);
      this.muteIconOn.style.display = fullyMuted ? 'none' : '';
      this.muteIconOff.style.display = fullyMuted ? '' : 'none';
    });

    // Aplica skin atual no sprite + atualiza UI quando muda
    this.unsubscribeCharacter = characterService.subscribe((skin) => {
      if (this.playerSprite) this.playerSprite.setTint(skin.tint);
      this.skinNameLabel.textContent = skin.label;
      for (const opt of this.skinOptions) {
        opt.classList.toggle('active', opt.dataset.skin === skin.id);
      }
    });

    // Marca cadeado nas skins não desbloqueadas (atualiza ao comprar)
    this.unsubscribeOwned = characterService.subscribeOwned((ownedIds) => {
      for (const opt of this.skinOptions) {
        const id = opt.dataset.skin ?? '';
        opt.classList.toggle('locked', !ownedIds.has(id));
      }
    });

    // Badge no botão AMIGOS = pedidos pendentes
    this.unsubscribeFriends = friendsService.subscribe((s) => {
      const count = s.pending.length;
      if (count > 0) {
        this.friendsBadge.textContent = String(count);
        this.friendsBadge.style.display = '';
      } else {
        this.friendsBadge.style.display = 'none';
      }
    });

    // Toast nos push events de amizade
    this.unsubscribeFriendNotif = friendsService.onNotification((msg) => {
      this.showToast(msg);
      soundManager.playSfx('select', 0.7);
    });

    // Saldo real no topbar (substitui o "0" hardcoded)
    this.unsubscribeBalance = shopService.subscribeBalance((b) => {
      this.hubCoinsEl.textContent = String(b.coins);
    });
  }

  private buildSkinPicker(): void {
    this.skinOptionsContainer.innerHTML = '';
    this.skinOptions = [];
    for (const skin of SKINS) {
      const card = document.createElement('div');
      card.className = 'hub-skin-option';
      card.dataset.skin = skin.id;
      card.style.background = skin.cssColor;
      card.title = skin.label;
      card.addEventListener('click', () => {
        soundManager.playSfx('click');
        // Locked → abre Shop direto na aba Skins (cadeado vira convite de compra)
        if (!characterService.isOwned(skin.id)) {
          this.showToast(`${skin.label} bloqueada — compre na loja.`);
          shopPanel.open('skins');
          return;
        }
        void characterService.setSkin(skin.id);
      });
      this.skinOptionsContainer.appendChild(card);
      this.skinOptions.push(card);
    }
  }

  private setBg(id: string): void {
    const scenario = BG_SCENARIOS.find((s) => s.id === id) ?? BG_SCENARIOS[0]!;
    this.currentScenario = scenario;
    localStorage.setItem(BG_KEY, scenario.id);
    if (this.bgImage) this.bgImage.setTexture(scenario.textureKey);
    this.layoutScene();
    for (const opt of this.bgOptions) {
      opt.classList.toggle('active', opt.dataset.bg === scenario.id);
    }
    // Sincroniza com backend (SettingsService espera number)
    const numericId = Number.parseInt(scenario.id, 10);
    if (Number.isFinite(numericId)) settingsService.update({ bgLobby: numericId });
  }

  /** Quick-mute global (botão speaker no topbar). Toggle entre tudo-on / tudo-off. */
  private toggleQuickMute(): void {
    soundManager.unlock();
    const s = settingsService.get();
    const isMuted = !s.musicEnabled && !s.soundEnabled;
    if (isMuted) {
      // Restaura ambos
      settingsService.update({ musicEnabled: true, soundEnabled: true });
      soundManager.playSfx('click');
    } else {
      // Muta tudo
      settingsService.update({ musicEnabled: false, soundEnabled: false });
    }
  }

  private toggleSidePanel(): void {
    const open = this.sidePanel.classList.toggle('open');
    this.sideToggleBtn.classList.toggle('active', open);
  }

  private showToast(msg: string, durationMs = 2200): void {
    const t = document.createElement('div');
    t.className = 'hub-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), durationMs + 250);
  }

  // ============================================================
  // ROOM LIST OVERLAY
  // ============================================================
  private bindRoomsOverlay(): void {
    this.overlay = document.getElementById('lobby-overlay')!;
    this.roomsContainer = document.getElementById('lobby-rooms')!;
    this.statusEl = document.getElementById('lobby-status')!;
    this.usernameOverlayEl = document.getElementById('lobby-username')!;
    this.closeBtn = document.getElementById('lobby-close') as HTMLButtonElement;
    this.refreshBtn = document.getElementById('lobby-refresh') as HTMLButtonElement;
    this.createBtn = document.getElementById('lobby-create') as HTMLButtonElement;

    this.closeBtn.addEventListener('click', this.boundClose);
    this.refreshBtn.addEventListener('click', this.boundRefresh);
    this.createBtn.addEventListener('click', this.boundOpenModal);
  }

  private bindModal(): void {
    this.modal = document.getElementById('room-modal')!;
    this.modalForm = document.getElementById('room-modal-form') as HTMLFormElement;
    this.modalNameInput = document.getElementById('room-name') as HTMLInputElement;
    this.modalMaxInput = document.getElementById('room-max-players') as HTMLSelectElement;
    this.modalDescInput = document.getElementById('room-description') as HTMLInputElement;
    this.modalPrivateInput = document.getElementById('room-private') as HTMLInputElement;
    this.modalCancelBtn = document.getElementById('room-modal-cancel') as HTMLButtonElement;
    this.modalSubmitBtn = document.getElementById('room-modal-submit') as HTMLButtonElement;
    this.modalErrorEl = document.getElementById('room-modal-error')!;

    this.modalCancelBtn.addEventListener('click', this.boundCloseModal);
    this.modalForm.addEventListener('submit', this.boundSubmitModal);
  }

  private openRoomList(): void {
    overlayManager.showOnly('lobby-overlay');
    this.usernameOverlayEl.textContent = socketService.getCurrentUser()?.username ?? '?';
    this.requestRoomList();
  }

  private closeRoomList(): void {
    this.closeModal();
    overlayManager.showOnly('hub-overlay');
  }

  private openModal(): void {
    overlayManager.show('room-modal');
    this.modalErrorEl.classList.remove('visible');
    this.modalErrorEl.textContent = '';
    this.modalNameInput.focus();
  }

  private closeModal(): void {
    overlayManager.hide('room-modal');
    this.modalForm.reset();
  }

  // ============================================================
  // SOCKET WIRE
  // ============================================================
  private wireSocket(): void {
    socketService.on<RoomListResult>('room:list', this.onRoomList);
    socketService.on<RoomListResult>('room:list:update', this.onRoomListUpdate);
    socketService.on<RoomCreatedResult>('room:created', this.onRoomCreated);
    socketService.on<RoomJoinedResult>('room:joined', this.onRoomJoined);
    socketService.on<RoomErrorEvent>('room:error', this.onRoomError);
    socketService.on<AchievementUnlockedEvent>('achievement_unlocked', this.onAchievementUnlocked);
  }

  private unwireSocket(): void {
    socketService.off('room:list', this.onRoomList);
    socketService.off('room:list:update', this.onRoomListUpdate);
    socketService.off('room:created', this.onRoomCreated);
    socketService.off('room:joined', this.onRoomJoined);
    socketService.off('room:error', this.onRoomError);
    socketService.off('achievement_unlocked', this.onAchievementUnlocked);
  }

  private requestRoomList(): void {
    this.showStatus('Buscando salas…');
    socketService.emit('room:list');
  }

  private async handleCreateRoom(): Promise<void> {
    const name = this.modalNameInput.value.trim();
    if (name.length < 3) {
      this.showModalError('Nome precisa ter ao menos 3 caracteres.');
      return;
    }
    const maxPlayers = Number.parseInt(this.modalMaxInput.value, 10);
    const description = this.modalDescInput.value.trim();
    const isPrivate = this.modalPrivateInput.checked;
    const payload: RoomCreatePayload = {
      name,
      maxPlayers,
      isPrivate,
      description,
      gameMode: 'classic',
    };
    this.modalSubmitBtn.disabled = true;
    this.showStatus('Criando sala…');
    socketService.emit('room:create', payload);
  }

  private renderRooms(rooms: RoomSummary[]): void {
    this.roomsContainer.innerHTML = '';
    if (rooms.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'lobby-empty';
      empty.textContent = 'Nenhuma sala disponível. Que tal criar a primeira?';
      this.roomsContainer.appendChild(empty);
      this.showStatus('Nenhuma sala pública.');
      return;
    }
    for (const room of rooms) {
      const card = document.createElement('div');
      card.className = 'room-card';
      card.dataset.roomId = room.id;
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = room.name;
      const meta = document.createElement('div');
      meta.className = 'meta';
      const host = document.createElement('span');
      host.className = 'host';
      const hostPlayer = room.players.find((p) => p.userId === room.hostId);
      host.textContent = `Host: ${hostPlayer?.username ?? '?'}`;
      const count = document.createElement('span');
      count.textContent = `${room.playerCount}/${room.maxPlayers}`;
      meta.appendChild(host);
      meta.appendChild(count);
      const desc = document.createElement('div');
      desc.className = 'desc';
      desc.textContent = room.description || '—';
      card.appendChild(name);
      card.appendChild(meta);
      card.appendChild(desc);
      card.addEventListener('click', () => this.joinRoom(room.id));
      this.roomsContainer.appendChild(card);
    }
    this.showStatus(`${rooms.length} sala(s) disponível(eis).`);
  }

  private joinRoom(roomId: string): void {
    if (this.joining) return;
    this.joining = true;
    this.showStatus('Entrando na sala…');
    socketService.emit('room:join', { roomId });
  }

  private enterPreRoom(room: RoomSummary): void {
    log.info('LobbyScene: entering preroom', { roomId: room.id, name: room.name });
    this.modalSubmitBtn.disabled = false;
    this.closeModal();
    overlayManager.hideAll();
    // Para BGM do lobby (gameplay terá track própria depois)
    soundManager.stopMusic(true);
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('PreRoom', { room });
    });
  }

  private handleLogout(): void {
    soundManager.playSfx('click');
    soundManager.stopMusic(true);
    socketService.clearToken();
    socketService.disconnect();
    overlayManager.hideAll();
    overlayManager.hideCanvas();
    this.scene.start('Login');
  }

  private showStatus(msg: string, isError = false): void {
    this.statusEl.textContent = msg;
    this.statusEl.className = isError ? 'lobby-status error' : 'lobby-status';
    if (isError) {
      this.modalSubmitBtn.disabled = false;
      this.joining = false;
    }
  }

  private showModalError(msg: string): void {
    this.modalErrorEl.textContent = msg;
    this.modalErrorEl.classList.add('visible');
  }

  private tearDown(): void {
    this.scale.off('resize', this.resizeHandler);
    if (this.unsubscribeSettings) this.unsubscribeSettings();
    if (this.unsubscribeCharacter) this.unsubscribeCharacter();
    if (this.unsubscribeFriends) this.unsubscribeFriends();
    if (this.unsubscribeFriendNotif) this.unsubscribeFriendNotif();
    if (this.unsubscribeBalance) this.unsubscribeBalance();
    if (this.unsubscribeOwned) this.unsubscribeOwned();
    this.playBtn.removeEventListener('click', this.boundPlay);
    this.createRoomBtn.removeEventListener('click', this.boundCreateRoom);
    this.settingsBtn.removeEventListener('click', this.boundSettings);
    this.logoutBtn.removeEventListener('click', this.boundLogout);
    this.muteBtn.removeEventListener('click', this.boundMute);
    this.userInfoBlock.removeEventListener('click', this.boundOpenProfile);
    this.friendsBtn.removeEventListener('click', this.boundOpenFriends);
    this.shopBtn.removeEventListener('click', this.boundOpenShop);
    this.sideToggleBtn.removeEventListener('click', this.boundSideToggle);
    for (const opt of this.bgOptions) opt.removeEventListener('click', this.boundBgSelect);
    for (const panel of this.disabledPanels) panel.removeEventListener('click', this.boundDisabledPanel);
    document.removeEventListener('keydown', this.boundEnter);
    this.closeBtn.removeEventListener('click', this.boundClose);
    this.refreshBtn.removeEventListener('click', this.boundRefresh);
    this.createBtn.removeEventListener('click', this.boundOpenModal);
    this.modalCancelBtn.removeEventListener('click', this.boundCloseModal);
    this.modalForm.removeEventListener('submit', this.boundSubmitModal);
    this.unwireSocket();
    overlayManager.hideAll();
  }
}
