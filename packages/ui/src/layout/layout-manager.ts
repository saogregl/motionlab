import { registerLayoutProperties } from './css-property-setup';
import type { PanelSlot, ViewportInsets } from './types';

/**
 * LayoutManager — the single authority for panel layout.
 *
 * Lives entirely outside React's render cycle. Computes viewport insets from
 * registered panel slots and writes CSS custom properties directly to a DOM
 * element. Provides useSyncExternalStore-compatible subscribe/getSnapshot for
 * the few React consumers that need JS values (e.g. R3F gizmo).
 */
export class LayoutManager {
  private slots = new Map<string, PanelSlot>();
  private rootEl: HTMLElement | null = null;
  private listeners = new Set<() => void>();
  private snapshot: ViewportInsets = { left: 0, right: 0, bottom: 0 };
  private sidePanelBottom: number;
  private readonly floatInset: number;

  constructor(floatInset = 6) {
    this.floatInset = floatInset;
    this.sidePanelBottom = floatInset;
    registerLayoutProperties();
  }

  /** Attach to the DOM element where CSS variables will be written. */
  mount(el: HTMLElement): void {
    this.rootEl = el;
    this.flush(false);
  }

  /** Detach from the DOM element. */
  unmount(): void {
    this.rootEl = null;
  }

  /** Register or update a panel slot. Recomputes all derived values. */
  updateSlot(slot: PanelSlot): void {
    this.slots.set(slot.id, slot);
    this.recompute(slot.instant ?? false);
  }

  /** Unregister a panel slot (on component unmount). */
  removeSlot(id: string): void {
    this.slots.delete(id);
    this.recompute(false);
  }

  // ── useSyncExternalStore contract ──

  subscribe = (callback: () => void): (() => void) => {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  };

  getSnapshot = (): ViewportInsets => {
    return this.snapshot;
  };

  // ── Internals ──

  private recompute(instant: boolean): void {
    const fi = this.floatInset;
    let left = 0;
    let right = 0;
    let bottom = 0;
    let bottomPanelH = 0;

    for (const slot of this.slots.values()) {
      if (!slot.open) continue;
      switch (slot.side) {
        case 'left':
          left = Math.max(left, slot.size + 2 * fi);
          break;
        case 'right':
          right = Math.max(right, slot.size + 2 * fi);
          break;
        case 'bottom':
          bottom = Math.max(bottom, slot.size + 2 * fi);
          bottomPanelH = Math.max(bottomPanelH, slot.size);
          break;
      }
    }

    const newSidePanelBottom = bottomPanelH > 0 ? bottomPanelH + 2 * fi : fi;

    const prev = this.snapshot;
    const changed =
      left !== prev.left ||
      right !== prev.right ||
      bottom !== prev.bottom ||
      newSidePanelBottom !== this.sidePanelBottom;

    if (!changed) return;

    this.snapshot = { left, right, bottom };
    this.sidePanelBottom = newSidePanelBottom;

    this.flush(instant);

    // Notify useSyncExternalStore subscribers
    for (const listener of this.listeners) {
      listener();
    }
  }

  private flush(instant: boolean): void {
    const el = this.rootEl;
    if (!el) return;

    if (instant) {
      el.dataset.layoutInstant = '';
    } else {
      delete el.dataset.layoutInstant;
    }

    el.style.setProperty('--vp-inset-left', `${this.snapshot.left}px`);
    el.style.setProperty('--vp-inset-right', `${this.snapshot.right}px`);
    el.style.setProperty('--vp-inset-bottom', `${this.snapshot.bottom}px`);
    el.style.setProperty('--side-panel-bottom', `${this.sidePanelBottom}px`);
  }
}
