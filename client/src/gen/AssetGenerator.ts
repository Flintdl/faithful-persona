import Phaser from 'phaser';
import {
  PALETTE,
  PLAYER_SPRITE_H,
  PLAYER_SPRITE_W,
  TILE_SIZE,
} from '@/config/GameConfig';

/**
 * Gera texturas procedurais cartoon hand-drawn-like via Phaser.Graphics.
 * Estilo "cozy 32x32" — outlines escuros, 3-4 tons por elemento,
 * highlights pra dar volume. Inspirado em Sprout Lands / Mystic Woods.
 *
 * Estas são placeholders funcionais — substitua por arte real seguindo
 * DOCS/ASSETS.md. Os keys de textura ficam iguais.
 */
export class AssetGenerator {
  constructor(private readonly scene: Phaser.Scene) {}

  generateAll(): void {
    this.generateGroundTiles();
    this.generateWaterTiles();
    this.generateCliffTiles();
    this.generateBridgeTiles();
    this.generateProps();
    this.generatePlayer();
    this.generateCoin();
    this.generateUi();
    this.generateMob();
  }

  // ============================================================
  // TILES
  // ============================================================

  private generateGroundTiles(): void {
    const t = TILE_SIZE;

    // grama base (4 variações pra evitar pattern visível)
    for (let v = 0; v < 4; v++) {
      this.makeTexture(`tile-grass-${v}`, t, t, (g) => {
        // base mid
        g.fillStyle(PALETTE.grassMid).fillRect(0, 0, t, t);
        // pinceladas claras (highlight)
        g.fillStyle(PALETTE.grassLight, 0.7);
        const hi = this.rng(v * 13 + 7, 6);
        for (let i = 0; i < hi.length; i += 2) {
          g.fillRect(hi[i]! % t, hi[i + 1]! % t, 2, 1);
        }
        // tufos escuros (sombra)
        g.fillStyle(PALETTE.grassDeep);
        const dk = this.rng(v * 17 + 3, 8);
        for (let i = 0; i < dk.length; i += 2) {
          const x = dk[i]! % t;
          const y = dk[i + 1]! % t;
          g.fillRect(x, y, 1, 1);
          g.fillRect(x + 1, y, 1, 1);
        }
        // ocasional flor minúscula (deep palette)
        if (v === 1 || v === 3) {
          g.fillStyle(PALETTE.flowerYellowDark, 0.6);
          g.fillRect((v * 11) % t, (v * 19) % t, 1, 1);
        }
      });
    }
    this.alias('tile-grass', 'tile-grass-0');
    this.alias('tile-grass-alt', 'tile-grass-1');

    // path / terra batida
    for (let v = 0; v < 3; v++) {
      this.makeTexture(`tile-path-${v}`, t, t, (g) => {
        g.fillStyle(PALETTE.pathMid).fillRect(0, 0, t, t);
        // pedrinhas escuras
        g.fillStyle(PALETTE.pathDark);
        const dk = this.rng(v * 23 + 5, 10);
        for (let i = 0; i < dk.length; i += 2) {
          g.fillRect(dk[i]! % t, dk[i + 1]! % t, 2, 1);
        }
        // pontos claros
        g.fillStyle(PALETTE.pathLight, 0.8);
        const lt = this.rng(v * 29 + 11, 8);
        for (let i = 0; i < lt.length; i += 2) {
          g.fillRect(lt[i]! % t, lt[i + 1]! % t, 1, 1);
        }
        // grama nas bordas (transição suave)
        g.fillStyle(PALETTE.grassMid);
        g.fillRect(0, 0, 2, 1);
        g.fillRect(t - 2, t - 1, 2, 1);
      });
    }
    this.alias('tile-path', 'tile-path-0');
  }

  private generateWaterTiles(): void {
    const t = TILE_SIZE;
    // água mid + onda
    for (let v = 0; v < 2; v++) {
      this.makeTexture(`tile-water-${v}`, t, t, (g) => {
        g.fillStyle(PALETTE.waterDeep).fillRect(0, 0, t, t);
        // gradiente fake — bandas horizontais
        g.fillStyle(PALETTE.waterMid).fillRect(0, 0, t, t * 0.6);
        g.fillStyle(PALETTE.waterLight, 0.6).fillRect(0, 0, t, t * 0.25);
        // brilhos / ondinhas
        g.fillStyle(PALETTE.waterFoam, 0.6);
        const off = v === 0 ? 0 : 4;
        g.fillRect(4 + off, 6, 6, 1);
        g.fillRect(18 - off, 14, 8, 1);
        g.fillRect(8 + off, 22, 5, 1);
        g.fillRect(22 - off, 26, 4, 1);
      });
    }
    this.alias('tile-water', 'tile-water-0');
    this.alias('tile-water-alt', 'tile-water-1');

    // foam shore (transição grama→água, lado norte da água)
    this.makeTexture('tile-water-shore-n', t, t, (g) => {
      g.fillStyle(PALETTE.waterDeep).fillRect(0, 0, t, t);
      g.fillStyle(PALETTE.waterMid).fillRect(0, 0, t, t * 0.6);
      // foam line
      g.fillStyle(PALETTE.waterFoam);
      g.fillRect(0, 0, t, 3);
      g.fillStyle(PALETTE.waterFoam, 0.6);
      g.fillRect(0, 3, t, 1);
      // pequenas pedras na margem
      g.fillStyle(PALETTE.cliffLight);
      g.fillRect(4, 1, 2, 1);
      g.fillRect(15, 0, 3, 1);
      g.fillRect(24, 1, 2, 1);
    });
  }

  private generateCliffTiles(): void {
    const t = TILE_SIZE;

    // top do penhasco (visto de cima — grama com borda)
    this.makeTexture('tile-cliff-top', t, t, (g) => {
      g.fillStyle(PALETTE.grassMid).fillRect(0, 0, t, t);
      g.fillStyle(PALETTE.grassLight, 0.7);
      g.fillRect(2, 4, 3, 1);
      g.fillRect(20, 8, 4, 1);
      g.fillRect(10, 22, 3, 1);
      // borda inferior (transição pra face)
      g.fillStyle(PALETTE.cliffOutline);
      g.fillRect(0, t - 1, t, 1);
    });

    // face do penhasco (sandstone/dirt)
    this.makeTexture('tile-cliff-face', t, t, (g) => {
      g.fillStyle(PALETTE.cliffMid).fillRect(0, 0, t, t);
      // banda clara no topo (luz)
      g.fillStyle(PALETTE.cliffHighlight).fillRect(0, 0, t, 4);
      g.fillStyle(PALETTE.cliffLight).fillRect(0, 4, t, 4);
      // sombras horizontais (estratificação)
      g.fillStyle(PALETTE.cliffDark);
      g.fillRect(0, 14, t, 1);
      g.fillRect(0, 24, t, 1);
      // pedrinhas
      g.fillStyle(PALETTE.cliffOutline);
      g.fillRect(6, 18, 2, 1);
      g.fillRect(20, 28, 2, 1);
      // outline lateral
      g.fillStyle(PALETTE.cliffOutline);
      g.fillRect(0, 0, 1, t);
      g.fillRect(t - 1, 0, 1, t);
    });

    // escada (visto de cima — degraus)
    this.makeTexture('tile-stairs', t, t, (g) => {
      g.fillStyle(PALETTE.cliffLight).fillRect(0, 0, t, t);
      // 4 degraus
      g.fillStyle(PALETTE.cliffMid);
      for (let i = 0; i < 4; i++) {
        g.fillRect(0, i * 8, t, 2);
      }
      g.fillStyle(PALETTE.cliffDark);
      for (let i = 0; i < 4; i++) {
        g.fillRect(0, i * 8 + 1, t, 1);
      }
      // outlines laterais
      g.fillStyle(PALETTE.cliffOutline);
      g.fillRect(0, 0, 1, t);
      g.fillRect(t - 1, 0, 1, t);
    });
  }

  private generateBridgeTiles(): void {
    const t = TILE_SIZE;

    // Tábua central (madeira tratada, mostra grão)
    this.makeTexture('tile-bridge', t, t, (g) => {
      g.fillStyle(PALETTE.woodMid).fillRect(0, 0, t, t);
      // tábuas verticais (3 tábuas)
      g.fillStyle(PALETTE.woodLight);
      g.fillRect(2, 2, 8, t - 4);
      g.fillRect(12, 2, 8, t - 4);
      g.fillRect(22, 2, 8, t - 4);
      // grão nas tábuas
      g.fillStyle(PALETTE.woodDark);
      g.fillRect(5, 8, 2, 1);
      g.fillRect(15, 18, 2, 1);
      g.fillRect(24, 12, 2, 1);
      g.fillRect(6, 22, 1, 1);
      g.fillRect(17, 26, 1, 1);
      // outline geral
      g.fillStyle(PALETTE.woodOutline);
      g.fillRect(0, 0, t, 1);
      g.fillRect(0, t - 1, t, 1);
      // separadores entre tábuas
      g.fillRect(10, 0, 1, t);
      g.fillRect(20, 0, 1, t);
      g.fillRect(30, 0, 1, t);
      g.fillRect(0, 0, 1, t);
    });

    // Borda lateral da ponte (com tora redonda como guard rail)
    this.makeTexture('tile-bridge-rail-n', t, t, (g) => {
      // água visível nos cantos
      g.fillStyle(PALETTE.waterMid).fillRect(0, 0, t, t);
      g.fillStyle(PALETTE.waterFoam, 0.4).fillRect(0, 0, t, 2);
      // tora horizontal com sombreado redondo
      g.fillStyle(PALETTE.woodOutline).fillRect(0, 8, t, 12);
      g.fillStyle(PALETTE.woodDark).fillRect(0, 9, t, 10);
      g.fillStyle(PALETTE.woodMid).fillRect(0, 10, t, 7);
      g.fillStyle(PALETTE.woodLight).fillRect(0, 11, t, 4);
      g.fillStyle(PALETTE.woodHighlight).fillRect(0, 12, t, 1);
      // anéis de tora (círculos pequenos no topo)
      g.fillStyle(PALETTE.woodDark);
      g.fillRect(8, 12, 2, 4);
      g.fillStyle(PALETTE.woodOutline);
      g.fillRect(8, 13, 1, 2);
    });
  }

  // ============================================================
  // PROPS
  // ============================================================

  private generateProps(): void {
    this.generateTree();
    this.generateStones();
    this.generateFlowers();
    this.generateSign();
    this.generateBush();
  }

  private generateTree(): void {
    // Árvore 56x72 — chunky, com outline e highlights
    const w = 56;
    const h = 72;

    this.makeTexture('prop-tree', w, h, (g) => {
      // tronco com outline
      g.fillStyle(PALETTE.treeOutline);
      g.fillRect(24, 48, 8, 24);
      g.fillStyle(PALETTE.treeTrunkDark);
      g.fillRect(25, 48, 6, 22);
      g.fillStyle(PALETTE.treeTrunkLight);
      g.fillRect(25, 48, 4, 22);
      g.fillStyle(PALETTE.treeTrunkHighlight);
      g.fillRect(25, 48, 1, 22);

      // base do tronco — raízes pequenas
      g.fillStyle(PALETTE.treeOutline);
      g.fillRect(22, 68, 12, 4);
      g.fillStyle(PALETTE.treeTrunkDark);
      g.fillRect(23, 68, 10, 2);

      // copa — vários círculos sobrepostos com OUTLINE primeiro (silhueta)
      const blobs: Array<[number, number, number]> = [
        [28, 30, 22], // central grande
        [16, 28, 14], // esquerdo
        [40, 32, 14], // direito
        [22, 18, 10], // topo-esquerdo
        [36, 18, 10], // topo-direito
        [28, 14, 8], // topo
      ];

      // outline (1px expandido)
      g.fillStyle(PALETTE.treeOutline);
      for (const [x, y, r] of blobs) g.fillCircle(x, y, r + 1);

      // base escura
      g.fillStyle(PALETTE.treeLeavesDeep);
      for (const [x, y, r] of blobs) g.fillCircle(x, y, r);

      // mid tone (deslocado pra dar volume)
      g.fillStyle(PALETTE.treeLeavesDark);
      g.fillCircle(28, 28, 18);
      g.fillCircle(18, 26, 11);
      g.fillCircle(38, 30, 11);

      // light
      g.fillStyle(PALETTE.treeLeavesMid);
      g.fillCircle(26, 24, 12);
      g.fillCircle(38, 24, 8);

      // highlight (canto superior esquerdo, simula luz vinda dali)
      g.fillStyle(PALETTE.treeLeavesLight);
      g.fillCircle(22, 18, 6);
      g.fillCircle(34, 16, 4);

      // pinceladas finais
      g.fillStyle(PALETTE.treeLeavesHighlight);
      g.fillCircle(20, 16, 2);
      g.fillCircle(32, 14, 2);
      g.fillRect(26, 22, 2, 1);
      g.fillRect(36, 22, 1, 1);

      // sombra no chão
      g.fillStyle(0x000000, 0.25);
      g.fillEllipse(28, 70, 24, 4);
    });
  }

  private generateStones(): void {
    // Pedra média 24x18
    this.makeTexture('prop-stone', 24, 18, (g) => {
      g.fillStyle(PALETTE.stoneOutline);
      g.fillRoundedRect(0, 4, 24, 14, 5);
      g.fillStyle(PALETTE.stoneDark);
      g.fillRoundedRect(1, 5, 22, 12, 4);
      g.fillStyle(PALETTE.stoneMid);
      g.fillRoundedRect(2, 4, 20, 10, 4);
      g.fillStyle(PALETTE.stoneLight);
      g.fillRoundedRect(3, 4, 16, 5, 3);
      // sombra
      g.fillStyle(0x000000, 0.2);
      g.fillEllipse(12, 17, 18, 2);
    });

    // Pedra grande 36x26
    this.makeTexture('prop-stone-big', 36, 26, (g) => {
      g.fillStyle(PALETTE.stoneOutline);
      g.fillRoundedRect(0, 6, 36, 20, 7);
      g.fillStyle(PALETTE.stoneDark);
      g.fillRoundedRect(1, 7, 34, 18, 6);
      g.fillStyle(PALETTE.stoneMid);
      g.fillRoundedRect(2, 6, 32, 14, 6);
      g.fillStyle(PALETTE.stoneLight);
      g.fillRoundedRect(3, 6, 24, 7, 4);
      // detalhe — rachadura
      g.fillStyle(PALETTE.stoneOutline);
      g.fillRect(14, 14, 4, 1);
      g.fillRect(15, 15, 6, 1);
      g.fillStyle(0x000000, 0.2);
      g.fillEllipse(18, 25, 28, 3);
    });

    // Pedrinha pequena (chão, decorativa)
    this.makeTexture('prop-pebble', 8, 6, (g) => {
      g.fillStyle(PALETTE.stoneOutline);
      g.fillRoundedRect(0, 1, 8, 5, 2);
      g.fillStyle(PALETTE.stoneMid);
      g.fillRoundedRect(1, 1, 6, 3, 2);
      g.fillStyle(PALETTE.stoneLight);
      g.fillRect(2, 1, 3, 1);
    });
  }

  private generateFlowers(): void {
    const make = (key: string, petal: number, petalDark: number, center: number) => {
      this.makeTexture(key, 12, 12, (g) => {
        // caule
        g.fillStyle(PALETTE.grassDeep);
        g.fillRect(5, 7, 1, 5);
        // outline pétalas
        g.fillStyle(petalDark);
        g.fillCircle(3, 4, 2);
        g.fillCircle(8, 4, 2);
        g.fillCircle(5, 2, 2);
        g.fillCircle(5, 7, 2);
        // pétalas
        g.fillStyle(petal);
        g.fillCircle(3, 4, 1);
        g.fillCircle(8, 4, 1);
        g.fillCircle(5, 2, 1);
        g.fillCircle(5, 7, 1);
        // miolo
        g.fillStyle(center);
        g.fillRect(5, 4, 1, 1);
        g.fillRect(5, 5, 1, 1);
      });
    };
    make('prop-flower-pink', PALETTE.flowerPink, PALETTE.flowerPinkDark, PALETTE.flowerCenter);
    make('prop-flower-yellow', PALETTE.flowerYellow, PALETTE.flowerYellowDark, PALETTE.flowerCenter);
    make('prop-flower-white', PALETTE.flowerWhite, PALETTE.cliffMid, PALETTE.flowerCenter);
  }

  private generateBush(): void {
    // Arbusto 28x20
    this.makeTexture('prop-bush', 28, 20, (g) => {
      const blobs: Array<[number, number, number]> = [
        [14, 12, 10],
        [6, 14, 6],
        [22, 14, 6],
        [10, 8, 6],
        [18, 8, 5],
      ];
      g.fillStyle(PALETTE.treeOutline);
      for (const [x, y, r] of blobs) g.fillCircle(x, y, r + 1);
      g.fillStyle(PALETTE.treeLeavesDark);
      for (const [x, y, r] of blobs) g.fillCircle(x, y, r);
      g.fillStyle(PALETTE.treeLeavesMid);
      g.fillCircle(12, 9, 7);
      g.fillCircle(20, 11, 5);
      g.fillStyle(PALETTE.treeLeavesLight);
      g.fillCircle(11, 7, 4);
      g.fillStyle(PALETTE.treeLeavesHighlight);
      g.fillCircle(10, 6, 2);
      g.fillStyle(0x000000, 0.18);
      g.fillEllipse(14, 19, 22, 2);
    });
  }

  private generateSign(): void {
    // Placa 24x28
    this.makeTexture('prop-sign', 24, 28, (g) => {
      // poste com outline
      g.fillStyle(PALETTE.woodOutline);
      g.fillRect(10, 14, 4, 14);
      g.fillStyle(PALETTE.woodDark);
      g.fillRect(11, 14, 2, 14);
      // tabuleta
      g.fillStyle(PALETTE.woodOutline);
      g.fillRoundedRect(2, 2, 20, 14, 2);
      g.fillStyle(PALETTE.woodMid);
      g.fillRoundedRect(3, 3, 18, 12, 2);
      g.fillStyle(PALETTE.woodLight);
      g.fillRect(4, 3, 16, 2);
      // texto fake
      g.fillStyle(PALETTE.woodOutline);
      g.fillRect(5, 7, 14, 1);
      g.fillRect(5, 9, 10, 1);
      g.fillRect(5, 11, 12, 1);
      g.fillStyle(0x000000, 0.2);
      g.fillEllipse(12, 27, 14, 2);
    });
  }

  // ============================================================
  // PLAYER (24x32, 4 dirs x 4 frames)
  // ============================================================

  private generatePlayer(): void {
    // Adventurer pack carrega texturas `player-idle-down` etc. e BootScene.createPlayerAnims
    // monta as anims. Se já carregou, não fazemos NADA aqui — placeholder procedural era
    // só pra dev sem assets, hoje nunca executa.
    if (this.scene.textures.exists('player-idle-down')) return;

    const fw = PLAYER_SPRITE_W;
    const fh = PLAYER_SPRITE_H;
    const cols = 4;
    const rows = 4;

    const rt = this.scene.add.renderTexture(0, 0, fw * cols, fh * rows).setVisible(false);
    const dirs: Array<'down' | 'up' | 'left' | 'right'> = ['down', 'up', 'left', 'right'];

    for (let r = 0; r < rows; r++) {
      const dir = dirs[r]!;
      for (let c = 0; c < cols; c++) {
        const g = this.scene.add.graphics().setVisible(false);
        this.drawPlayerFrame(g, dir, c, fw, fh);
        rt.draw(g, c * fw, r * fh);
        g.destroy();
      }
    }
    rt.saveTexture('player');
    rt.destroy();

    const playerTex = this.scene.textures.get('player');
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        playerTex.add(r * cols + c, 0, c * fw, r * fh, fw, fh);
      }
    }

    const anims = this.scene.anims;
    const ensure = (key: string, frames: number[], rate: number, repeat: number) => {
      if (anims.exists(key)) return;
      anims.create({
        key,
        frames: frames.map((f) => ({ key: 'player', frame: f })),
        frameRate: rate,
        repeat,
      });
    };
    const idx = (row: number, col: number) => row * cols + col;
    ensure('player-idle-down', [idx(0, 0)], 1, 0);
    ensure('player-idle-up', [idx(1, 0)], 1, 0);
    ensure('player-idle-left', [idx(2, 0)], 1, 0);
    ensure('player-idle-right', [idx(3, 0)], 1, 0);
    ensure('player-walk-down', [idx(0, 0), idx(0, 1), idx(0, 2), idx(0, 3)], 8, -1);
    ensure('player-walk-up', [idx(1, 0), idx(1, 1), idx(1, 2), idx(1, 3)], 8, -1);
    ensure('player-walk-left', [idx(2, 0), idx(2, 1), idx(2, 2), idx(2, 3)], 8, -1);
    ensure('player-walk-right', [idx(3, 0), idx(3, 1), idx(3, 2), idx(3, 3)], 8, -1);
  }

  private drawPlayerFrame(
    g: Phaser.GameObjects.Graphics,
    dir: 'down' | 'up' | 'left' | 'right',
    frame: number,
    fw: number,
    fh: number,
  ): void {
    const cx = Math.floor(fw / 2);
    // bobbing dos pés (animação caminhada)
    const lOff = frame === 1 ? 1 : frame === 3 ? -1 : 0;
    const rOff = frame === 1 ? -1 : frame === 3 ? 1 : 0;
    const headBob = frame === 1 || frame === 3 ? 1 : 0;

    // ===== sombra =====
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(cx, fh - 1, 14, 3);

    // ===== pernas (botas + calça) =====
    // outline
    g.fillStyle(PALETTE.playerOutline);
    g.fillRect(cx - 5, fh - 11, 4, 8 + lOff);
    g.fillRect(cx + 1, fh - 11, 4, 8 + rOff);
    // calça
    g.fillStyle(PALETTE.playerPants);
    g.fillRect(cx - 4, fh - 11, 2, 6 + lOff);
    g.fillRect(cx + 2, fh - 11, 2, 6 + rOff);
    g.fillStyle(PALETTE.playerPantsShade);
    g.fillRect(cx - 4, fh - 7 + lOff, 2, 1);
    g.fillRect(cx + 2, fh - 7 + rOff, 2, 1);
    // botas
    g.fillStyle(PALETTE.playerBoots);
    g.fillRect(cx - 5, fh - 4 + lOff, 4, 3);
    g.fillRect(cx + 1, fh - 4 + rOff, 4, 3);

    // ===== torso (camisa) =====
    const torsoY = fh - 17 - headBob;
    g.fillStyle(PALETTE.playerOutline);
    g.fillRect(cx - 6, torsoY, 12, 8);
    g.fillStyle(PALETTE.playerShirt);
    g.fillRect(cx - 5, torsoY, 10, 7);
    g.fillStyle(PALETTE.playerShirtShade);
    g.fillRect(cx - 5, torsoY + 5, 10, 2);
    g.fillStyle(PALETTE.playerShirt);
    g.fillRect(cx - 4, torsoY + 1, 8, 4);

    // sash vermelho na cintura
    g.fillStyle(PALETTE.playerSash);
    g.fillRect(cx - 5, torsoY + 6, 10, 2);

    // ===== braços =====
    const armOff = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    g.fillStyle(PALETTE.playerOutline);
    g.fillRect(cx - 7, torsoY + 1 + (frame === 1 ? 1 : 0), 2, 6);
    g.fillRect(cx + 5, torsoY + 1 + (frame === 3 ? 1 : 0), 2, 6);
    g.fillStyle(PALETTE.playerShirt);
    g.fillRect(cx - 7, torsoY + 1 + (frame === 1 ? 1 : 0), 1, 5);
    g.fillRect(cx + 6, torsoY + 1 + (frame === 3 ? 1 : 0), 1, 5);
    // mão
    g.fillStyle(PALETTE.playerSkin);
    g.fillRect(cx - 7, torsoY + 6 + (frame === 1 ? 1 : 0), 2, 1);
    g.fillRect(cx + 5, torsoY + 6 + (frame === 3 ? 1 : 0), 2, 1);
    void armOff;

    // ===== cabeça =====
    const headY = fh - 22 - headBob;
    // outline
    g.fillStyle(PALETTE.playerOutline);
    g.fillCircle(cx, headY, 6);
    // pele
    g.fillStyle(PALETTE.playerSkin);
    g.fillCircle(cx, headY, 5);
    // sombra do cabelo na pele
    g.fillStyle(PALETTE.playerSkinShade);
    g.fillRect(cx - 4, headY - 1, 8, 1);

    // cabelo (varia por direção)
    g.fillStyle(PALETTE.playerHair);
    if (dir === 'up') {
      g.fillCircle(cx, headY - 1, 6);
      g.fillRect(cx - 5, headY - 2, 10, 4);
    } else if (dir === 'down') {
      g.fillRect(cx - 5, headY - 5, 10, 4);
      g.fillRect(cx - 5, headY - 4, 1, 4);
      g.fillRect(cx + 4, headY - 4, 1, 4);
      // franja
      g.fillRect(cx - 3, headY - 2, 6, 2);
      g.fillStyle(PALETTE.playerHairHighlight);
      g.fillRect(cx + 1, headY - 4, 2, 2);
    } else if (dir === 'left') {
      g.fillRect(cx - 5, headY - 5, 9, 4);
      g.fillRect(cx - 5, headY - 4, 2, 5);
      g.fillRect(cx - 3, headY - 1, 4, 2);
    } else {
      g.fillRect(cx - 4, headY - 5, 9, 4);
      g.fillRect(cx + 3, headY - 4, 2, 5);
      g.fillRect(cx - 1, headY - 1, 4, 2);
      g.fillStyle(PALETTE.playerHairHighlight);
      g.fillRect(cx - 3, headY - 4, 2, 2);
    }

    // olhos / detalhes faciais
    if (dir !== 'up') {
      g.fillStyle(PALETTE.playerOutline);
      if (dir === 'down') {
        g.fillRect(cx - 2, headY, 1, 1);
        g.fillRect(cx + 1, headY, 1, 1);
        // boca
        g.fillRect(cx, headY + 2, 1, 1);
        // bochechas
        g.fillStyle(PALETTE.playerSash);
        g.fillRect(cx - 3, headY + 1, 1, 1);
        g.fillRect(cx + 2, headY + 1, 1, 1);
      } else if (dir === 'left') {
        g.fillRect(cx - 3, headY, 1, 1);
        g.fillRect(cx, headY, 1, 1);
        g.fillStyle(PALETTE.playerSash);
        g.fillRect(cx - 3, headY + 1, 1, 1);
      } else {
        g.fillRect(cx, headY, 1, 1);
        g.fillRect(cx + 2, headY, 1, 1);
        g.fillStyle(PALETTE.playerSash);
        g.fillRect(cx + 2, headY + 1, 1, 1);
      }
    }
  }

  // ============================================================
  // COIN
  // ============================================================
  private generateCoin(): void {
    const fw = 14;
    const fh = 14;
    const cols = 6;

    const rt = this.scene.add.renderTexture(0, 0, fw * cols, fh).setVisible(false);
    const widths = [10, 8, 4, 2, 4, 8];
    for (let c = 0; c < cols; c++) {
      const g = this.scene.add.graphics().setVisible(false);
      const w = widths[c]!;
      const cx = fw / 2;
      const cy = fh / 2;
      // outline
      g.fillStyle(PALETTE.coinDark);
      g.fillEllipse(cx, cy, w + 2, 12);
      // base
      g.fillStyle(PALETTE.coinGold);
      g.fillEllipse(cx, cy, w, 10);
      if (w > 3) {
        g.fillStyle(PALETTE.coinShine);
        g.fillEllipse(cx - w / 5, cy - 1, Math.max(1, w / 3), 2);
      }
      rt.draw(g, c * fw, 0);
      g.destroy();
    }
    rt.saveTexture('coin');
    rt.destroy();
    const coinTex = this.scene.textures.get('coin');
    for (let c = 0; c < cols; c++) {
      coinTex.add(c, 0, c * fw, 0, fw, fh);
    }
    if (!this.scene.anims.exists('coin-spin')) {
      this.scene.anims.create({
        key: 'coin-spin',
        frames: Array.from({ length: cols }, (_, i) => ({ key: 'coin', frame: i })),
        frameRate: 10,
        repeat: -1,
      });
    }
  }

  // ============================================================
  // UI
  // ============================================================
  // ============================================================
  // MOB — slime 24x20, 4 frames idle (squash/stretch)
  // ============================================================
  private generateMob(): void {
    const fw = 24;
    const fh = 20;
    const cols = 4;
    const rt = this.scene.add.renderTexture(0, 0, fw * cols, fh).setVisible(false);

    // Cores do slime (verde-azulado, paleta cozy)
    const SLIME_OUTLINE = 0x1f3a2e;
    const SLIME_DARK = 0x3d6e5a;
    const SLIME_MID = 0x5c9c7e;
    const SLIME_LIGHT = 0x86c5a3;
    const SLIME_HIGHLIGHT = 0xb3e3c4;

    for (let c = 0; c < cols; c++) {
      const g = this.scene.add.graphics().setVisible(false);

      // squash/stretch: c=0 normal, c=1 squash (mais wide), c=2 normal, c=3 stretch (mais tall)
      const wMod = c === 1 ? 2 : c === 3 ? -2 : 0;
      const hMod = c === 1 ? -2 : c === 3 ? 2 : 0;
      const w = 18 + wMod;
      const h = 12 + hMod;
      const cx = fw / 2;
      const cy = fh - 4 - h / 2;

      // sombra
      g.fillStyle(0x000000, 0.25);
      g.fillEllipse(cx, fh - 2, w + 4, 4);

      // outline (oval expandido)
      g.fillStyle(SLIME_OUTLINE);
      g.fillEllipse(cx, cy, w + 2, h + 2);
      // bottom flat (slime sentado no chão)
      g.fillRect(cx - (w + 2) / 2, fh - 4, w + 2, 1);

      // base mid
      g.fillStyle(SLIME_MID);
      g.fillEllipse(cx, cy, w, h);

      // sombra inferior
      g.fillStyle(SLIME_DARK);
      g.fillEllipse(cx, cy + 2, w - 2, h * 0.7);

      // highlight (luz vinda do canto sup-esq)
      g.fillStyle(SLIME_LIGHT);
      g.fillEllipse(cx - 2, cy - 2, w * 0.6, h * 0.5);
      g.fillStyle(SLIME_HIGHLIGHT);
      g.fillEllipse(cx - 3, cy - 3, w * 0.25, h * 0.25);

      // olhos (2 pretos, com brilho branco)
      const eyeY = cy - 1;
      g.fillStyle(0x1a1a1a);
      g.fillCircle(cx - 3, eyeY, 1.5);
      g.fillCircle(cx + 3, eyeY, 1.5);
      g.fillStyle(0xffffff);
      g.fillRect(cx - 3, eyeY - 1, 1, 1);
      g.fillRect(cx + 3, eyeY - 1, 1, 1);

      rt.draw(g, c * fw, 0);
      g.destroy();
    }

    rt.saveTexture('mob-slime');
    rt.destroy();

    if (!this.scene.anims.exists('slime-idle')) {
      this.scene.anims.create({
        key: 'slime-idle',
        frames: Array.from({ length: cols }, (_, i) => ({ key: 'mob-slime', frame: i })),
        frameRate: 6,
        repeat: -1,
      });
    }
  }

  private generateUi(): void {
    // Coração 18x16 (chunky cozy)
    const drawHeart = (g: Phaser.GameObjects.Graphics, fillTop: number, fillBottom: number) => {
      // outline
      g.fillStyle(PALETTE.uiHeartDark);
      g.fillCircle(5, 5, 4);
      g.fillCircle(13, 5, 4);
      g.fillTriangle(1, 6, 17, 6, 9, 16);
      // fill superior (highlight)
      g.fillStyle(fillTop);
      g.fillCircle(5, 5, 3);
      g.fillCircle(13, 5, 3);
      g.fillTriangle(2, 6, 16, 6, 9, 15);
      // sombra inferior
      g.fillStyle(fillBottom);
      g.fillTriangle(3, 9, 15, 9, 9, 15);
      // brilho
      g.fillStyle(PALETTE.uiHeartHighlight);
      g.fillCircle(4, 4, 1);
    };

    this.makeTexture('ui-heart-full', 18, 16, (g) => {
      drawHeart(g, PALETTE.uiHeart, PALETTE.uiHeartDark);
    });

    this.makeTexture('ui-heart-half', 18, 16, (g) => {
      // base vazia
      g.fillStyle(PALETTE.uiHeartDark);
      g.fillCircle(5, 5, 4);
      g.fillCircle(13, 5, 4);
      g.fillTriangle(1, 6, 17, 6, 9, 16);
      g.fillStyle(PALETTE.uiHeartEmpty);
      g.fillCircle(5, 5, 3);
      g.fillCircle(13, 5, 3);
      g.fillTriangle(2, 6, 16, 6, 9, 15);
      // metade esquerda cheia
      g.fillStyle(PALETTE.uiHeart);
      g.fillCircle(5, 5, 3);
      g.fillTriangle(2, 6, 9, 6, 9, 15);
      g.fillStyle(PALETTE.uiHeartHighlight);
      g.fillCircle(4, 4, 1);
    });

    this.makeTexture('ui-heart-empty', 18, 16, (g) => {
      g.fillStyle(PALETTE.uiHeartDark);
      g.fillCircle(5, 5, 4);
      g.fillCircle(13, 5, 4);
      g.fillTriangle(1, 6, 17, 6, 9, 16);
      g.fillStyle(PALETTE.uiHeartEmpty);
      g.fillCircle(5, 5, 3);
      g.fillCircle(13, 5, 3);
      g.fillTriangle(2, 6, 16, 6, 9, 15);
    });

    this.makeTexture('ui-pixel', 1, 1, (g) => {
      g.fillStyle(0xffffff).fillRect(0, 0, 1, 1);
    });
  }

  // ============================================================
  // helpers
  // ============================================================
  private makeTexture(
    key: string,
    w: number,
    h: number,
    draw: (g: Phaser.GameObjects.Graphics) => void,
  ): void {
    if (this.scene.textures.exists(key)) return;
    const g = this.scene.add.graphics().setVisible(false);
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private alias(newKey: string, fromKey: string): void {
    if (this.scene.textures.exists(newKey)) return;
    const tex = this.scene.textures.get(fromKey);
    if (!tex) return;
    const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    if (src) this.scene.textures.addImage(newKey, src as HTMLImageElement);
  }

  // PRNG simples (mulberry32-ish) pra ter variação determinística
  private rng(seed: number, count: number): number[] {
    let s = seed >>> 0;
    const out: number[] = [];
    for (let i = 0; i < count * 2; i++) {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      out.push(((t ^ (t >>> 14)) >>> 0) % 1024);
    }
    return out;
  }
}
