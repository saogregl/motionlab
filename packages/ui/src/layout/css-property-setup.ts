/**
 * Register CSS custom properties with @property so they become animatable
 * via CSS transitions. Without this, custom properties only change discretely.
 *
 * Called once from LayoutManager constructor.
 */

const LAYOUT_PROPERTIES = [
  { name: '--vp-inset-left', initial: '0px' },
  { name: '--vp-inset-right', initial: '0px' },
  { name: '--vp-inset-bottom', initial: '0px' },
  { name: '--side-panel-bottom', initial: '6px' },
] as const;

let registered = false;

export function registerLayoutProperties(): void {
  if (registered) return;
  registered = true;

  for (const prop of LAYOUT_PROPERTIES) {
    try {
      CSS.registerProperty({
        name: prop.name,
        syntax: '<length>',
        inherits: true,
        initialValue: prop.initial,
      });
    } catch {
      // Already registered or unsupported — ignore
    }
  }
}
