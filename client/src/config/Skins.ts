/**
 * Registry de skins do MVP — variantes de cor (tint) do sprite Adventurer.
 *
 * Quando sprite-sheets reais (vampiro, bruxa, etc) chegarem, a estrutura cresce
 * pra incluir `textureKey` por skin, e o renderer troca `setTint` por `setTexture`.
 *
 * O backend (CharacterHandler) persiste `{ name, person, skins }`. Usamos:
 * - `name` = skin id (ex: 'crimson')
 * - `person` = caminho do retrato (placeholder genérico do Adventurer)
 * - `skins` = livre, vazio por enquanto (futuro: hat/hair/etc)
 *
 * O tint é resolvido CLIENT-SIDE via este registry — o backend não conhece cores.
 */

export interface SkinDef {
  /** ID persistente — vai pro backend em `character.name`, é o mesmo `itemId` da loja */
  id: string;
  /** Label exibido no menu de seleção */
  label: string;
  /** Tint aplicado em `sprite.setTint(0xRRGGBB)` */
  tint: number;
  /** Cor de borda/preview no card (CSS) */
  cssColor: string;
  /** Se true, disponível pra todo mundo sem precisar comprar na loja. */
  free?: boolean;
}

// IDs precisam casar com `shop_items.json > skins` no backend.
// Free = sempre desbloqueada. Outras só após compra (purchases[userId]).
export const SKINS: SkinDef[] = [
  { id: 'default', label: 'Aventureiro', tint: 0xffffff, cssColor: '#e8e2d0', free: true },
  { id: 'crimson', label: 'Carmesim', tint: 0xff6464, cssColor: '#ff6464', free: true },
  { id: 'azure', label: 'Azur', tint: 0x6da8ff, cssColor: '#6da8ff' },
  { id: 'forest', label: 'Floresta', tint: 0x86b56a, cssColor: '#86b56a' },
  { id: 'royal-gold', label: 'Áurea', tint: 0xf3c54a, cssColor: '#f3c54a' },
  { id: 'plum', label: 'Ametista', tint: 0xb066d4, cssColor: '#b066d4' },
  { id: 'shadow', label: 'Sombra', tint: 0x707070, cssColor: '#707070' },
  { id: 'ember', label: 'Brasa', tint: 0xff9933, cssColor: '#ff9933' },
];

/** IDs das skins gratuitas (sempre desbloqueadas). */
export const FREE_SKIN_IDS = new Set(SKINS.filter((s) => s.free).map((s) => s.id));

export const DEFAULT_SKIN_ID = 'default';
export const DEFAULT_PERSON = '/assets/sprites/adventurer/idle/idle_down.png';

export function getSkin(id: string | undefined | null): SkinDef {
  if (!id) return SKINS[0]!;
  return SKINS.find((s) => s.id === id) ?? SKINS[0]!;
}
