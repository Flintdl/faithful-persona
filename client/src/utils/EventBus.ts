import Phaser from 'phaser';

/**
 * EventBus singleton — desacopla emissor e ouvinte.
 * Use pra comunicação entre cenas (ex: WorldScene → HudScene).
 *
 * Não use pra dados de alta frequência por frame (use Phaser.Registry ou referência direta).
 */
export const EventBus = new Phaser.Events.EventEmitter();

// Tipagem dos eventos (mantenha em sync com shared/types/game.types.ts -> GameEvent)
export type EventMap = {
  'coin:collected': { total: number };
  'player:damaged': { hp: number; maxHp: number };
  'player:healed': { hp: number; maxHp: number };
  'player:died': void;
  // Player iniciou um attack — WorldScene escuta e spawna hitbox
  'player:attack': { x: number; y: number; facing: 'up' | 'down' | 'left' | 'right' };
  // Mob morreu — WorldScene escuta e dropa coin
  'mob:died': { x: number; y: number };
  // Mob recebeu dano — pra futuro: SFX, partículas, números flutuantes
  'mob:hit': { id: string; hp: number };
  'map:transition': { from: string; to: string };
  // Player ENTROU num mapa (após fade-in completar). HudScene escuta e mostra banner.
  'map:entered': { mapId: string; label: string };
  'interact:prompt': { show: boolean; label?: string };
  // text é opcional — se vier, HudScene usa; senão cai no dialogFor() local
  'interact:trigger': { targetId: string; text?: string };
  'state:dirty': void;
  'state:saved': { at: string };
  'lobby:play': void;
};

export function emit<K extends keyof EventMap>(event: K, payload?: EventMap[K]): void {
  EventBus.emit(event, payload);
}

export function on<K extends keyof EventMap>(
  event: K,
  handler: (payload: EventMap[K]) => void,
  context?: unknown,
): void {
  EventBus.on(event, handler, context);
}

export function off<K extends keyof EventMap>(
  event: K,
  handler: (payload: EventMap[K]) => void,
  context?: unknown,
): void {
  EventBus.off(event, handler, context);
}
