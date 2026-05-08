import { DEFAULT_PERSON, DEFAULT_SKIN_ID, FREE_SKIN_IDS, SKINS, type SkinDef, getSkin } from '@/config/Skins';
import type {
  CharacterPayload,
  CharacterPersisted,
  PurchaseSuccessEvent,
} from '@/events/socket.events';
import { socketService } from '@/services/SocketService';
import { log } from '@/utils/Logger';

const STORAGE_KEY = 'fp:character';
const OWNED_STORAGE_KEY = 'fp:ownedSkins';

type Listener = (skin: SkinDef, raw: CharacterPersisted | null) => void;
type OwnedListener = (ownedIds: ReadonlySet<string>) => void;

/**
 * CharacterService — singleton com source of truth do personagem do user.
 *
 * Mesmo padrão do SettingsService:
 * - Cache local (localStorage) pra ter algo no boot antes do servidor responder
 * - `loadFromServer()` chamado após auth — backend é a verdade
 * - `setSkin(id)` atualiza local + envia ao backend
 * - `subscribe(listener)` notifica UI/sprites quando muda
 */
class CharacterService {
  private current: CharacterPersisted | null = null;
  private currentSkin: SkinDef = getSkin(DEFAULT_SKIN_ID);
  private listeners = new Set<Listener>();
  private ownedListeners = new Set<OwnedListener>();
  /** IDs de skins que o user possui (free + comprados) */
  private ownedSkins = new Set<string>(FREE_SKIN_IDS);
  private wiredPurchases = false;

  constructor() {
    this.loadFromCache();
    this.loadOwnedFromCache();
  }

  // ============== PUBLIC API ==============
  getSkin(): SkinDef {
    return this.currentSkin;
  }

  getRaw(): CharacterPersisted | null {
    return this.current;
  }

  /** True se o user possui essa skin (free OU comprada). */
  isOwned(skinId: string): boolean {
    return this.ownedSkins.has(skinId);
  }

  getOwnedSkinIds(): ReadonlySet<string> {
    return this.ownedSkins;
  }

  /**
   * Troca skin do user — bloqueia se a skin não estiver na lista de owned.
   * Retorna `{ ok: true }` ou `{ ok: false, reason }`.
   */
  async setSkin(skinId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!this.isOwned(skinId)) {
      return { ok: false, reason: 'Skin não desbloqueada — compre na loja primeiro.' };
    }
    const skin = getSkin(skinId);
    this.currentSkin = skin;
    this.persistToCache();
    this.notify();
    const payload: CharacterPayload = {
      name: skin.id,
      person: DEFAULT_PERSON,
      skins: this.current?.skins ?? {},
    };
    try {
      const res = await socketService.updateCharacter(payload);
      if (res.success && 'character' in res) {
        this.current = res.character;
        this.persistToCache();
      } else {
        log.warn('CharacterService: setSkin server error', { msg: 'message' in res ? res.message : '?' });
      }
    } catch (err) {
      log.warn('CharacterService: setSkin error', { err });
    }
    return { ok: true };
  }

  /**
   * Carrega lista de skins compradas do backend + escuta push events de compra
   * pra adicionar novas skins automaticamente.
   */
  async loadOwnedFromServer(): Promise<void> {
    this.wirePurchaseListener();
    try {
      const res = await socketService.getOwnedItems();
      if ('error' in res) {
        log.warn('CharacterService: loadOwnedFromServer error', { msg: res.error });
        return;
      }
      // Mantém os free + adiciona qualquer item comprado cujo ID exista no registry SKINS
      const knownSkinIds = new Set(SKINS.map((s) => s.id));
      const next = new Set<string>(FREE_SKIN_IDS);
      for (const purchase of res.items) {
        if (knownSkinIds.has(purchase.itemId)) next.add(purchase.itemId);
      }
      this.ownedSkins = next;
      this.persistOwnedToCache();
      this.notifyOwned();
    } catch (err) {
      log.warn('CharacterService: loadOwnedFromServer fetch error', { err });
    }
  }

  subscribeOwned(listener: OwnedListener): () => void {
    this.ownedListeners.add(listener);
    listener(this.ownedSkins);
    return () => this.ownedListeners.delete(listener);
  }

  async loadFromServer(): Promise<void> {
    try {
      const res = await socketService.getCharacter();
      if (res.success) {
        this.current = res.character;
        this.currentSkin = getSkin(res.character.name);
        this.persistToCache();
        this.notify();
        log.info('CharacterService: loaded from server', { skin: this.currentSkin.id });
      } else {
        // Sem personagem salvo: usa default e sincroniza pro backend ter algo
        log.info('CharacterService: no server character, defaulting');
        void this.setSkin(DEFAULT_SKIN_ID);
      }
    } catch (err) {
      log.warn('CharacterService: loadFromServer error', { err });
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.currentSkin, this.current);
    return () => this.listeners.delete(listener);
  }

  // ============== INTERNALS ==============
  private loadFromCache(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { skinId?: string; raw?: CharacterPersisted };
      if (parsed.skinId) this.currentSkin = getSkin(parsed.skinId);
      if (parsed.raw) this.current = parsed.raw;
    } catch (err) {
      log.warn('CharacterService: cache parse error', { err });
    }
  }

  private persistToCache(): void {
    if (typeof window === 'undefined') return;
    try {
      const payload = JSON.stringify({ skinId: this.currentSkin.id, raw: this.current });
      window.localStorage.setItem(STORAGE_KEY, payload);
    } catch (err) {
      log.warn('CharacterService: cache persist error', { err });
    }
  }

  private notify(): void {
    for (const l of this.listeners) l(this.currentSkin, this.current);
  }

  private notifyOwned(): void {
    for (const l of this.ownedListeners) l(this.ownedSkins);
  }

  private loadOwnedFromCache(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(OWNED_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as string[];
      this.ownedSkins = new Set([...FREE_SKIN_IDS, ...parsed]);
    } catch (err) {
      log.warn('CharacterService: owned cache parse error', { err });
    }
  }

  private persistOwnedToCache(): void {
    if (typeof window === 'undefined') return;
    try {
      // Salva só os comprados (não-free) — defaults sempre vão ser injetados em load
      const toPersist = Array.from(this.ownedSkins).filter((id) => !FREE_SKIN_IDS.has(id));
      window.localStorage.setItem(OWNED_STORAGE_KEY, JSON.stringify(toPersist));
    } catch (err) {
      log.warn('CharacterService: owned cache persist error', { err });
    }
  }

  /** Escuta `purchase_success` e adiciona skin nova ao owned set (se for skin conhecida). */
  private wirePurchaseListener(): void {
    if (this.wiredPurchases) return;
    this.wiredPurchases = true;
    socketService.on<PurchaseSuccessEvent>('purchase_success', (data) => {
      const itemId = data?.item?.id;
      if (!itemId) return;
      const isOurSkin = SKINS.some((s) => s.id === itemId);
      if (!isOurSkin) return;
      if (this.ownedSkins.has(itemId)) return;
      this.ownedSkins = new Set([...this.ownedSkins, itemId]);
      this.persistOwnedToCache();
      this.notifyOwned();
    });
  }
}

export const characterService = new CharacterService();
