import Phaser from 'phaser';
import { AssetGenerator } from '@/gen/AssetGenerator';
import { log } from '@/utils/Logger';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    log.info('BootScene: generating procedural assets');
    new AssetGenerator(this).generateAll();
    this.scene.start('Preload');
  }
}
