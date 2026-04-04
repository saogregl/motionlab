declare module 'troika-three-text' {
  import type { Color, Material, Mesh } from 'three';

  export class Text extends Mesh {
    text: string;
    fontSize: number;
    color: number | string | Color;
    anchorX: 'left' | 'center' | 'right' | number;
    anchorY: 'top' | 'top-baseline' | 'top-cap' | 'top-ex' | 'middle' | 'bottom-baseline' | 'bottom' | number;
    font: string | null;
    depthOffset: number;
    maxWidth: number;
    overflowWrap: 'normal' | 'break-word';
    textAlign: 'left' | 'right' | 'center' | 'justify';
    letterSpacing: number;
    lineHeight: number | 'normal';
    outlineWidth: number | string;
    outlineColor: number | string | Color;
    outlineOpacity: number;
    outlineBlur: number | string;
    outlineOffsetX: number | string;
    outlineOffsetY: number | string;
    strokeWidth: number | string;
    strokeColor: number | string | Color;
    strokeOpacity: number;
    fillOpacity: number;
    material: Material;
    sync(callback?: () => void): void;
    dispose(): void;
  }
}
