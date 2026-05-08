import Phaser from 'phaser';

/**
 * EventBus singleton — desacopla emissor e ouvinte entre cenas Phaser.
 * EventMap cresce conforme novas cenas/sistemas são adicionados.
 */
export const EventBus = new Phaser.Events.EventEmitter();

export type EventMap = {
  // populado conforme as cenas do MVP forem implementadas
};

export function emit<K extends keyof EventMap>(event: K, payload?: EventMap[K]): void {
  EventBus.emit(event as string, payload);
}

export function on<K extends keyof EventMap>(
  event: K,
  handler: (payload: EventMap[K]) => void,
  context?: unknown,
): void {
  EventBus.on(event as string, handler, context);
}

export function off<K extends keyof EventMap>(
  event: K,
  handler: (payload: EventMap[K]) => void,
  context?: unknown,
): void {
  EventBus.off(event as string, handler, context);
}
