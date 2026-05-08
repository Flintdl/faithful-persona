import type {
  PurchaseErrorEvent,
  PurchaseSuccessEvent,
  ShopItem,
  UserBalanceResult,
} from '@/events/socket.events';
import { socketService } from '@/services/SocketService';
import { log } from '@/utils/Logger';

type Balance = { coins: number; diamonds: number };
type BalanceListener = (balance: Balance) => void;
type PurchaseListener = (
  payload: { kind: 'success'; data: PurchaseSuccessEvent } | { kind: 'error'; data: PurchaseErrorEvent },
) => void;

/**
 * ShopService — singleton reativo pra balance + push events de compra.
 *
 * Items são fetchados on-demand pelo ShopPanel (não cachear, podem mudar).
 * Balance é cacheado e atualizado via push event `purchase_success`.
 */
class ShopService {
  private balance: Balance = { coins: 0, diamonds: 0 };
  private loaded = false;
  private balanceListeners = new Set<BalanceListener>();
  private purchaseListeners = new Set<PurchaseListener>();
  private wired = false;

  // ============== PUBLIC API ==============
  getBalance(): Readonly<Balance> {
    return this.balance;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  async loadBalance(): Promise<void> {
    this.wirePushEvents();
    try {
      const res = await socketService.getUserBalance();
      if ('error' in res) {
        log.warn('ShopService: loadBalance error', { msg: res.error });
        return;
      }
      this.applyBalance({ coins: res.coins, diamonds: res.diamonds });
      this.loaded = true;
    } catch (err) {
      log.warn('ShopService: loadBalance fetch error', { err });
    }
  }

  /** Dispara compra; resultado vem via subscribe(onPurchase). */
  buy(item: ShopItem): void {
    socketService.emitPurchase(item.id);
  }

  subscribeBalance(listener: BalanceListener): () => void {
    this.balanceListeners.add(listener);
    listener(this.balance);
    return () => this.balanceListeners.delete(listener);
  }

  onPurchase(listener: PurchaseListener): () => void {
    this.purchaseListeners.add(listener);
    return () => this.purchaseListeners.delete(listener);
  }

  // ============== INTERNALS ==============
  private wirePushEvents(): void {
    if (this.wired) return;
    this.wired = true;
    socketService.on<PurchaseSuccessEvent>('purchase_success', (data) => {
      if (data?.balance) this.applyBalance(data.balance);
      for (const l of this.purchaseListeners) l({ kind: 'success', data });
    });
    socketService.on<PurchaseErrorEvent>('purchase_error', (data) => {
      for (const l of this.purchaseListeners) l({ kind: 'error', data });
    });
  }

  private applyBalance(b: UserBalanceResult): void {
    this.balance = { coins: b.coins, diamonds: b.diamonds };
    for (const l of this.balanceListeners) l(this.balance);
  }
}

export const shopService = new ShopService();
