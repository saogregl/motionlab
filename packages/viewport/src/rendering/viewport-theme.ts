/**
 * Static theme config for Three.js viewport rendering.
 *
 * Three.js operates in WebGL and cannot read CSS custom properties.
 * These values must be kept in sync with the corresponding tokens
 * in `packages/ui/src/globals.css` (`:root` and `.dark` blocks).
 *
 * - dark.background  ↔  --bg-viewport (#121212)
 * - light.background ↔  --bg-viewport (#e0e0e0)
 */
import { Color } from 'three';

export interface ViewportThemeConfig {
  background: Color;
  gridCellColor: string;
  gridSectionColor: string;
  axisColors: [string, string, string];
}

export const VIEWPORT_THEMES: Record<'light' | 'dark', ViewportThemeConfig> = {
  light: {
    background: new Color('#e0e0e0'),
    gridCellColor: '#c0c0c8',
    gridSectionColor: '#a0a0a8',
    axisColors: ['#ff4060', '#40df80', '#4080ff'],
  },
  dark: {
    background: new Color('#121212'), // matches --bg-viewport
    gridCellColor: '#282830',
    gridSectionColor: '#383848',
    axisColors: ['#ff4060', '#40df80', '#4080ff'],
  },
};
