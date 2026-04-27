import Phaser from 'phaser';

export class Coin extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'coin', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body.setSize(8, 8);
    this.body.setAllowGravity(false);
    this.body.setImmovable(true);
    this.setDepth(5);
    this.anims.play('coin-spin');

    // sobe e desce sutil
    scene.tweens.add({
      targets: this,
      y: y - 2,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}
