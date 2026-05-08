import type {
  Achievement,
  AchievementUnlockedEvent,
  MatchHistoryEntry,
  UserStats,
} from '@/events/socket.events';
import { socketService } from '@/services/SocketService';
import { soundManager } from '@/services/SoundManager';
import { overlayManager } from '@/utils/OverlayManager';
import { log } from '@/utils/Logger';

/**
 * ProfilePanel — controller do overlay #profile-modal.
 *
 * Carrega stats + match history quando aberto. Não mantém cache reativo:
 * stats mudam só ao final da partida, então fetch on-demand é suficiente.
 */
class ProfilePanel {
  private attached = false;
  private isOpen = false;
  private onStatsUpdated = (data: { stats: UserStats }) => {
    if (data?.stats) this.renderStats(data.stats);
    // Stats novos podem implicar match novo no histórico — refetch leve
    if (this.isOpen) void this.loadHistory();
  };
  private onAchievementPush = (data: AchievementUnlockedEvent) => {
    // Se o modal está aberto na aba de conquistas, refetch full pra ver desbloqueio
    if (this.isOpen && data?.achievements?.length) void this.loadAchievements();
  };

  private modal!: HTMLElement;
  private closeBtn!: HTMLElement;
  private tabs!: NodeListOf<HTMLElement>;
  private panes!: NodeListOf<HTMLElement>;

  // Stats refs
  private usernameEl!: HTMLElement;
  private sinceEl!: HTMLElement;
  private statGames!: HTMLElement;
  private statWins!: HTMLElement;
  private statLosses!: HTMLElement;
  private statWinRate!: HTMLElement;
  private statStreak!: HTMLElement;
  private statBestStreak!: HTMLElement;
  private statKills!: HTMLElement;
  private statDeaths!: HTMLElement;
  private statPlaytime!: HTMLElement;
  private statRoles!: HTMLElement;

  // History refs
  private historyLoading!: HTMLElement;
  private historyList!: HTMLElement;
  private historyEmpty!: HTMLElement;

  // Achievements refs
  private achLoading!: HTMLElement;
  private achContent!: HTMLElement;
  private achGrid!: HTMLElement;
  private achProgress!: HTMLElement;

  attach(): void {
    if (this.attached) return;
    this.attached = true;

    this.modal = document.getElementById('profile-modal')!;
    this.closeBtn = document.getElementById('profile-close')!;
    this.tabs = document.querySelectorAll<HTMLElement>('.profile-tab');
    this.panes = document.querySelectorAll<HTMLElement>('.profile-pane');

    this.usernameEl = document.getElementById('profile-username')!;
    this.sinceEl = document.getElementById('profile-since')!;
    this.statGames = document.getElementById('stat-games')!;
    this.statWins = document.getElementById('stat-wins')!;
    this.statLosses = document.getElementById('stat-losses')!;
    this.statWinRate = document.getElementById('stat-winrate')!;
    this.statStreak = document.getElementById('stat-streak')!;
    this.statBestStreak = document.getElementById('stat-best-streak')!;
    this.statKills = document.getElementById('stat-kills')!;
    this.statDeaths = document.getElementById('stat-deaths')!;
    this.statPlaytime = document.getElementById('stat-playtime')!;
    this.statRoles = document.getElementById('stat-roles')!;

    this.historyLoading = document.getElementById('history-loading')!;
    this.historyList = document.getElementById('history-list')!;
    this.historyEmpty = document.getElementById('history-empty')!;

    this.achLoading = document.getElementById('achievements-loading')!;
    this.achContent = document.getElementById('achievements-content')!;
    this.achGrid = document.getElementById('achievements-grid')!;
    this.achProgress = document.getElementById('achievements-progress')!;

    this.closeBtn.addEventListener('click', () => this.close());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });
    for (const tab of this.tabs) {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab ?? 'stats'));
    }

    // Push events: refresh em tempo real quando dados mudam no servidor
    socketService.on<{ stats: UserStats }>('stats_updated', this.onStatsUpdated);
    socketService.on<AchievementUnlockedEvent>('achievement_unlocked', this.onAchievementPush);
  }

  open(): void {
    if (!this.attached) this.attach();
    this.isOpen = true;
    soundManager.unlock();
    soundManager.playSfx('slide');
    overlayManager.show('profile-modal');
    // Carrega dados sempre que abre — stats podem ter mudado entre sessões
    void this.loadStats();
    void this.loadHistory();
    void this.loadAchievements();
  }

  close(): void {
    this.isOpen = false;
    soundManager.playSfx('slide');
    overlayManager.hide('profile-modal');
  }

  private switchTab(name: string): void {
    soundManager.playSfx('click');
    for (const t of this.tabs) t.classList.toggle('active', t.dataset.tab === name);
    for (const p of this.panes) p.classList.toggle('active', p.dataset.pane === name);
  }

  private async loadStats(): Promise<void> {
    const user = socketService.getCurrentUser();
    this.usernameEl.textContent = user?.username ?? '—';
    try {
      const res = await socketService.getUserStats();
      if ('error' in res) {
        log.warn('ProfilePanel: stats error', { msg: res.error });
        this.renderStats(emptyStats());
        return;
      }
      this.renderStats(res.stats);
    } catch (err) {
      log.warn('ProfilePanel: stats fetch error', { err });
      this.renderStats(emptyStats());
    }
  }

  private renderStats(stats: UserStats): void {
    this.statGames.textContent = String(stats.gamesPlayed ?? 0);
    this.statWins.textContent = String(stats.wins ?? 0);
    this.statLosses.textContent = String(stats.losses ?? 0);
    const wr = stats.winRate ? `${stats.winRate}%` : '—';
    this.statWinRate.textContent = wr;
    this.statStreak.textContent = String(stats.currentWinStreak ?? 0);
    this.statBestStreak.textContent = String(stats.longestWinStreak ?? 0);
    this.statKills.textContent = String(stats.kills ?? 0);
    this.statDeaths.textContent = String(stats.deaths ?? 0);
    this.statPlaytime.textContent = formatPlaytime(stats.totalPlayTime ?? 0);
    if (stats.updatedAt) {
      this.sinceEl.textContent = new Date(stats.createdAt ?? stats.updatedAt).toLocaleDateString('pt-BR');
    } else {
      this.sinceEl.textContent = '—';
    }

    // Roles played
    this.statRoles.innerHTML = '';
    const roles = stats.rolesPlayed ?? {};
    const entries = Object.entries(roles).filter(([, count]) => (count as number) > 0);
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Nenhuma partida ainda.';
      this.statRoles.appendChild(empty);
      return;
    }
    entries.sort((a, b) => (b[1] as number) - (a[1] as number));
    for (const [role, count] of entries) {
      const chip = document.createElement('div');
      chip.className = 'role-chip';
      if (role === stats.favoriteRole) chip.classList.add('favorite');
      chip.innerHTML = `${role}<span class="count">${count}</span>`;
      this.statRoles.appendChild(chip);
    }
  }

  private async loadHistory(): Promise<void> {
    this.historyLoading.style.display = '';
    this.historyList.style.display = 'none';
    this.historyEmpty.style.display = 'none';
    try {
      const res = await socketService.getMatchHistory({ limit: 20 });
      if ('error' in res) {
        log.warn('ProfilePanel: history error', { msg: res.error });
        this.renderHistory([]);
        return;
      }
      this.renderHistory(res.matches);
    } catch (err) {
      log.warn('ProfilePanel: history fetch error', { err });
      this.renderHistory([]);
    }
  }

  private renderHistory(matches: MatchHistoryEntry[]): void {
    this.historyLoading.style.display = 'none';
    if (matches.length === 0) {
      this.historyEmpty.style.display = '';
      return;
    }
    this.historyList.style.display = '';
    this.historyList.innerHTML = '';
    for (const m of matches) {
      const row = document.createElement('div');
      row.className = `match-row ${m.result ?? ''}`.trim();

      const result = document.createElement('div');
      result.className = 'result';
      result.textContent = m.result === 'win' ? 'Vitória' : m.result === 'loss' ? 'Derrota' : '—';

      const role = document.createElement('div');
      role.className = 'role';
      const killsTxt = typeof m.kills === 'number' && m.kills > 0 ? ` · ${m.kills} elim.` : '';
      role.textContent = `${m.role ?? 'Papel desconhecido'}${killsTxt}`;

      const meta = document.createElement('div');
      meta.className = 'meta';
      const when = m.endedAt ? new Date(m.endedAt).toLocaleDateString('pt-BR') : '';
      const dur = typeof m.duration === 'number' ? formatPlaytime(m.duration) : '';
      meta.textContent = [when, dur].filter(Boolean).join(' · ');

      row.appendChild(result);
      row.appendChild(role);
      row.appendChild(meta);
      this.historyList.appendChild(row);
    }
  }

  private async loadAchievements(): Promise<void> {
    this.achLoading.style.display = '';
    this.achContent.style.display = 'none';
    try {
      const res = await socketService.getAchievements();
      if ('error' in res) {
        log.warn('ProfilePanel: achievements error', { msg: res.error });
        this.renderAchievements([], 0, 0);
        return;
      }
      this.renderAchievements(res.achievements, res.unlocked, res.total);
    } catch (err) {
      log.warn('ProfilePanel: achievements fetch error', { err });
      this.renderAchievements([], 0, 0);
    }
  }

  private renderAchievements(items: Achievement[], unlocked: number, total: number): void {
    this.achLoading.style.display = 'none';
    this.achContent.style.display = '';
    this.achProgress.textContent = `${unlocked} / ${total || items.length}`;
    this.achGrid.innerHTML = '';

    // Desbloqueadas primeiro, depois por raridade (lendário > épico > raro > comum)
    const rarityOrder: Record<string, number> = { 'lendário': 0, 'épico': 1, 'raro': 2, 'comum': 3 };
    const sorted = [...items].sort((a, b) => {
      if (!!a.unlocked !== !!b.unlocked) return a.unlocked ? -1 : 1;
      return (rarityOrder[a.rarity] ?? 99) - (rarityOrder[b.rarity] ?? 99);
    });

    for (const a of sorted) {
      const card = document.createElement('div');
      const rarityClass = `rarity-${a.rarity}`;
      card.className = `achievement-card ${a.unlocked ? 'unlocked' : ''} ${rarityClass}`.trim();
      card.innerHTML = `
        <div class="header-row">
          <span class="emoji">${a.emoji}</span>
          <span class="name">${escapeHtml(a.name)}</span>
        </div>
        <div class="desc">${escapeHtml(a.description)}</div>
        <div class="rarity-tag">${a.rarity}</div>
      `;
      this.achGrid.appendChild(card);
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function emptyStats(): UserStats {
  return {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    winRate: '0.00',
    totalPlayTime: 0,
    kills: 0,
    deaths: 0,
    rolesPlayed: {},
    favoriteRole: null,
    longestWinStreak: 0,
    currentWinStreak: 0,
  };
}

function formatPlaytime(seconds: number): string {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

export const profilePanel = new ProfilePanel();
