import type { MapId } from '@shared/types/game.types';

/**
 * Registry central de todos os mapas do jogo.
 * Define onde estão os arquivos, quais props/mobs spawnar, e pra onde transições levam.
 *
 * Adicionar um mapa novo:
 *  1. Coloque o JSON em `client/public/assets/tilemaps/<key>.json`
 *  2. Adicione o objeto MapDef abaixo
 *  3. (opcional) Adicione `MapId` em `shared/types/game.types.ts` se for novo id
 *
 * Bonus do registry: BootScene faz preload em loop, WorldScene resolve via init data.
 */

export type RockKey = 'prop-rock-1' | 'prop-rock-2' | 'prop-rock-3';

export type MapDef = {
  id: MapId;
  /** Label visual exibido como banner ao entrar */
  label: string;
  /** Tom da câmera ao entrar (clear color) — meadow claro, forest escuro */
  cameraBg: string;
  /** Key Phaser do tilemap (carregado em BootScene) */
  tilemapKey: string;
  /** Caminho relativo a public/ */
  jsonPath: string;
  /** Posições de árvores em coords de tile (cluster decidido por mapa) */
  treeClusters: Array<[number, number]>;
  /** Pedras: tx, ty, key (rock1/2/3) */
  rocks: Array<[number, number, RockKey]>;
  /** Arbustos */
  bushes: Array<[number, number]>;
  /** Spawns de mob: posições em PIXEL */
  mobSpawns: Array<[number, number]>;
  /**
   * Mapeamento de objeto Tiled "transition_*" → MapId destino.
   * Ex.: meadow.json tem `transition_forest`, então `transitions.transition_forest = 'world_forest'`
   */
  transitions: Record<string, MapId>;
  /** Nome do object Tiled que vira a placa (opcional) */
  signObjectName?: string;
  /** Texto exibido no DialogBox quando o player interage com a placa */
  signText?: string;
};

const MEADOW: MapDef = {
  id: 'world_meadow',
  label: 'PRADARIA',
  cameraBg: '#7aa363',
  tilemapKey: 'map_meadow',
  jsonPath: 'assets/tilemaps/meadow.json',
  // Árvores em CLUSTERS nas bordas (mais natural que pontos isolados)
  treeClusters: [
    // borda norte
    [2, 1], [3, 1], [3, 2],
    [6, 1], [7, 0], [8, 1],
    [11, 0], [12, 1], [13, 1],
    [16, 0],
    // borda oeste
    [1, 4], [0, 5], [1, 6],
    [1, 9], [0, 10], [1, 11],
    // borda sul
    [3, 12], [4, 13], [5, 12],
    [9, 13], [10, 12], [11, 13],
    [14, 12], [15, 13],
    // borda leste (longe da transição em y=4-7)
    [18, 1], [18, 2],
    [18, 10], [18, 11], [18, 12],
  ],
  rocks: [
    [5, 3, 'prop-rock-1'], [5, 4, 'prop-rock-2'],
    [15, 5, 'prop-rock-3'], [15, 6, 'prop-rock-1'],
    [3, 8, 'prop-rock-2'], [4, 9, 'prop-rock-3'],
    [16, 9, 'prop-rock-1'],
    [9, 11, 'prop-rock-2'],
  ],
  bushes: [
    [4, 6], [6, 4], [13, 3], [14, 6],
    [5, 11], [13, 11], [16, 11],
    [4, 2], [15, 11],
  ],
  mobSpawns: [
    [620, 380],
    [900, 620],
    [1080, 240],
  ],
  transitions: { transition_forest: 'world_forest' },
  signObjectName: 'sign_welcome',
  signText:
    'Bem-vindo a Faithful Persona.\n\nWASD ou setas pra explorar, J ou clique pra atacar,\nE pra interagir, ESC pra voltar ao lobby.\nAtravesse pra leste pra entrar na Floresta.',
};

const FOREST: MapDef = {
  id: 'world_forest',
  label: 'FLORESTA',
  cameraBg: '#3d6d2e',
  tilemapKey: 'map_forest',
  jsonPath: 'assets/tilemaps/forest.json',
  // Floresta densa: árvores cobrem quase todas as bordas + algumas no meio
  treeClusters: [
    // muralha de árvores no norte (cobre quase tudo)
    [1, 0], [2, 0], [3, 0], [4, 1], [5, 0], [6, 0], [7, 1],
    [8, 0], [9, 0], [10, 1], [11, 0], [12, 0], [13, 0],
    [14, 1], [15, 0], [16, 0], [17, 1], [18, 0],
    // muralha sul
    [1, 13], [2, 13], [3, 12], [5, 13], [7, 13],
    [9, 12], [11, 13], [13, 13], [15, 12], [17, 13],
    // borda leste (cobre tudo)
    [18, 2], [18, 3], [18, 5], [18, 7], [18, 8], [18, 10], [18, 12],
    // borda oeste — abertura no meio (transition_meadow em y=300-500 = tile y=4-7)
    [1, 1], [1, 2], [1, 3],
    [1, 9], [1, 10], [1, 11],
    // árvores espalhadas no interior (denso)
    [4, 3], [7, 4], [10, 3], [13, 4], [16, 3],
    [3, 6], [9, 6], [16, 6],
    [6, 9], [10, 9], [14, 8],
    [5, 11], [12, 11], [16, 10],
  ],
  rocks: [
    [3, 4, 'prop-rock-3'],
    [10, 7, 'prop-rock-1'],
    [16, 11, 'prop-rock-2'],
  ],
  bushes: [
    [7, 7], [11, 5], [4, 10], [14, 11],
    [8, 11], [13, 7],
  ],
  mobSpawns: [
    // floresta tem MAIS mobs (4 vs 3) — mais perigosa
    [400, 380],
    [700, 600],
    [950, 280],
    [1050, 700],
  ],
  transitions: { transition_meadow: 'world_meadow' },
  signObjectName: 'sign_forest',
  signText:
    'Você entrou na Floresta.\n\nMais slimes vagam por aqui — tome cuidado.\nVolte pra oeste pra retornar à Pradaria.',
};

export const MAPS: Record<MapId, MapDef> = {
  world_meadow: MEADOW,
  world_forest: FOREST,
  // adicionar mais mapas aqui — exige adicionar MapId em shared/types/game.types.ts
  world_village: MEADOW, // placeholder até existir village.json — evita crash se save tem mapId antigo
};

export const DEFAULT_MAP_ID: MapId = 'world_meadow';
