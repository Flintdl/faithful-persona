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
  'map:transition': { from: string; to: string };
  'interact:prompt': { show: boolean; label?: string };
  'interact:trigger': { targetId: string };
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
