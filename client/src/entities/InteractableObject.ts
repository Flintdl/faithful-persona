import Phaser from 'phaser';

/**
 * Objeto/NPC interativo. Recebe um id e uma label.
 * Quando o player aperta E perto dele, dispara onInteract.
 */
export class InteractableObject extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  readonly objectId: string;
  readonly label: string;
  readonly onInteract: () => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    config: { id: string; label: string; onInteract: () => void; bodyW?: number; bodyH?: number },
  ) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this, true); // immovable
    this.objectId = config.id;
    this.label = config.label;
    this.onInteract = config.onInteract;
    if (config.bodyW && config.bodyH) {
      this.body.setSize(config.bodyW, config.bodyH);
    }
    this.setDepth(8);
  }
}
