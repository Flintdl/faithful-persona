import Phaser from 'phaser';
import { phaserGameConfigBase } from '@/config/GameConfig';
import { BootScene } from '@/scenes/BootScene';
import { GameOverScene } from '@/scenes/GameOverScene';
import { HudScene } from '@/scenes/HudScene';
import { LobbyScene } from '@/scenes/LobbyScene';
import { PreloadScene } from '@/scenes/PreloadScene';
import { WorldScene } from '@/scenes/WorldScene';
import { log } from '@/utils/Logger';

log.info('Faithful Persona booting', {
  build: import.meta.env.VITE_BUILD_ID ?? 'dev',
  mode: import.meta.env.MODE,
});

new Phaser.Game({
  ...phaserGameConfigBase,
  scene: [BootScene, PreloadScene, LobbyScene, WorldScene, HudScene, GameOverScene],
});

// Captura globalmente erros não tratados pra debug + futuro Sentry
window.addEventListener('error', (e) => log.error('window.error', { msg: e.message, src: e.filename }));
window.addEventListener('unhandledrejection', (e) =>
  log.error('unhandledrejection', { reason: String(e.reason) }),
);
