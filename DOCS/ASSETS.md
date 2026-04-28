# Faithful Persona — Assets Hand-Drawn

> Como trocar os placeholders procedurais por arte real estilo cozy hand-drawn.
> **Última atualização**: 2026-04-28

A geração procedural (em `client/src/gen/AssetGenerator.ts`) é **funcional mas placeholder**. Para chegar no nível visual da referência (Sprout Lands / Mystic Woods / Cozy People), drope um asset pack pronto seguindo as instruções abaixo.

---

## 0. Status atual de cada asset (LEIA PRIMEIRO)

Tabela do que já tem arte real vs. ainda procedural. Foque o trabalho nos `❌ PROCEDURAL`.

### Player (✅ COMPLETO — Adventurer pack)
| Key | Status | Arquivo |
|---|---|---|
| `player-idle-{down,up,left,right}` | ✅ REAL | `assets/sprites/adventurer/idle/idle_*.png` (96×80, 8 frames cada) |
| `player-run-{down,up,left,right}` | ✅ REAL | `assets/sprites/adventurer/run/run_*.png` |
| `player-attack1-{down,up,left,right}` | ✅ REAL | `assets/sprites/adventurer/attack1/attack1_*.png` |
| `player-attack2-{down,up,left,right}` | ✅ REAL | `assets/sprites/adventurer/attack2/attack2_*.png` (carregado mas ainda não usado em código) |

### Mundo (✅ Tiny Swords parcial)
| Key | Status | Arquivo |
|---|---|---|
| `tileset_world` | ✅ REAL | `assets/tilemaps/tileset.png` |
| `map_meadow` | ✅ REAL | `assets/tilemaps/meadow.json` (20×14 tiles de 64px, layer `ground` + objectgroup `spawns`) |
| `prop-tree` | ✅ REAL | `assets/sprites/world/tree.png` (192×256 spritesheet) |
| `prop-bush` | ✅ REAL | `assets/sprites/world/bush.png` (128×128 spritesheet) |
| `prop-rock-1/2/3` | ✅ REAL | `assets/sprites/world/rock{1,2,3}.png` |

### Procedurais que precisam virar real (🎯 prioridade alta)
| Key | Status | Tamanho esperado | Pra que serve |
|---|---|---|---|
| `mob-slime` | ❌ PROCEDURAL | spritesheet 96×20 (4 frames de 24×20) | Inimigo principal — combate |
| `coin` | ❌ PROCEDURAL | spritesheet 84×14 (6 frames de 14×14) | Loot dropado por mob |
| `ui-heart-full/half/empty` | ❌ PROCEDURAL | 18×16 cada | HUD vida |
| `prop-sign` | ❌ PROCEDURAL | 24×28 | Placa interativa (welcome message) |

### Procedurais que ficam OK por enquanto (baixa prioridade)
| Key | Status | Por quê |
|---|---|---|
| `tile-grass-*`, `tile-path-*`, `tile-water-*`, `tile-cliff-*`, `tile-bridge-*` | ❌ PROCEDURAL | **Não são mais usados** — o tilemap Tiny Swords substituiu. AssetGenerator continua gerando como fallback mas o código real puxa do `tileset_world`. Pode podar quando confirmar. |
| `prop-stone`, `prop-stone-big`, `prop-pebble` | ❌ PROCEDURAL | WorldScene atualmente usa `prop-rock-1/2/3` reais. Esses ficaram orfãos. Podar quando refatorar. |
| `prop-flower-{pink,yellow,white}` | ❌ PROCEDURAL | Decorativos, não estão sendo spawnados no atual WorldScene |

### Áudio (❌ FALTA TUDO)
| Key | Tipo | Quando usar |
|---|---|---|
| `bgm_meadow` | OGG+MP3 loop, ~1-2min | Música ambiente do mapa |
| `sfx_step` | OGG+MP3 ~200ms | Passos do player (alternar 2-3 variações) |
| `sfx_coin` | OGG+MP3 ~300ms | Coleta de moeda |
| `sfx_attack` | OGG+MP3 ~250ms | Swing do player |
| `sfx_hit` | OGG+MP3 ~200ms | Impacto na slime |
| `sfx_player_hurt` | OGG+MP3 ~400ms | Dano no player |
| `sfx_mob_die` | OGG+MP3 ~500ms | Morte da slime |
| `sfx_ui_click` | OGG+MP3 ~150ms | Botões UI |

---

## 1. Asset packs recomendados

### Visual (cozy hand-drawn)
| Pack | Autor | Style | Link | Cobre |
|---|---|---|---|---|
| **Sprout Lands** (free + DLCs) | Cup Nooble | 16×16 | https://cupnooble.itch.io/sprout-lands-asset-pack | grama, props, NPCs |
| **Mystic Woods** (free) | Game Endeavor | 16×16 | https://game-endeavor.itch.io/mystic-woods | floresta, slime, mobs |
| **Tiny Swords** (já em uso) | pixelfrog-assets | 64×64 | https://pixelfrog-assets.itch.io/tiny-swords | tiles, props, war |
| **Cozy People** | Shubibubi | 16-32px | itch.io | NPCs detalhados |
| **Tiny RPG Forest** (free) | DemChing | 16×16 | itch.io | mobs (slime, goblin, etc) |
| **Pixel Art Top Down Basic** (free) | cainos | 16×16 | itch.io | UI hearts/coins |

### Áudio (pra MVP)
| Pack/Site | Autor | Tipo | Link | Cobre |
|---|---|---|---|---|
| **Cozy Game OST Pack** | Sergio Prosvirini | BGM cozy | itch.io | música ambiente |
| **PixaBay Music** | vários | BGM free | https://pixabay.com/music/ | música genérica royalty-free |
| **Kenney Audio Packs** | Kenney | SFX | https://kenney.nl/assets/category:Audio | tudo, free CC0 |
| **freesound.org** | comunidade | SFX | https://freesound.org/ | qualquer SFX, varia licença |
| **OpenGameArt audio** | comunidade | tudo | https://opengameart.org/art-search?keys=&field_art_type_tid%5B%5D=13 | varia licença |

> **Recomendação**: pra fechar o MVP de áudio rápido, baixe **um BGM cozy do PixaBay** (~1min loop) + **Kenney's "Sci-Fi Sounds" ou "RPG Audio"** pra SFX. Tudo CC0/sem atribuição.

---

## 2. Swap do mob (slime) — passo a passo concreto

Hoje o slime é gerado em `AssetGenerator.generateMob()` (key `mob-slime`, anim `slime-idle`).

### Opção A — usar slime do **Mystic Woods** ou **Tiny RPG Forest**
1. Baixe e extraia. Procure spritesheet do slime (geralmente 16×16 ou 32×32, 4-6 frames).
2. Salve em `client/public/assets/sprites/mobs/slime.png`.
3. Em `client/src/scenes/BootScene.ts`, no `preload()`, adicione:
   ```ts
   this.load.spritesheet('mob-slime', 'assets/sprites/mobs/slime.png', {
     frameWidth: 32,   // <- ajuste pro tamanho real do frame
     frameHeight: 32,
   });
   ```
4. Em `BootScene.create()` antes de `new AssetGenerator(this).generateAll()`, **OU** depois (igual funciona porque o generator faz `if (textures.exists) return`):
   ```ts
   if (!this.anims.exists('slime-idle')) {
     this.anims.create({
       key: 'slime-idle',
       frames: this.anims.generateFrameNumbers('mob-slime', { start: 0, end: 3 }),
       frameRate: 6,
       repeat: -1,
     });
   }
   ```
5. Em `client/src/entities/Mob.ts`, ajuste `body.setSize` e `setOffset` pro novo frame size se diferente de 24×20.
6. (Opcional) Adicione anims `slime-hurt` e `slime-die` se o pack tiver, e dispare em `Mob.takeDamage`/`die`.

### Opção B — desenhar você mesmo
Aseprite, 4 frames 24×20 squash/stretch, exporte PNG sheet horizontal.

---

## 3. Adicionar áudio (do zero — não tem nada hoje)

### Passo 1 — drope arquivos
```
client/public/assets/audio/
├── bgm/
│   └── meadow.ogg          # baixe um BGM ~1min loop, converta pra ogg via ffmpeg
└── sfx/
    ├── coin.ogg
    ├── attack.ogg
    ├── hit.ogg
    ├── player_hurt.ogg
    ├── mob_die.ogg
    ├── step.ogg
    └── ui_click.ogg
```

> **Sempre forneça `.ogg` E `.mp3`** — Phaser tenta cada e cai pro disponível. Safari preferre MP3, Chrome OGG. Conversão: `ffmpeg -i input.wav -c:a libvorbis output.ogg` e `ffmpeg -i input.wav -c:a libmp3lame output.mp3`.

### Passo 2 — carregar no `BootScene.preload()`
```ts
this.load.audio('bgm-meadow',     ['assets/audio/bgm/meadow.ogg', 'assets/audio/bgm/meadow.mp3']);
this.load.audio('sfx-coin',       ['assets/audio/sfx/coin.ogg', 'assets/audio/sfx/coin.mp3']);
this.load.audio('sfx-attack',     ['assets/audio/sfx/attack.ogg', 'assets/audio/sfx/attack.mp3']);
this.load.audio('sfx-hit',        ['assets/audio/sfx/hit.ogg', 'assets/audio/sfx/hit.mp3']);
this.load.audio('sfx-player-hurt',['assets/audio/sfx/player_hurt.ogg', 'assets/audio/sfx/player_hurt.mp3']);
this.load.audio('sfx-mob-die',    ['assets/audio/sfx/mob_die.ogg', 'assets/audio/sfx/mob_die.mp3']);
this.load.audio('sfx-step',       ['assets/audio/sfx/step.ogg', 'assets/audio/sfx/step.mp3']);
this.load.audio('sfx-ui-click',   ['assets/audio/sfx/ui_click.ogg', 'assets/audio/sfx/ui_click.mp3']);
```

### Passo 3 — criar `client/src/systems/AudioSystem.ts`
Wrapper sobre `scene.sound` com volume master/music/sfx + listeners do EventBus:

```ts
import Phaser from 'phaser';
import { on } from '@/utils/EventBus';

export class AudioSystem {
  private bgm?: Phaser.Sound.BaseSound;
  private musicVolume = 0.4;
  private sfxVolume = 0.8;

  constructor(private scene: Phaser.Scene) {
    on('coin:collected', () => this.play('sfx-coin'));
    on('player:attack', () => this.play('sfx-attack'));
    on('mob:died', () => this.play('sfx-mob-die'));
    on('player:damaged', () => this.play('sfx-player-hurt'));
  }

  playBgm(key: string): void {
    this.bgm?.stop();
    this.bgm = this.scene.sound.add(key, { loop: true, volume: this.musicVolume });
    this.bgm.play();
  }

  play(key: string): void {
    if (this.scene.cache.audio.exists(key)) {
      this.scene.sound.play(key, { volume: this.sfxVolume });
    }
  }
}
```

### Passo 4 — instanciar no `WorldScene.create()`
```ts
this.audio = new AudioSystem(this);
this.audio.playBgm('bgm-meadow');
```

E na cena destruir:
```ts
this.events.on('shutdown', () => this.audio.destroy?.());
```

### Passo 5 — passos do player
No `Player.update()`, quando moving:
```ts
if (moving && this.scene.time.now - this.lastStepAt > 280) {
  this.lastStepAt = this.scene.time.now;
  emit('player:step');  // <- novo evento; AudioSystem escuta
}
```
Ou direto: `this.scene.sound.play('sfx-step', { volume: 0.3 });`.

---

## 4. Estrutura de pastas atual

```
client/public/assets/
├── sprites/
│   ├── adventurer/
│   │   ├── idle/idle_{down,up,left,right}.png   ✅
│   │   ├── run/run_{down,up,left,right}.png     ✅
│   │   ├── attack1/attack1_{down,up,left,right}.png  ✅
│   │   └── attack2/attack2_{down,up,left,right}.png  ✅
│   ├── world/
│   │   ├── tree.png       ✅
│   │   ├── bush.png       ✅
│   │   └── rock1/2/3.png  ✅
│   └── mobs/              ❌ FALTA — criar pasta + slime aqui
│       └── slime.png
├── tilemaps/
│   ├── tileset.png        ✅
│   └── meadow.json        ✅
├── ui/                    ❌ FALTA — hearts, coin icon, button frames
│   ├── heart_full.png
│   ├── heart_half.png
│   └── heart_empty.png
└── audio/                 ❌ FALTA — pasta inteira
    ├── bgm/
    └── sfx/
```

---

## 5. Caso queira gerar arte em vez de comprar

Ferramentas free pra desenhar você mesmo:
- **Aseprite** — padrão indústria (US$20 ou compile free)
- **Piskel** (web, free) — https://www.piskelapp.com/
- **LibreSprite** — fork free do Aseprite
- **Krita** — pra arte mais pintada

Para aprender o estilo:
- "Cozy 2D RPG art tutorial" no YouTube (Cyangmou, MortMort, Pedro Medeiros)
- Use a paleta do Cup Nooble (Sprout Lands) como referência.

---

## 6. AI assets (use com cautela)

- **Scenario.gg** / **Layer.ai** — geram tilesets coerentes, mas qualidade hand-drawn ainda inferior a packs humanos.
- **Aseprite + AI inpainting** — pode acelerar, mas requer revisão manual.
- Cuidado com licenciamento: muitos pacotes pedem atribuição mesmo se gerados por IA.

---

## 7. Atribuição

Se usar pack free, a maioria pede crédito. Adicione em `client/src/scenes/LobbyScene.ts` no footer ou crie uma cena `CreditsScene`:
```
Adventurer sprite: Sven (CC-BY 4.0)
World tiles: pixelfrog Tiny Swords (CC0)
BGM: <autor> via PixaBay (Pixabay License)
SFX: Kenney (CC0)
```

Atribuição já presente: nenhuma ainda — adicionar quando for pra produção.
