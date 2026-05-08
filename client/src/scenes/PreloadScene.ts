import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE } from '@/config/GameConfig';
import { characterService } from '@/services/CharacterService';
import { friendsService } from '@/services/FriendsService';
import { settingsService } from '@/services/SettingsService';
import { shopService } from '@/services/ShopService';
import { socketService } from '@/services/SocketService';
import { overlayManager } from '@/utils/OverlayManager';
import { log } from '@/utils/Logger';

/**
 * PreloadScene — splash curto. Tenta reuso de token armazenado:
 * se válido, pula direto pra Lobby; senão vai pra Login.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  async create(): Promise<void> {
    overlayManager.hideAll();
    overlayManager.showCanvas();
    this.cameras.main.setBackgroundColor(PALETTE.bgDeep);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, 'FAITHFUL PERSONA', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#d4a017',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const status = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 16, 'conectando…', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#8a8aa6',
      })
      .setOrigin(0.5);

    const loader = document.getElementById('boot-loader');
    loader?.classList.add('hidden');
    setTimeout(() => loader?.remove(), 600);

    // Tenta reauth com token armazenado; se falhar, manda pra Login
    const token = socketService.getToken();
    if (token) {
      status.setText('reautenticando…');
      try {
        await socketService.connect();
        const result = await socketService.authenticate(token);
        if (result.success) {
          log.info('PreloadScene: silent reauth ok', { username: result.user.username });
          void settingsService.loadFromServer();
          void characterService.loadFromServer();
          void characterService.loadOwnedFromServer();
          void friendsService.init();
          void shopService.loadBalance();
          this.scene.start('Lobby');
          return;
        }
        log.warn('PreloadScene: stored token rejected', { msg: result.message });
        socketService.clearToken();
      } catch (err) {
        log.warn('PreloadScene: reauth error', { err });
      }
    }

    this.scene.start('Login');
  }
}
