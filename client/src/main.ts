import '@/styles/index.css';
import Phaser from 'phaser';
import { phaserGameConfigBase } from '@/config/GameConfig';
import { BootScene } from '@/scenes/BootScene';
import { HudScene } from '@/scenes/HudScene';
import { LobbyScene } from '@/scenes/LobbyScene';
import { LoginScene } from '@/scenes/LoginScene';
import { PreloadScene } from '@/scenes/PreloadScene';
import { PreRoomScene } from '@/scenes/PreRoomScene';
import { WorldScene } from '@/scenes/WorldScene';
import { log } from '@/utils/Logger';

log.info('Faithful Persona booting', {
  build: import.meta.env.VITE_BUILD_ID ?? 'dev',
  mode: import.meta.env.MODE,
});

new Phaser.Game({
  ...phaserGameConfigBase,
  scene: [BootScene, PreloadScene, LoginScene, LobbyScene, PreRoomScene, WorldScene, HudScene],
});

window.addEventListener('error', (e) => log.error('window.error', { msg: e.message, src: e.filename }));
window.addEventListener('unhandledrejection', (e) =>
  log.error('unhandledrejection', { reason: String(e.reason) }),
);
