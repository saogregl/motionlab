export type PanelSide = 'left' | 'right' | 'bottom';

export interface PanelSlot {
  id: string;
  side: PanelSide;
  /** Width (left/right) or height (bottom), in px */
  size: number;
  open: boolean;
  /** When true, CSS transitions are suppressed (e.g. during resize drag) */
  instant?: boolean;
}

export interface ViewportInsets {
  left: number;
  right: number;
  bottom: number;
}
