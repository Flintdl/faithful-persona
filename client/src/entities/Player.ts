import Phaser from 'phaser';
import {
  PLAYER_BODY_H,
  PLAYER_BODY_OFFSET_Y,
  PLAYER_BODY_W,
  PLAYER_SPEED,
  PLAYER_SPRITE_W,
} from '@/config/GameConfig';
import type { InputSnapshot, InputSystem } from '@/systems/InputSystem';

export type Facing = 'up' | 'down' | 'left' | 'right';

export class Player extends Phaser.Physics.Arcade.Sprite {
  facing: Facing = 'down';

  declare body: Phaser.Physics.Arcade.Body;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Body só nos pés pra dar sensação de "pisada" e permitir overlap visual com props
    this.body.setSize(PLAYER_BODY_W, PLAYER_BODY_H);
    this.body.setOffset((PLAYER_SPRITE_W - PLAYER_BODY_W) / 2, PLAYER_BODY_OFFSET_Y);
    this.body.setCollideWorldBounds(true);
    this.setDepth(10);

    this.anims.play('player-idle-down');
  }

  setFacing(f: Facing): void {
    if (this.facing === f) return;
    this.facing = f;
  }

  /** Lê input e aplica velocidade. Não move por dt — Phaser physics integra. */
  override update(input: InputSnapshot): void {
    let vx = 0;
    let vy = 0;
    if (input.left) vx -= 1;
    if (input.right) vx += 1;
    if (input.up) vy -= 1;
    if (input.down) vy += 1;

    if (vx !== 0 && vy !== 0) {
      // normaliza diagonal pra não andar mais rápido
      const inv = 1 / Math.SQRT2;
      vx *= inv;
      vy *= inv;
    }

    this.body.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED);

    // Decide direção visual (vertical predomina sobre horizontal pra evitar flicker em diagonal)
    const moving = vx !== 0 || vy !== 0;
    if (moving) {
      let next: Facing = this.facing;
      if (Math.abs(vy) >= Math.abs(vx)) next = vy < 0 ? 'up' : 'down';
      else next = vx < 0 ? 'left' : 'right';
      this.setFacing(next);
      this.playAnim(`player-walk-${next}`);
    } else {
      this.playAnim(`player-idle-${this.facing}`);
    }
  }

  private playAnim(key: string): void {
    if (this.anims.currentAnim?.key !== key) {
      this.anims.play(key, true);
    }
  }

  /** Posição "à frente" do player na direção que está olhando (pra raycast de interação) */
  forward(distance: number): { x: number; y: number } {
    const dirVec: Record<Facing, [number, number]> = {
      up: [0, -1],
      down: [0, 1],
      left: [-1, 0],
      right: [1, 0],
    };
    const [dx, dy] = dirVec[this.facing];
    return { x: this.x + dx * distance, y: this.y + dy * distance };
  }
}

/** Helper pra criar e wirear input ao player. */
export function createPlayer(
  scene: Phaser.Scene,
  input: InputSystem,
  x: number,
  y: number,
): { player: Player; updater: () => void } {
  const player = new Player(scene, x, y);
  const updater = () => player.update(input.snapshot());
  return { player, updater };
}
