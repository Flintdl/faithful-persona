import Phaser from 'phaser';
import { emit } from '@/utils/EventBus';

type MobState = 'IDLE' | 'CHASE' | 'HURT' | 'DEAD';

export type MobConfig = {
  hp?: number;
  speed?: number;
  detectRange?: number;
  contactRange?: number;
  attackCooldownMs?: number;
  contactDamage?: number;
  knockbackForce?: number;
  hurtDurationMs?: number;
};

const DEFAULTS: Required<MobConfig> = {
  hp: 2,
  speed: 60,
  detectRange: 140,
  contactRange: 28,
  attackCooldownMs: 1000,
  contactDamage: 1,
  knockbackForce: 220,
  hurtDurationMs: 200,
};

/**
 * Mob — inimigo simples com state machine.
 *
 * IDLE → vê player a < detectRange → CHASE
 * CHASE → contact range → bate (com cooldown), continua perseguindo
 *      → fora de range*1.5 → IDLE
 * HURT → knockback breve, sem ações; volta pra CHASE
 * DEAD → tween shrink+fade, dropa coin via 'mob:died', destroy
 *
 * Anti-cheat futuro (multiplayer): mover essa lógica pro server.
 * Por enquanto, IA roda no client.
 */
export class Mob extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  private aiState: MobState = 'IDLE';
  private hp: number;
  private readonly cfg: Required<MobConfig>;
  private lastAttackAt = 0;
  /** Player target. Setado em update; null se nenhum player na cena. */
  private target: Phaser.Physics.Arcade.Sprite | null = null;
  /** Callback chamado quando o player tá em contact range (cooldown respeitado). */
  private onContactDamage?: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number, config: MobConfig = {}) {
    super(scene, x, y, 'mob-slime', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.cfg = { ...DEFAULTS, ...config };
    this.hp = this.cfg.hp;

    this.body.setSize(16, 8);
    this.body.setOffset(4, 10); // body só na "barriga", centrado na sombra
    this.body.setCollideWorldBounds(true);
    this.body.setMaxVelocity(this.cfg.speed * 1.5, this.cfg.speed * 1.5);
    this.body.setDrag(this.cfg.speed * 4, this.cfg.speed * 4);

    this.setOrigin(0.5, 1); // ancorado na base, igual props
    this.setDepth(this.y);

    this.anims.play('slime-idle');
  }

  setTarget(target: Phaser.Physics.Arcade.Sprite): void {
    this.target = target;
  }

  setOnContactDamage(cb: () => void): void {
    this.onContactDamage = cb;
  }

  /** Chamado por WorldScene a cada frame */
  tick(): void {
    if (this.aiState === 'DEAD' || this.aiState === 'HURT' || !this.target) return;

    // y-sort dinâmico
    this.setDepth(this.y);

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;

    if (this.aiState === 'IDLE') {
      if (dist < this.cfg.detectRange) {
        this.aiState = 'CHASE';
      } else {
        this.body.setVelocity(0, 0);
        return;
      }
    }

    // CHASE
    if (dist > this.cfg.detectRange * 1.5) {
      this.aiState = 'IDLE';
      this.body.setVelocity(0, 0);
      return;
    }

    // movimento perseguindo
    if (dist > this.cfg.contactRange * 0.7) {
      const inv = 1 / dist;
      this.body.setVelocity(dx * inv * this.cfg.speed, dy * inv * this.cfg.speed);
    } else {
      this.body.setVelocity(0, 0);
    }

    // dano em contato (com cooldown)
    if (dist < this.cfg.contactRange) {
      const now = this.scene.time.now;
      if (now - this.lastAttackAt > this.cfg.attackCooldownMs) {
        this.lastAttackAt = now;
        this.onContactDamage?.();
      }
    }
  }

  takeDamage(amount: number, fromX: number, fromY: number): void {
    if (this.aiState === 'DEAD') return;
    this.hp -= amount;

    if (this.hp <= 0) {
      this.die();
      return;
    }

    this.aiState = 'HURT';
    this.setTint(0xff5a5a);

    // knockback (na direção oposta ao atacante)
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    this.body.setVelocity(
      (dx / dist) * this.cfg.knockbackForce,
      (dy / dist) * this.cfg.knockbackForce,
    );

    this.scene.time.delayedCall(this.cfg.hurtDurationMs, () => {
      if (!this.active || this.aiState === 'DEAD') return;
      this.clearTint();
      this.body.setVelocity(0, 0);
      this.aiState = 'CHASE';
    });
  }

  private die(): void {
    this.aiState = 'DEAD';
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.setTint(0xffffff);

    // dropa coin (WorldScene escuta)
    emit('mob:died', { x: this.x, y: this.y - 8 });

    this.scene.tweens.add({
      targets: this,
      scaleX: 0.2,
      scaleY: 0.2,
      alpha: 0,
      duration: 280,
      ease: 'Sine.easeIn',
      onComplete: () => this.destroy(),
    });
  }
}
