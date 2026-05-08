import type { ShopItem } from '@/events/socket.events';
import { shopService } from '@/services/ShopService';
import { socketService } from '@/services/SocketService';
import { soundManager } from '@/services/SoundManager';
import { overlayManager } from '@/utils/OverlayManager';
import { log } from '@/utils/Logger';

const CATEGORIES = ['skins', 'hats', 'weapons', 'wings'] as const;
type Category = (typeof CATEGORIES)[number];

type ToastFn = (msg: string, duration?: number) => void;

/**
 * ShopPanel — controller do overlay #shop-modal.
 *
 * Categorias em tabs, fetch on-demand por categoria. Saldo (coins/diamonds)
 * vem do ShopService reativo (atualiza via push event purchase_success).
 * Compras: clica → emit → push event success/error → toast + atualiza item card.
 */
class ShopPanel {
  private attached = false;
  private currentCat: Category = 'skins';
  private toast: ToastFn = (msg) => log.info(msg);
  private unsubscribeBalance?: () => void;
  private unsubscribePurchase?: () => void;

  // Refs
  private modal!: HTMLElement;
  private closeBtn!: HTMLElement;
  private tabs!: NodeListOf<HTMLElement>;
  private grid!: HTMLElement;
  private loading!: HTMLElement;
  private empty!: HTMLElement;
  private balanceCoinsEl!: HTMLElement;
  private balanceDiamondsEl!: HTMLElement;

  // Cache de itens correntes pra re-render após compra
  private currentItems: ShopItem[] = [];
  private pendingBuy: string | null = null;

  /** Define função de toast (injetada pelo LobbyScene). */
  setToastFn(fn: ToastFn): void {
    this.toast = fn;
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;

    this.modal = document.getElementById('shop-modal')!;
    this.closeBtn = document.getElementById('shop-close')!;
    this.tabs = document.querySelectorAll<HTMLElement>('.shop-tab');
    this.grid = document.getElementById('shop-grid')!;
    this.loading = document.getElementById('shop-loading')!;
    this.empty = document.getElementById('shop-empty')!;
    this.balanceCoinsEl = document.getElementById('shop-balance-coins')!;
    this.balanceDiamondsEl = document.getElementById('shop-balance-diamonds')!;

    this.closeBtn.addEventListener('click', () => this.close());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    for (const tab of this.tabs) {
      tab.addEventListener('click', () => this.switchCategory((tab.dataset.cat as Category) ?? 'skins'));
    }

    // Saldo reativo
    this.unsubscribeBalance = shopService.subscribeBalance((b) => {
      this.balanceCoinsEl.textContent = String(b.coins);
      this.balanceDiamondsEl.textContent = String(b.diamonds);
    });

    // Push events de compra
    this.unsubscribePurchase = shopService.onPurchase((p) => {
      if (p.kind === 'success') {
        const name = p.data.item?.name ?? 'item';
        this.toast(`✓ Comprado: ${name}`, 2800);
        soundManager.playSfx('select');
        // Marca como owned no cache atual
        const item = this.currentItems.find((i) => i.id === p.data.item?.id);
        if (item) item.owned = true;
        this.pendingBuy = null;
        this.renderItems();
      } else {
        const msg = p.data.message ?? 'Erro na compra';
        let detail = '';
        if (typeof p.data.required === 'number' && typeof p.data.current === 'number') {
          detail = ` (precisa ${p.data.required}, tem ${p.data.current})`;
        }
        this.toast(`✗ ${msg}${detail}`, 3500);
        soundManager.playSfx('click');
        this.pendingBuy = null;
        this.renderItems();
      }
    });
  }

  open(category?: Category): void {
    if (!this.attached) this.attach();
    if (category && CATEGORIES.includes(category)) {
      this.currentCat = category;
      for (const t of this.tabs) t.classList.toggle('active', t.dataset.cat === category);
    }
    soundManager.unlock();
    soundManager.playSfx('slide');
    overlayManager.show('shop-modal');
    // Refresh balance + items ao abrir
    void shopService.loadBalance();
    void this.loadCategory(this.currentCat);
  }

  close(): void {
    soundManager.playSfx('slide');
    overlayManager.hide('shop-modal');
  }

  detach(): void {
    if (this.unsubscribeBalance) this.unsubscribeBalance();
    if (this.unsubscribePurchase) this.unsubscribePurchase();
    this.attached = false;
  }

  // ============== INTERNALS ==============
  private switchCategory(cat: Category): void {
    if (cat === this.currentCat) return;
    soundManager.playSfx('click');
    this.currentCat = cat;
    for (const t of this.tabs) t.classList.toggle('active', t.dataset.cat === cat);
    void this.loadCategory(cat);
  }

  private async loadCategory(cat: Category): Promise<void> {
    this.loading.style.display = '';
    this.grid.style.display = 'none';
    this.empty.style.display = 'none';
    try {
      const res = await socketService.getShopItems(cat);
      if ('error' in res) {
        log.warn('ShopPanel: getShopItems error', { msg: res.error });
        this.currentItems = [];
      } else {
        this.currentItems = res.items;
      }
    } catch (err) {
      log.warn('ShopPanel: getShopItems fetch error', { err });
      this.currentItems = [];
    }
    this.renderItems();
  }

  private renderItems(): void {
    this.loading.style.display = 'none';
    if (this.currentItems.length === 0) {
      this.empty.style.display = '';
      this.grid.style.display = 'none';
      return;
    }
    this.empty.style.display = 'none';
    this.grid.style.display = '';
    this.grid.innerHTML = '';

    const balance = shopService.getBalance();
    for (const item of this.currentItems) {
      const card = document.createElement('div');
      card.className = `shop-card-item rarity-${item.rarity}`;
      const symbol = item.currency === 'coins' ? '◉' : '◆';
      const canAfford =
        item.currency === 'coins'
          ? balance.coins >= item.price
          : balance.diamonds >= item.price;
      const isPending = this.pendingBuy === item.id;
      const buttonHtml = item.owned
        ? `<div class="owned-badge">POSSUÍDO</div>`
        : `<button class="buy-btn ${item.currency === 'diamonds' ? 'diamond' : ''}"
            ${(!canAfford || isPending) ? 'disabled' : ''}
            data-id="${item.id}">
            ${isPending ? '...' : `${item.price} ${symbol}`}
          </button>`;
      card.innerHTML = `
        <div class="emoji">${item.emoji ?? '✨'}</div>
        <div class="name">${escapeHtml(item.name)}</div>
        <div class="desc">${escapeHtml(item.description ?? '')}</div>
        <div class="rarity-tag">${item.rarity}</div>
        ${buttonHtml}
      `;
      const btn = card.querySelector<HTMLButtonElement>('.buy-btn');
      if (btn && !item.owned) {
        btn.addEventListener('click', () => {
          if (this.pendingBuy) return;
          soundManager.playSfx('select');
          this.pendingBuy = item.id;
          this.renderItems();
          shopService.buy(item);
        });
      }
      this.grid.appendChild(card);
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

export const shopPanel = new ShopPanel();
