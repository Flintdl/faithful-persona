import Phaser from 'phaser';

/**
 * InputSystem — abstrai teclado em comandos. Suporta WASD + setas.
 * Pra mobile (futuro), basta implementar o mesmo shape com touch controls.
 */
export type InputSnapshot = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  interact: boolean; // E (just pressed)
  attack: boolean; // mouse left click ou J (just pressed)
  jump: boolean; // W ou seta pra cima (just pressed)
};

export class InputSystem {
  private wasd!: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private interactKey!: Phaser.Input.Keyboard.Key;
  private attackKey!: Phaser.Input.Keyboard.Key;
  private jumpKey!: Phaser.Input.Keyboard.Key;
  // Mouse click é event-driven (não polled). Buffer de 1 frame: setado no listener,
  // consumido no próximo snapshot(). Garante "just pressed" sem perder cliques rápidos.
  private mouseAttackQueued = false;

  constructor(private readonly scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (!kb) throw new Error('InputSystem: keyboard plugin unavailable');
    this.wasd = {
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.cursors = kb.createCursorKeys();
    this.interactKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.attackKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.jumpKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.leftButtonDown()) this.mouseAttackQueued = true;
    });
  }

  snapshot(): InputSnapshot {
    const mouse = this.mouseAttackQueued;
    this.mouseAttackQueued = false;
    return {
      up: this.wasd.up.isDown || this.cursors.up?.isDown === true,
      down: this.wasd.down.isDown || this.cursors.down?.isDown === true,
      left: this.wasd.left.isDown || this.cursors.left?.isDown === true,
      right: this.wasd.right.isDown || this.cursors.right?.isDown === true,
      interact: Phaser.Input.Keyboard.JustDown(this.interactKey),
      attack: mouse || Phaser.Input.Keyboard.JustDown(this.attackKey),
      jump: Phaser.Input.Keyboard.JustDown(this.jumpKey),
    };
  }
}
