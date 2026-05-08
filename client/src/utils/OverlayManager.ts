/**
 * OverlayManager — singleton que coordena visibilidade dos HTML overlays.
 *
 * Regra dura: apenas 1 overlay visível por vez. Toda transição de cena Phaser
 * chama `showOnly(id)` ou `hideAll()` pra evitar overlays sobrepostos.
 *
 * IDs registrados (precisam existir no DOM):
 *   - login-overlay  (LoginScene)
 *   - hub-overlay    (LobbyScene — hub principal)
 *   - lobby-overlay  (LobbyScene — lista de salas)
 *   - room-modal     (LobbyScene — modal criar sala, sub-overlay do lobby-overlay)
 */

const OVERLAY_IDS = ['login-overlay', 'hub-overlay', 'lobby-overlay', 'room-modal', 'settings-modal', 'profile-modal', 'friends-modal', 'shop-modal'] as const;
export type OverlayId = (typeof OVERLAY_IDS)[number];

class OverlayManager {
  /** Esconde todos os overlays e mostra apenas o solicitado. */
  showOnly(id: OverlayId): void {
    for (const oid of OVERLAY_IDS) {
      const el = document.getElementById(oid);
      if (!el) continue;
      if (oid === id) el.classList.add('visible');
      else el.classList.remove('visible');
    }
  }

  /** Mostra um overlay sem mexer nos outros (ex: modal sobre lobby). */
  show(id: OverlayId): void {
    document.getElementById(id)?.classList.add('visible');
  }

  /** Esconde apenas o overlay solicitado. */
  hide(id: OverlayId): void {
    document.getElementById(id)?.classList.remove('visible');
  }

  /** Esconde todos os overlays. */
  hideAll(): void {
    for (const oid of OVERLAY_IDS) {
      document.getElementById(oid)?.classList.remove('visible');
    }
  }

  /** Retorna true se o overlay estiver visível. */
  isVisible(id: OverlayId): boolean {
    return document.getElementById(id)?.classList.contains('visible') ?? false;
  }

  /** Define imagem de fundo do `#world-bg` (camada compartilhada atrás do canvas). */
  setWorldBg(url: string): void {
    const el = document.getElementById('world-bg');
    if (!el) return;
    el.style.backgroundImage = `url('${url}')`;
    el.classList.remove('hidden');
  }

  /** Esconde o `#world-bg` (cenas in-game têm bg próprio desenhado no canvas). */
  hideWorldBg(): void {
    document.getElementById('world-bg')?.classList.add('hidden');
  }

  /** Mostra o canvas Phaser (cenas com sprite/gameplay). */
  showCanvas(): void {
    const el = document.getElementById('game');
    if (el) el.style.display = '';
  }

  /** Esconde o canvas Phaser (cenas só-HTML como Login). */
  hideCanvas(): void {
    const el = document.getElementById('game');
    if (el) el.style.display = 'none';
  }
}

export const overlayManager = new OverlayManager();
