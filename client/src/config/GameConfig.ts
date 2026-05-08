import Phaser from 'phaser';

// Resolução base 16:9; Phaser escala para 1080p/1440p via Scale.FIT
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

// Player — Adventurer pack (96x80 com padding pra animação de attack)
export const PLAYER_SPRITE_W = 96;
export const PLAYER_SPRITE_H = 80;
export const PLAYER_SCALE = 1.1;
export const PLAYER_SPEED = 140;
export const PLAYER_BODY_W = 16;
export const PLAYER_BODY_H = 10;
export const PLAYER_BODY_OFFSET_Y = 60;

// Câmera
export const CAMERA_LERP = 0.12;
export const CAMERA_DEADZONE = 80;
export const CAMERA_ZOOM = 1.5;

// Mundo (WorldScene) — clareira walkable
export const WORLD_W = 1280;
export const WORLD_H = 800;
export const BONFIRE_X = WORLD_W / 2;
export const BONFIRE_Y = WORLD_H / 2;
export const MOVE_THROTTLE_MS = 50;

// Socket — backend é o servicoFrontendSocket compartilhado (porta default 3001)
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001';

// Storage local (apenas token de sessão; estado do jogo é server-authoritative)
export const STORAGE_TOKEN_KEY = 'fp:token';
export const STORAGE_USERNAME_KEY = 'fp:username';

// Lobby — cenários (bg + linha de chão pra ancorar o personagem)
// groundRatio = 0..1 da altura do bg onde fica o "chão" (0=topo, 1=base).
// Cada imagem tem sua própria linha — ajustar empiricamente por arte.
export interface BgScenario {
  id: string;
  url: string;
  textureKey: string;
  groundRatio: number;
}
export const BG_SCENARIOS: BgScenario[] = [
  { id: '1', url: '/assets/bg/lobby_01.png', textureKey: 'lobby-bg-1', groundRatio: 0.92 },
  { id: '2', url: '/assets/bg/lobby_02.png', textureKey: 'lobby-bg-2', groundRatio: 0.92 },
  { id: '3', url: '/assets/bg/lobby_03.webp', textureKey: 'lobby-bg-3', groundRatio: 0.92 },
  { id: '4', url: '/assets/bg/lobby_04.png', textureKey: 'lobby-bg-4', groundRatio: 0.92 },
  { id: '5', url: '/assets/bg/lobby_05.png', textureKey: 'lobby-bg-5', groundRatio: 0.92 },
];

// Paleta dark fantasy (alinhada com silence-project: gold/blood/midnight)
export const PALETTE = {
  // backgrounds
  bgDeep: 0x060711,
  bgMid: 0x14141c,
  bgSoft: 0x1f1f2a,
  // gold (uiAccent)
  goldDark: 0x9c7211,
  goldMid: 0xd4a017,
  goldLight: 0xf3c54a,
  // blood
  bloodDark: 0x7a1e1e,
  bloodMid: 0xc53030,
  bloodLight: 0xe85a5a,
  // text
  textPrimary: 0xe8e2d0,
  textMuted: 0x8a8aa6,
  // player (placeholder enquanto skins reais não chegam)
  playerOutline: 0x261a13,
  playerSkin: 0xf2c79c,
  playerHair: 0x3a261a,
} as const;

export const phaserGameConfigBase: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  transparent: true,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  roundPixels: true,
  scale: {
    // RESIZE: canvas ocupa 100% da viewport em qualquer aspect ratio.
    // GAME_WIDTH/HEIGHT viram apenas referência inicial; cenas devem usar
    // `this.scale.width/height` pra posicionamento responsivo.
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: '100%',
    height: '100%',
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  render: {
    antialias: false,
    pixelArt: true,
    powerPreference: 'high-performance',
  },
  fps: {
    target: 60,
    forceSetTimeOut: false,
  },
  banner: {
    hidePhaser: false,
  },
};
