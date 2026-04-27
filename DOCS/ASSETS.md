# Faithful Persona — Assets Hand-Drawn

> Como trocar os placeholders procedurais por arte real estilo cozy hand-drawn.

A geração procedural atual (em `client/src/gen/AssetGenerator.ts`) é **funcional mas não bonita**. Para chegar no nível da referência (ver imagem que o usuário enviou — estilo similar a Sprout Lands / Mystic Woods / Cozy People), drope um asset pack pronto seguindo as instruções abaixo.

---

## 1. Asset packs recomendados (estilo da referência)

Todos suportam o look "cozy hand-drawn cartoon" com outlines grossos, paleta suave e múltiplos tons.

### Free
| Pack | Autor | Style | Link |
|---|---|---|---|
| **Sprout Lands** (base free) | Cup Nooble | 16x16 cozy farm | https://cupnooble.itch.io/sprout-lands-asset-pack |
| **Mystic Woods** | Game Endeavor | 16x16 forest adventure | https://game-endeavor.itch.io/mystic-woods |
| **Cozy Spring Tileset** | ohnoponogames | 16x16 spring | itch.io |
| **Tiny Swords** | pixelfrog-assets | 16x16 medieval cozy | itch.io |
| **Cozy Farm 16x16 Pack** | shubibubi | 16x16 | itch.io |

### Pagos (≤ US$25, qualidade alta)
| Pack | Autor | Style |
|---|---|---|
| **Sprout Lands** (full DLC bundle) | Cup Nooble | 16x16 |
| **Cozy People** (humanos detalhados) | Shubibubi/SilverShield | 16x16-32x32 |
| **Modern Interiors** | LimeZu | 16x16 modern |
| **Tiny Adventurer** | Cup Nooble | 16x16 RPG character |

> **Ao escolher**: confirme que tem **(a)** tileset de exterior com grama/caminho/água/penhasco, **(b)** sprite de personagem com 4 direções e walk animation, **(c)** props (árvores, pedras, flores, ponte, placa). Sprout Lands + Mystic Woods juntos cobrem 100% do MVP.

---

## 2. Estrutura de pastas esperada

Salve dentro de `client/public/assets/`:

```
client/public/assets/
├── sprites/
│   ├── tile-grass-0.png    (32x32)
│   ├── tile-grass-1.png
│   ├── tile-grass-2.png
│   ├── tile-grass-3.png
│   ├── tile-path-0.png
│   ├── tile-path-1.png
│   ├── tile-path-2.png
│   ├── tile-water-0.png
│   ├── tile-water-1.png
│   ├── tile-water-shore-n.png
│   ├── tile-cliff-top.png
│   ├── tile-cliff-face.png
│   ├── tile-stairs.png
│   ├── tile-bridge.png
│   ├── tile-bridge-rail-n.png
│   ├── prop-tree.png       (~56x72)
│   ├── prop-stone.png      (~24x18)
│   ├── prop-stone-big.png  (~36x26)
│   ├── prop-pebble.png     (~8x6)
│   ├── prop-bush.png       (~28x20)
│   ├── prop-flower-pink.png  (12x12)
│   ├── prop-flower-yellow.png
│   ├── prop-flower-white.png
│   ├── prop-sign.png       (~24x28)
│   ├── player.png          (96x128 = 4 dirs × 4 frames de 24x32)
│   └── coin.png            (84x14 = 6 frames de 14x14)
├── tilemaps/
│   └── meadow.json         (opcional — Tiled export)
├── ui/
│   ├── heart_full.png      (18x16)
│   ├── heart_half.png
│   └── heart_empty.png
└── audio/
    ├── bgm_meadow.ogg / .mp3
    └── sfx_coin.ogg / .mp3
```

### Tamanhos críticos
- **Player spritesheet**: 4 linhas × 4 colunas. Linha 0=down, 1=up, 2=left, 3=right. Coluna 0 = idle, 1-3 = ciclo walk.
- **Coin spritesheet**: 6 frames horizontais (giro de moeda).
- **Tiles**: idealmente **32x32** (o que o `GameConfig.TILE_SIZE` espera). Se o pack que você comprou for 16x16, ou (a) ajuste `TILE_SIZE = 16` no GameConfig e os outros números cascateiam, ou (b) escale 2x na hora de carregar (`setScale(2)`), ou (c) aplique `pixelArt: true` (já está) e o Phaser nearest-neighbor não dá ruim.

---

## 3. Processo de troca (passo a passo)

### Passo 1 — drope os arquivos
Copie tudo do asset pack pra `client/public/assets/`, renomeando pras keys exatas listadas acima.

### Passo 2 — descomente o loader
Em `client/src/scenes/PreloadScene.ts`, há um bloco grande comentado começando com:
```ts
// CARREGAMENTO DE ASSETS REAIS (substituir procedurais)
```
Descomente as linhas que correspondem aos arquivos que você baixou.

### Passo 3 — pronto
O `AssetGenerator` em `BootScene` checa `if (textures.exists(key)) return` antes de gerar, então os assets reais que carregaram **substituem automaticamente** os procedurais com mesma key.

### Passo 4 (opcional) — tilemap real
Se quiser editar o mapa no [Tiled](https://www.mapeditor.org/):
1. Crie um mapa 40×28 tiles, 32×32 cada.
2. Layers sugeridas: `ground` (grama+caminho), `water`, `props` (árvores/pedras/etc.), `collision` (objetos invisíveis).
3. Marque tiles colidíveis com property `collides: true`.
4. Export pra `client/public/assets/tilemaps/meadow.json`.
5. Em `WorldScene.create()`, substitua o `draw*()` programático por:
   ```ts
   const map = this.make.tilemap({ key: 'map_meadow' });
   const tileset = map.addTilesetImage('world', 'tileset_world')!;
   map.createLayer('ground', tileset, 0, 0)?.setDepth(-100);
   map.createLayer('water', tileset, 0, 0)?.setDepth(-50);
   const props = map.createLayer('props', tileset, 0, 0)?.setDepth(-1);
   const collision = map.getObjectLayer('collision');
   // adicione bodies a partir de collision.objects ...
   ```

---

## 4. Caso queira gerar arte em vez de comprar

Ferramentas free pra desenhar você mesmo:
- **Aseprite** — padrão indústria (US$20 ou compile free)
- **Piskel** (web, free) — https://www.piskelapp.com/
- **LibreSprite** — fork free do Aseprite
- **Krita** — pra arte mais pintada

Para aprender o estilo:
- "Cozy 2D RPG art tutorial" no YouTube (Cyangmou, MortMort, Pedro Medeiros)
- Use a paleta do Cup Nooble (Sprout Lands) como referência.

---

## 5. AI assets (use com cautela)

- **Scenario.gg** / **Layer.ai** — geram tilesets coerentes, mas qualidade hand-drawn ainda inferior a packs humanos.
- **Aseprite + AI inpainting** — pode acelerar, mas requer revisão manual.
- Cuidado com licenciamento: muitos pacotes pedem atribuição mesmo se gerados por IA.

---

## 6. Atribuição

Se usar pack free, a maioria pede crédito. Adicione em `client/src/scenes/LobbyScene.ts` no footer ou crie uma cena `CreditsScene`:
```
Art: Sprout Lands by Cup Nooble (CC-BY 4.0)
Music: ...
```
