import type {
  FriendEntry,
  FriendRequestEntry,
  SearchUserEntry,
} from '@/events/socket.events';
import { friendsService } from '@/services/FriendsService';
import { soundManager } from '@/services/SoundManager';
import { overlayManager } from '@/utils/OverlayManager';

const SEARCH_DEBOUNCE_MS = 350;

/**
 * FriendsPanel — controller do overlay #friends-modal.
 * 3 abas: Lista (online status), Pedidos (recebidos+enviados), Adicionar (busca).
 * Toda mudança de estado vem do FriendsService via subscribe.
 */
class FriendsPanel {
  private attached = false;
  private unsubscribe?: () => void;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  // Refs
  private modal!: HTMLElement;
  private closeBtn!: HTMLElement;
  private tabs!: NodeListOf<HTMLElement>;
  private panes!: NodeListOf<HTMLElement>;
  private listEl!: HTMLElement;
  private listEmpty!: HTMLElement;
  private pendingList!: HTMLElement;
  private pendingEmpty!: HTMLElement;
  private sentList!: HTMLElement;
  private sentEmpty!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private searchResults!: HTMLElement;
  private searchEmpty!: HTMLElement;
  private friendsCountBadge!: HTMLElement;
  private pendingCountBadge!: HTMLElement;

  attach(): void {
    if (this.attached) return;
    this.attached = true;

    this.modal = document.getElementById('friends-modal')!;
    this.closeBtn = document.getElementById('friends-close')!;
    this.tabs = document.querySelectorAll<HTMLElement>('.friends-tab');
    this.panes = document.querySelectorAll<HTMLElement>('.friends-pane');
    this.listEl = document.getElementById('friends-list')!;
    this.listEmpty = document.getElementById('friends-list-empty')!;
    this.pendingList = document.getElementById('friends-pending-list')!;
    this.pendingEmpty = document.getElementById('friends-pending-empty')!;
    this.sentList = document.getElementById('friends-sent-list')!;
    this.sentEmpty = document.getElementById('friends-sent-empty')!;
    this.searchInput = document.getElementById('friends-search-input') as HTMLInputElement;
    this.searchResults = document.getElementById('friends-search-results')!;
    this.searchEmpty = document.getElementById('friends-search-empty')!;
    this.friendsCountBadge = document.getElementById('friends-count')!;
    this.pendingCountBadge = document.getElementById('friends-pending-count')!;

    this.closeBtn.addEventListener('click', () => this.close());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    for (const tab of this.tabs) {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab ?? 'list'));
    }

    this.searchInput.addEventListener('input', () => this.handleSearchInput());

    this.unsubscribe = friendsService.subscribe((state) => {
      this.renderFriends(state.friends);
      this.renderPending(state.pending);
      this.renderSent(state.sent);
      this.updateBadges(state.friends.length, state.pending.length);
    });
  }

  open(): void {
    if (!this.attached) this.attach();
    soundManager.unlock();
    soundManager.playSfx('slide');
    overlayManager.show('friends-modal');
    // Refetch ao abrir — backend não broadcasta presence, então pegamos snapshot fresco
    void friendsService.refreshFriends();
    void friendsService.refreshRequests();
  }

  close(): void {
    soundManager.playSfx('slide');
    overlayManager.hide('friends-modal');
  }

  detach(): void {
    if (this.unsubscribe) this.unsubscribe();
    this.attached = false;
  }

  private switchTab(name: string): void {
    soundManager.playSfx('click');
    for (const t of this.tabs) t.classList.toggle('active', t.dataset.tab === name);
    for (const p of this.panes) p.classList.toggle('active', p.dataset.pane === name);
    if (name === 'search') this.searchInput.focus();
  }

  // ============== RENDERING ==============
  private renderFriends(friends: FriendEntry[]): void {
    this.listEl.innerHTML = '';
    if (friends.length === 0) {
      this.listEmpty.style.display = '';
      return;
    }
    this.listEmpty.style.display = 'none';

    // Online primeiro, alfabético dentro de cada grupo
    const sorted = [...friends].sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return a.username.localeCompare(b.username);
    });

    for (const f of sorted) {
      const row = document.createElement('div');
      row.className = `friend-row ${f.isOnline ? 'online' : ''}`;
      row.innerHTML = `
        <div class="info">
          <div class="dot"></div>
          <span class="name">${escapeHtml(f.username)}</span>
          <span class="meta">${f.isOnline ? 'online' : 'offline'}</span>
        </div>
        <div class="actions">
          <button class="friend-btn danger" data-action="remove" data-id="${f.id}">REMOVER</button>
        </div>
      `;
      const removeBtn = row.querySelector<HTMLButtonElement>('button[data-action="remove"]')!;
      removeBtn.addEventListener('click', () => {
        soundManager.playSfx('click');
        friendsService.removeFriend(f.id);
      });
      this.listEl.appendChild(row);
    }
  }

  private renderPending(pending: FriendRequestEntry[]): void {
    this.pendingList.innerHTML = '';
    if (pending.length === 0) {
      this.pendingEmpty.style.display = '';
      return;
    }
    this.pendingEmpty.style.display = 'none';
    for (const r of pending) {
      const row = document.createElement('div');
      row.className = 'friend-row';
      row.innerHTML = `
        <div class="info">
          <span class="name">${escapeHtml(r.username)}</span>
          <span class="meta">quer ser seu amigo</span>
        </div>
        <div class="actions">
          <button class="friend-btn accept" data-action="accept">ACEITAR</button>
          <button class="friend-btn danger" data-action="reject">RECUSAR</button>
        </div>
      `;
      row.querySelector<HTMLButtonElement>('[data-action="accept"]')!.addEventListener('click', () => {
        soundManager.playSfx('select');
        friendsService.acceptRequest(r.id);
      });
      row.querySelector<HTMLButtonElement>('[data-action="reject"]')!.addEventListener('click', () => {
        soundManager.playSfx('click');
        friendsService.rejectRequest(r.id);
      });
      this.pendingList.appendChild(row);
    }
  }

  private renderSent(sent: FriendRequestEntry[]): void {
    this.sentList.innerHTML = '';
    if (sent.length === 0) {
      this.sentEmpty.style.display = '';
      return;
    }
    this.sentEmpty.style.display = 'none';
    for (const r of sent) {
      const row = document.createElement('div');
      row.className = 'friend-row';
      row.innerHTML = `
        <div class="info">
          <span class="name">${escapeHtml(r.username)}</span>
          <span class="meta">aguardando resposta</span>
        </div>
        <div class="actions">
          <button class="friend-btn" data-action="cancel">CANCELAR</button>
        </div>
      `;
      row.querySelector<HTMLButtonElement>('[data-action="cancel"]')!.addEventListener('click', () => {
        soundManager.playSfx('click');
        friendsService.cancelRequest(r.id);
      });
      this.sentList.appendChild(row);
    }
  }

  private renderSearchResults(results: SearchUserEntry[]): void {
    this.searchResults.innerHTML = '';
    if (results.length === 0) {
      this.searchEmpty.textContent = 'Nenhum usuário encontrado.';
      this.searchEmpty.style.display = '';
      return;
    }
    this.searchEmpty.style.display = 'none';
    for (const u of results) {
      const row = document.createElement('div');
      row.className = 'friend-row';
      let actionHtml = '';
      if (u.isFriend) {
        actionHtml = `<span class="meta">já é amigo</span>`;
      } else if (u.hasSentRequest) {
        actionHtml = `<button class="friend-btn" data-action="cancel">CANCELAR</button>`;
      } else if (u.hasPendingRequest) {
        actionHtml = `<button class="friend-btn accept" data-action="accept">ACEITAR</button>`;
      } else {
        actionHtml = `<button class="friend-btn" data-action="add">ADICIONAR</button>`;
      }
      row.innerHTML = `
        <div class="info">
          <span class="name">${escapeHtml(u.username)}</span>
        </div>
        <div class="actions">${actionHtml}</div>
      `;
      const btn = row.querySelector<HTMLButtonElement>('button');
      if (btn) {
        const action = btn.dataset.action;
        btn.addEventListener('click', () => {
          soundManager.playSfx('click');
          if (action === 'add') friendsService.sendRequest(u.id);
          else if (action === 'cancel') friendsService.cancelRequest(u.id);
          else if (action === 'accept') friendsService.acceptRequest(u.id);
        });
      }
      this.searchResults.appendChild(row);
    }
  }

  private updateBadges(friendsCount: number, pendingCount: number): void {
    if (friendsCount > 0) {
      this.friendsCountBadge.textContent = String(friendsCount);
      this.friendsCountBadge.style.display = '';
    } else {
      this.friendsCountBadge.style.display = 'none';
    }
    if (pendingCount > 0) {
      this.pendingCountBadge.textContent = String(pendingCount);
      this.pendingCountBadge.style.display = '';
    } else {
      this.pendingCountBadge.style.display = 'none';
    }
  }

  // ============== SEARCH ==============
  private handleSearchInput(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const query = this.searchInput.value.trim();
    if (query.length < 2) {
      this.searchResults.innerHTML = '';
      this.searchEmpty.textContent = 'Digite pelo menos 2 caracteres pra buscar.';
      this.searchEmpty.style.display = '';
      return;
    }
    this.searchTimer = setTimeout(() => {
      void this.runSearch(query);
    }, SEARCH_DEBOUNCE_MS);
  }

  private async runSearch(query: string): Promise<void> {
    const res = await friendsService.searchUsers(query);
    // Se o usuário continuou digitando, descartar resultado obsoleto
    if (this.searchInput.value.trim() !== query) return;
    this.renderSearchResults(res.users);
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

export const friendsPanel = new FriendsPanel();
