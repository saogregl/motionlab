declare module 'lucide-react/dist/esm/icons/*' {
  import type { ForwardRefExoticComponent, RefAttributes, SVGProps } from 'react';
  const icon: ForwardRefExoticComponent<
    Omit<
      SVGProps<SVGSVGElement> & { size?: string | number; absoluteStrokeWidth?: boolean },
      'ref'
    > &
      RefAttributes<SVGSVGElement>
  >;
  export default icon;
}
