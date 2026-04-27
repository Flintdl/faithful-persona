// Tipos compartilhados client/server. NÃO importe nada de Phaser ou Node aqui.

export type Vec2 = { x: number; y: number };

export type MapId = 'world_meadow' | 'world_forest' | 'world_village';

export type ItemType =
  | 'coin'
  | 'health_potion'
  | 'wood_log'
  | 'stone'
  | 'flower';

export type Item = {
  type: ItemType;
  qty: number;
};

export type PlayerPosition = {
  mapId: MapId;
  x: number;
  y: number;
  facing: 'up' | 'down' | 'left' | 'right';
};

export type PlayerState = {
  id: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  coins: number;
  position: PlayerPosition;
  inventory: Item[];
  flags: Record<string, boolean>;
  updatedAt: string; // ISO 8601
  schemaVersion: number;
};

export const CURRENT_SAVE_SCHEMA_VERSION = 1 as const;

export const DEFAULT_PLAYER_STATE = (id: string, name: string): PlayerState => ({
  id,
  name,
  level: 1,
  hp: 6,
  maxHp: 6,
  coins: 0,
  position: { mapId: 'world_meadow', x: 480, y: 270, facing: 'down' },
  inventory: [],
  flags: {},
  updatedAt: new Date().toISOString(),
  schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
});

export type GameEvent =
  | { type: 'coin:collected'; total: number }
  | { type: 'player:damaged'; hp: number; maxHp: number }
  | { type: 'player:healed'; hp: number; maxHp: number }
  | { type: 'player:died' }
  | { type: 'map:transition'; from: MapId; to: MapId }
  | { type: 'interact:prompt'; show: boolean; label?: string }
  | { type: 'interact:trigger'; targetId: string }
  | { type: 'state:dirty' }
  | { type: 'state:saved'; at: string };
