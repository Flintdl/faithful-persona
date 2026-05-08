import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PALETTE } from '@/config/GameConfig';
import type {
  MafiaAbilityResultEvent,
  MafiaNightResultsEvent,
  MafiaPhase,
  MafiaPhaseChangedEvent,
  MafiaRoleAssignedEvent,
  MafiaTimerUpdateEvent,
  MafiaVoteReceivedEvent,
  MafiaVoteResultEvent,
  RoomPlayer,
  RoomSummary,
} from '@/events/socket.events';
import { socketService } from '@/services/SocketService';
import { soundManager } from '@/services/SoundManager';
import { log } from '@/utils/Logger';

type HudInitData = { room: RoomSummary };

const PHASE_LABELS: Record<MafiaPhase, string> = {
  LOBBY: 'Aguardando',
  ROLE_ASSIGNMENT: 'Distribuindo Papéis',
  DAY_DISCUSSION: 'Discussão Diurna',
  VOTING: 'Votação',
  NIGHT: 'Noite',
  END: 'Fim',
};

const PHASE_COLORS: Record<MafiaPhase, string> = {
  LOBBY: '#8a8aa6',
  ROLE_ASSIGNMENT: '#d4a017',
  DAY_DISCUSSION: '#f3c54a',
  VOTING: '#e85a5a',
  NIGHT: '#5a72d4',
  END: '#8a8aa6',
};

const PHASE_TRANSITION_TITLES: Record<MafiaPhase, string> = {
  LOBBY: 'AGUARDANDO',
  ROLE_ASSIGNMENT: 'DISTRIBUINDO PAPÉIS',
  DAY_DISCUSSION: 'O DIA AMANHECE',
  VOTING: 'A VOTAÇÃO COMEÇA',
  NIGHT: 'A NOITE CAI',
  END: 'FIM DE JOGO',
};

const PHASE_TRANSITION_SUBTITLES: Record<MafiaPhase, string> = {
  LOBBY: '',
  ROLE_ASSIGNMENT: 'Os destinos são revelados',
  DAY_DISCUSSION: 'Discutam quem suspeitam',
  VOTING: 'Escolham quem eliminar',
  NIGHT: 'Lobos caçam nas sombras',
  END: '',
};

const TEAM_COLORS: Record<string, number> = {
  VILLAGE: 0x86b56a,
  WEREWOLF: 0xc53030,
  SOLO: 0x9c7211,
  NEUTRAL: 0x8a8aa6,
};

const hexStrToNumber = (hex: string): number => Number.parseInt(hex.replace('#', ''), 16);

/**
 * HudScene — overlay paralelo ao WorldScene (lançado via scene.launch).
 *
 * Mostra timer de fase, label da fase, dia, role card e lista de jogadores vivos.
 * Recebe eventos `mafia:*` direto do socket; WorldScene cuida do teleport por fase.
 */
export class HudScene extends Phaser.Scene {
  private room!: RoomSummary;
  private alive = new Set<string>();
  private players = new Map<string, RoomPlayer>();

  private phaseLabel!: Phaser.GameObjects.Text;
  private dayLabel!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private timerBar!: Phaser.GameObjects.Graphics;
  private roleNameText!: Phaser.GameObjects.Text;
  private roleTeamText!: Phaser.GameObjects.Text;
  private roleDescText!: Phaser.GameObjects.Text;
  private playerListText!: Phaser.GameObjects.Text;

  private currentPhase: MafiaPhase = 'LOBBY';
  private phaseDuration = 1;
  private timeLeft = 0;
  private myRole?: MafiaRoleAssignedEvent;

  private onPhaseChanged = (data: MafiaPhaseChangedEvent) => this.applyPhaseChange(data);
  private onTimerUpdate = (data: MafiaTimerUpdateEvent) => this.applyTimerUpdate(data);
  private onRoleAssigned = (data: MafiaRoleAssignedEvent) => this.applyRoleAssigned(data);
  private onPlayerDied = (data: { playerId: string }) => this.applyDeath(data.playerId);
  private onVoteReceived = (data: MafiaVoteReceivedEvent) => this.applyVoteReceived(data);
  private onVoteResult = (data: MafiaVoteResultEvent) => this.applyVoteResult(data);
  private onAbilityResult = (data: MafiaAbilityResultEvent) => this.applyAbilityResult(data);
  private onNightResults = (data: MafiaNightResultsEvent) => this.applyNightResults(data);

  /** Map<targetId, count> dos votos correntes (limpa em phase_changed). */
  private voteCounts = new Map<string, number>();

  constructor() {
    super('Hud');
  }

  init(data: HudInitData): void {
    this.room = data.room;
    for (const p of this.room.players) {
      this.players.set(p.userId, p);
      this.alive.add(p.userId);
    }
  }

  create(): void {
    this.drawTopBar();
    this.drawRoleCard();
    this.drawPlayerList();

    this.wireSocket();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unwireSocket());

    log.info('HudScene ready', { players: this.players.size });
  }

  override update(): void {
    if (this.currentPhase === 'LOBBY' || this.currentPhase === 'END') return;
    // Timer client-side suave (server tick eventual realinha em applyTimerUpdate)
    if (this.timeLeft > 0) {
      this.timeLeft = Math.max(0, this.timeLeft - this.game.loop.delta / 1000);
      this.renderTimer();
    }
  }

  // ============== TOP BAR (timer + phase) ==============
  private drawTopBar(): void {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.55);
    g.fillRect(0, 0, GAME_WIDTH, 56);
    g.lineStyle(1, PALETTE.goldDark, 0.4);
    g.lineBetween(0, 56, GAME_WIDTH, 56);

    this.phaseLabel = this.add
      .text(20, 14, '—', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#d4a017',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);

    this.dayLabel = this.add
      .text(20, 34, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#8a8aa6',
      })
      .setOrigin(0, 0);

    this.timerText = this.add
      .text(GAME_WIDTH / 2, 18, '--', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#e8e2d0',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);

    this.timerBar = this.add.graphics();
    this.renderTimer();
  }

  private renderTimer(): void {
    const cx = GAME_WIDTH / 2;
    const w = 160;
    const h = 4;
    const x = cx - w / 2;
    const y = 48;
    const ratio = this.phaseDuration > 0 ? Math.max(0, this.timeLeft / this.phaseDuration) : 0;

    this.timerBar.clear();
    this.timerBar.fillStyle(0x14141c, 0.8);
    this.timerBar.fillRect(x, y, w, h);
    const colorHex = PHASE_COLORS[this.currentPhase];
    this.timerBar.fillStyle(Number.parseInt(colorHex.replace('#', ''), 16), 1);
    this.timerBar.fillRect(x, y, w * ratio, h);

    this.timerText.setText(this.timeLeft > 0 ? Math.ceil(this.timeLeft).toString() : '--');
    this.timerText.setColor(colorHex);
  }

  // ============== ROLE CARD (bottom-left) ==============
  private drawRoleCard(): void {
    const x = 12;
    const y = GAME_HEIGHT - 96;
    const w = 220;
    const h = 84;

    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.6);
    g.fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(1, PALETTE.goldDark, 0.5);
    g.strokeRoundedRect(x, y, w, h, 6);

    this.add
      .text(x + 12, y + 8, 'SEU PAPEL', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#8a8aa6',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);

    this.roleNameText = this.add
      .text(x + 12, y + 22, 'aguardando…', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#d4a017',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);

    this.roleTeamText = this.add
      .text(x + 12, y + 42, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#8a8aa6',
      })
      .setOrigin(0, 0);

    this.roleDescText = this.add
      .text(x + 12, y + 58, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#e8e2d0',
        wordWrap: { width: w - 24 },
      })
      .setOrigin(0, 0);
  }

  // ============== PLAYER LIST (right side) ==============
  private drawPlayerList(): void {
    const x = GAME_WIDTH - 162;
    const y = 70;
    const w = 150;
    const h = GAME_HEIGHT - 90;

    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(1, PALETTE.goldDark, 0.3);
    g.strokeRoundedRect(x, y, w, h, 6);

    this.add
      .text(x + 10, y + 8, 'JOGADORES', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#d4a017',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);

    this.playerListText = this.add
      .text(x + 10, y + 26, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#e8e2d0',
        lineSpacing: 5,
        wordWrap: { width: w - 20 },
      })
      .setOrigin(0, 0);

    this.refreshPlayerList();
  }

  private refreshPlayerList(): void {
    const lines: string[] = [];
    for (const [, p] of this.players) {
      const dead = !this.alive.has(p.userId);
      const prefix = dead ? '✕' : '●';
      const votes = this.voteCounts.get(p.userId) ?? 0;
      const voteTag = votes > 0 ? ` [${votes}v]` : '';
      const username = dead ? `${p.username} (morto)` : `${p.username}${voteTag}`;
      lines.push(`${prefix} ${username}`);
    }
    this.playerListText.setText(lines.join('\n'));
  }

  // ============== APPLIERS ==============
  private applyPhaseChange(data: MafiaPhaseChangedEvent): void {
    this.currentPhase = data.phase;
    this.phaseDuration = data.duration || 1;
    this.timeLeft = data.duration || 0;
    this.phaseLabel.setText(PHASE_LABELS[data.phase] ?? data.phase);
    this.phaseLabel.setColor(PHASE_COLORS[data.phase]);
    this.dayLabel.setText(`Dia ${data.dayNumber}`);
    this.renderTimer();
    this.playPhaseTransition(data.phase, data.dayNumber);
    // SFX de "sua vez" ao entrar em fase de ação (VOTING ou NIGHT)
    if (data.phase === 'VOTING' || data.phase === 'NIGHT') {
      soundManager.playSfx('turn');
    }
    // Reset vote counts ao entrar em VOTING (ou ao sair)
    if (data.phase === 'VOTING' || data.phase === 'NIGHT' || data.phase === 'DAY_DISCUSSION') {
      this.voteCounts.clear();
      this.refreshPlayerList();
    }
  }

  private applyTimerUpdate(data: MafiaTimerUpdateEvent): void {
    const t = data.timeLeft ?? data.time ?? data.remainingTime;
    if (t !== undefined) {
      // Tick warning nos últimos 10s da fase (tensão final)
      if (
        (this.currentPhase === 'VOTING' || this.currentPhase === 'DAY_DISCUSSION') &&
        t <= 10 &&
        t > 0 &&
        Math.floor(this.timeLeft) !== Math.floor(t)
      ) {
        soundManager.playSfx('tick', 0.4);
      }
      this.timeLeft = t;
    }
    this.renderTimer();
  }

  private applyRoleAssigned(data: MafiaRoleAssignedEvent): void {
    this.myRole = data;
    const name = data.roleInfo?.name ?? data.role;
    const team = data.roleInfo?.team ?? '—';
    const desc = data.roleInfo?.description ?? '';
    this.roleNameText.setText(name.toString());
    this.roleTeamText.setText(`Facção: ${team}`);
    this.roleDescText.setText(desc.toString().slice(0, 120));
    this.showRoleReveal(data);
  }

  private applyDeath(playerId: string): void {
    this.alive.delete(playerId);
    this.refreshPlayerList();
    soundManager.playSfx('slide', 0.7);
  }

  // ============== VOTE / ABILITY / NIGHT FEEDBACK ==============
  private applyVoteReceived(data: MafiaVoteReceivedEvent): void {
    if (data.skipped || !data.targetId) {
      this.showResultBanner(`${this.players.get(data.voterId)?.username ?? '?'} pulou o voto.`, '#8a8aa6');
      return;
    }
    if (typeof data.voteCount === 'number') {
      this.voteCounts.set(data.targetId, data.voteCount);
    } else {
      this.voteCounts.set(data.targetId, (this.voteCounts.get(data.targetId) ?? 0) + 1);
    }
    this.refreshPlayerList();
    const voter = this.players.get(data.voterId)?.username ?? data.voterId.slice(0, 6);
    const target = this.players.get(data.targetId)?.username ?? data.targetId.slice(0, 6);
    this.showResultBanner(`${voter} votou em ${target}`, '#f3c54a');
  }

  private applyVoteResult(data: MafiaVoteResultEvent): void {
    if (data.tie) {
      this.showResultBanner('Empate na votação — ninguém foi linchado.', '#8a8aa6');
      soundManager.playSfx('select', 0.6);
      return;
    }
    if (data.eliminated) {
      const name = data.eliminatedName ?? data.eliminated.slice(0, 6);
      const role = data.eliminatedRole ? ` (era ${data.eliminatedRole})` : '';
      this.showResultBanner(`${name} foi linchado${role}`, '#e85a5a');
      soundManager.playSfx('slide', 0.8);
    } else {
      this.showResultBanner('Votação encerrada sem eliminação.', '#8a8aa6');
      soundManager.playSfx('select', 0.5);
    }
  }

  private applyAbilityResult(data: MafiaAbilityResultEvent): void {
    // Ability result é PRIVADO (server emite apenas pro autor da ação).
    // Vidente: result = { targetName, role, team } → mostrar destaque.
    if (data.type === 'CHECK' && data.result) {
      const tn = data.result.targetName ?? data.result.targetId ?? '?';
      const role = data.result.role ?? '?';
      this.showResultBanner(`👁 ${tn} é ${role}`, '#5a72d4', 5000);
      return;
    }
    if (data.message) {
      this.showResultBanner(data.message, '#d4a017');
    }
  }

  private applyNightResults(data: MafiaNightResultsEvent): void {
    if (!data.deaths || data.deaths.length === 0) {
      this.showResultBanner('A noite terminou. Ninguém morreu.', '#86b56a', 4000);
      soundManager.playSfx('select', 0.5);
      return;
    }
    const list = data.deaths
      .map((d) => `${d.playerName ?? d.playerId.slice(0, 6)}${d.role ? ` (${d.role})` : ''}`)
      .join(', ');
    this.showResultBanner(`☠ Mortes na noite: ${list}`, '#c53030', 5500);
    soundManager.playSfx('slide', 0.9);
  }

  // ============== RESULT BANNER ==============
  private resultBanner?: Phaser.GameObjects.Container;

  private showResultBanner(text: string, colorHex: string, durationMs = 3500): void {
    this.resultBanner?.destroy();
    const cy = GAME_HEIGHT - 130;
    const w = Math.min(GAME_WIDTH - 360, 540);
    const x = (GAME_WIDTH - w) / 2;
    const h = 38;

    const c = this.add.container(0, 0);
    c.setDepth(900);
    this.resultBanner = c;

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.85);
    bg.fillRoundedRect(x, cy, w, h, 6);
    bg.lineStyle(1, hexStrToNumber(colorHex), 0.8);
    bg.strokeRoundedRect(x, cy, w, h, 6);

    const accent = this.add.graphics();
    accent.fillStyle(hexStrToNumber(colorHex), 1);
    accent.fillRect(x, cy, 3, h);

    const label = this.add
      .text(x + w / 2, cy + h / 2, text, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: colorHex,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    c.add([bg, accent, label]);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 180 });
    this.time.delayedCall(durationMs, () => {
      this.tweens.add({
        targets: c,
        alpha: 0,
        duration: 220,
        onComplete: () => c.destroy(),
      });
    });
  }

  // ============== PHASE TRANSITION OVERLAY ==============
  private phaseTransitionContainer?: Phaser.GameObjects.Container;

  private playPhaseTransition(phase: MafiaPhase, dayNumber: number): void {
    if (phase === 'LOBBY') return;
    // Limpa transição anterior em andamento
    this.phaseTransitionContainer?.destroy();

    const container = this.add.container(0, 0);
    container.setDepth(1000);
    this.phaseTransitionContainer = container;

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.85);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const colorNum = hexStrToNumber(PHASE_COLORS[phase]);

    const accent = this.add.graphics();
    accent.fillStyle(colorNum, 0.18);
    accent.fillRect(0, GAME_HEIGHT / 2 - 80, GAME_WIDTH, 160);
    accent.lineStyle(2, colorNum, 0.6);
    accent.lineBetween(0, GAME_HEIGHT / 2 - 80, GAME_WIDTH, GAME_HEIGHT / 2 - 80);
    accent.lineBetween(0, GAME_HEIGHT / 2 + 80, GAME_WIDTH, GAME_HEIGHT / 2 + 80);

    const dayPrefix = dayNumber > 0 ? `DIA ${dayNumber} · ` : '';
    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, dayPrefix + PHASE_TRANSITION_TITLES[phase], {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: PHASE_COLORS[phase],
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const subtitle = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 26, PHASE_TRANSITION_SUBTITLES[phase], {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#e8e2d0',
      })
      .setOrigin(0.5);

    container.add([bg, accent, title, subtitle]);
    container.setAlpha(0);

    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 220,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: container,
          alpha: 0,
          duration: 350,
          delay: 1100,
          ease: 'Sine.easeIn',
          onComplete: () => container.destroy(),
        });
      },
    });
  }

  // ============== ROLE REVEAL MODAL ==============
  private roleRevealContainer?: Phaser.GameObjects.Container;

  private showRoleReveal(data: MafiaRoleAssignedEvent): void {
    this.roleRevealContainer?.destroy();

    const container = this.add.container(0, 0);
    container.setDepth(1100);
    this.roleRevealContainer = container;

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.9);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const cardW = 360;
    const cardH = 280;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const teamStr = (data.roleInfo?.team ?? 'NEUTRAL').toString();
    const teamColor = TEAM_COLORS[teamStr] ?? TEAM_COLORS.NEUTRAL!;

    const card = this.add.graphics();
    card.fillStyle(0x14141c, 1);
    card.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 12);
    card.lineStyle(2, teamColor, 1);
    card.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 12);

    // Faixa colorida no topo do card
    const topStrip = this.add.graphics();
    topStrip.fillStyle(teamColor, 0.25);
    topStrip.fillRoundedRect(cx - cardW / 2 + 2, cy - cardH / 2 + 2, cardW - 4, 56, 10);

    const tagline = this.add
      .text(cx, cy - cardH / 2 + 22, 'SEU PAPEL É', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#8a8aa6',
        letterSpacing: 4,
      })
      .setOrigin(0.5);

    const roleName = this.add
      .text(cx, cy - cardH / 2 + 46, (data.roleInfo?.name ?? data.role).toString().toUpperCase(), {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: '#e8e2d0',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const team = this.add
      .text(cx, cy - cardH / 2 + 80, `FACÇÃO: ${teamStr}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#' + teamColor.toString(16).padStart(6, '0'),
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const desc = this.add
      .text(cx, cy - 4, (data.roleInfo?.description ?? '').toString(), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#e8e2d0',
        align: 'center',
        wordWrap: { width: cardW - 32 },
        lineSpacing: 4,
      })
      .setOrigin(0.5);

    const teammatesNames = (data.teammates ?? [])
      .map((t) => t.username ?? t.playerId.slice(0, 6))
      .join(', ');
    const teammatesText = this.add
      .text(
        cx,
        cy + cardH / 2 - 56,
        teammatesNames ? `Aliados: ${teammatesNames}` : '',
        {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#d4a017',
          align: 'center',
          wordWrap: { width: cardW - 32 },
        },
      )
      .setOrigin(0.5);

    const dismiss = this.add
      .text(cx, cy + cardH / 2 - 22, '[ ENTENDI ]', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#d4a017',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    container.add([bg, card, topStrip, tagline, roleName, team, desc, teammatesText, dismiss]);
    container.setAlpha(0);
    this.tweens.add({ targets: container, alpha: 1, duration: 280, ease: 'Sine.easeOut' });

    const close = () => {
      this.tweens.add({
        targets: container,
        alpha: 0,
        duration: 220,
        ease: 'Sine.easeIn',
        onComplete: () => container.destroy(),
      });
      autoTimer.remove();
    };

    dismiss.on('pointerdown', close);
    // Auto-close após 5s
    const autoTimer = this.time.delayedCall(5000, close);
  }

  // ============== SOCKET WIRE ==============
  private wireSocket(): void {
    socketService.on<MafiaPhaseChangedEvent>('mafia:phase_changed', this.onPhaseChanged);
    socketService.on<MafiaTimerUpdateEvent>('mafia:timer_update', this.onTimerUpdate);
    socketService.on<MafiaRoleAssignedEvent>('mafia:role_assigned', this.onRoleAssigned);
    socketService.on<{ playerId: string }>('mafia:player_died', this.onPlayerDied);
    socketService.on<MafiaVoteReceivedEvent>('mafia:vote_received', this.onVoteReceived);
    socketService.on<MafiaVoteResultEvent>('mafia:vote_result', this.onVoteResult);
    socketService.on<MafiaAbilityResultEvent>('mafia:ability_result', this.onAbilityResult);
    socketService.on<MafiaNightResultsEvent>('mafia:night_results', this.onNightResults);
  }

  private unwireSocket(): void {
    socketService.off('mafia:phase_changed', this.onPhaseChanged);
    socketService.off('mafia:timer_update', this.onTimerUpdate);
    socketService.off('mafia:role_assigned', this.onRoleAssigned);
    socketService.off('mafia:player_died', this.onPlayerDied);
    socketService.off('mafia:vote_received', this.onVoteReceived);
    socketService.off('mafia:vote_result', this.onVoteResult);
    socketService.off('mafia:ability_result', this.onAbilityResult);
    socketService.off('mafia:night_results', this.onNightResults);
  }
}
