import Phaser from 'phaser';

// Resolução base: 960x540 (16:9, escala bem pra 1080p e 1440p)
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

// Tile size — Tiny Swords usa 64x64
export const TILE_SIZE = 64;

// World size (mapa inicial) — meadow.json é 20x14 = 1280x896 pixels
export const MAP_TILES_W = 20;
export const MAP_TILES_H = 14;

// Player — Adventurer pack: frame 96x80 com padding pra animação de attack.
// O personagem real ocupa ~16x32 no centro do frame. PLAYER_SCALE escala visualmente.
export const PLAYER_SPRITE_W = 96;
export const PLAYER_SPRITE_H = 80;
export const PLAYER_SCALE = 1.1; // 2x nearest-neighbor: nítido em pixel art; personagem efetivo ~32x64
export const PLAYER_SPEED = 140;
// Body em coords do sprite NÃO escalado (Phaser escala depois junto com o sprite).
// Centrado horizontalmente, ancorado nos pés (perto da base do frame).
export const PLAYER_BODY_W = 16;
export const PLAYER_BODY_H = 10;
export const PLAYER_BODY_OFFSET_Y = 60;

// Câmera
export const CAMERA_LERP = 0.12;
export const CAMERA_DEADZONE = 80;
export const CAMERA_ZOOM = 1.5; // 1.5x → ~21 tiles visíveis horizontalmente

// Interação
export const INTERACT_RADIUS = 36;

// Paleta cozy hand-drawn (inspirada em Sprout Lands / Mystic Woods)
// Cada elemento tem 3-4 tons (deep/dark/mid/light/highlight) pra simular pintura à mão.
export const PALETTE = {
  // grama
  grassDeep: 0x6b9a55,
  grassMid: 0x86b56a,
  grassLight: 0xa5cf86,
  grassHighlight: 0xc0e2a3,
  // terra / caminhos
  pathDark: 0x8e6a3e,
  pathMid: 0xb5895c,
  pathLight: 0xd3ad7c,
  // água
  waterDeep: 0x2f7790,
  waterMid: 0x4ba0bd,
  waterLight: 0x6dc2d8,
  waterFoam: 0xe6f6f7,
  // pedras
  stoneOutline: 0x4a4a52,
  stoneDark: 0x6e6e7a,
  stoneMid: 0x9a9aa6,
  stoneLight: 0xc5c5cf,
  // árvores
  treeOutline: 0x1f3a1a,
  treeTrunkDark: 0x4a2a14,
  treeTrunkLight: 0x6f4324,
  treeTrunkHighlight: 0x8f5d36,
  treeLeavesDeep: 0x274d22,
  treeLeavesDark: 0x3d6d2e,
  treeLeavesMid: 0x528d3c,
  treeLeavesLight: 0x6fad52,
  treeLeavesHighlight: 0x9fcf72,
  // flores
  flowerPink: 0xe88aa3,
  flowerPinkDark: 0xb8627d,
  flowerYellow: 0xf2cd5b,
  flowerYellowDark: 0xc99e2c,
  flowerWhite: 0xf5f0dc,
  flowerCenter: 0xf2c542,
  // ponte de madeira (toras)
  woodOutline: 0x3a2210,
  woodDark: 0x6a3f1e,
  woodMid: 0x8c5a32,
  woodLight: 0xb88456,
  woodHighlight: 0xd7a673,
  // penhasco (face de terra/areia)
  cliffOutline: 0x4a3520,
  cliffDark: 0x856038,
  cliffMid: 0xa6814f,
  cliffLight: 0xc9a576,
  cliffHighlight: 0xe2c190,
  // moeda
  coinDark: 0xc18a1a,
  coinGold: 0xf3c54a,
  coinShine: 0xfff1b8,
  // ui
  uiBg: 0x1a1f1a,
  uiBgSoft: 0x2d3a2d,
  uiText: 0xe8e2d0,
  uiAccent: 0xd9b262,
  uiHeart: 0xd25a5a,
  uiHeartDark: 0xa03c3c,
  uiHeartHighlight: 0xff8a8a,
  uiHeartEmpty: 0x3a3030,
  // player
  playerOutline: 0x261a13,
  playerSkin: 0xf2c79c,
  playerSkinShade: 0xc99772,
  playerShirt: 0xeae0c7, // camisa branca/bege como referência
  playerShirtShade: 0xb5ad96,
  playerSash: 0xa84f3c, // sash vermelho
  playerPants: 0x6f4e2a,
  playerPantsShade: 0x4a341c,
  playerBoots: 0x3a261a,
  playerHair: 0x3a261a,
  playerHairHighlight: 0x5e3e25,
} as const;

export const SAVE_KEY_LOCAL = 'fp:save:v1';
export const PLAYER_NAME_KEY_LOCAL = 'fp:playerName';
export const AUTOSAVE_DEBOUNCE_MS = 2000;

export const phaserGameConfigBase: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO, // WebGL preferido, fallback Canvas
  parent: 'game',
  backgroundColor: '#0b0f0b',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true, // sem antialias, mantém visual pixel/cartoon nítido
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 }, // top-down, sem gravidade
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
  // Cenas registradas no main.ts (importação dinâmica)
};
