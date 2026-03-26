import { cn } from '@motionlab/ui';

interface ThumbnailProps {
  className?: string;
}

/**
 * Simple gear/mechanism SVG thumbnail for project documents.
 * Uses currentColor so it inherits text color from parent.
 */
function MechanismThumbnail({ className }: ThumbnailProps) {
  return (
    <svg
      viewBox="0 0 80 60"
      className={cn('size-full', className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="80" height="60" fill="var(--layer-raised)" rx="2" />
      <g transform="translate(40,30)" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.6">
        {/* Outer gear teeth (8 teeth) */}
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i * Math.PI * 2) / 8;
          const innerR = 12;
          const outerR = 16;
          const halfTooth = Math.PI / 16;
          const x1 = Math.cos(angle - halfTooth) * innerR;
          const y1 = Math.sin(angle - halfTooth) * innerR;
          const x2 = Math.cos(angle - halfTooth) * outerR;
          const y2 = Math.sin(angle - halfTooth) * outerR;
          const x3 = Math.cos(angle + halfTooth) * outerR;
          const y3 = Math.sin(angle + halfTooth) * outerR;
          const x4 = Math.cos(angle + halfTooth) * innerR;
          const y4 = Math.sin(angle + halfTooth) * innerR;
          return (
            <polygon
              key={i}
              points={`${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`}
              fill="currentColor"
              opacity="0.2"
            />
          );
        })}
        {/* Gear body circle */}
        <circle cx="0" cy="0" r="12" />
        {/* Center hole */}
        <circle cx="0" cy="0" r="4" />
        {/* Spokes */}
        <line x1="0" y1="-4" x2="0" y2="-12" />
        <line x1="4" y1="0" x2="12" y2="0" />
        <line x1="0" y1="4" x2="0" y2="12" />
        <line x1="-4" y1="0" x2="-12" y2="0" />
      </g>
    </svg>
  );
}

/**
 * Blank document/sheet SVG thumbnail for empty or new documents.
 */
function EmptyDocumentThumbnail({ className }: ThumbnailProps) {
  return (
    <svg
      viewBox="0 0 80 60"
      className={cn('size-full', className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="80" height="60" fill="var(--layer-raised)" rx="2" />
      <g transform="translate(40,30)" opacity="0.5">
        <rect
          x="-12"
          y="-16"
          width="24"
          height="32"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        {/* Folded corner */}
        <polygon
          points="6,-16 12,-16 12,-10"
          fill="currentColor"
          opacity="0.25"
          stroke="currentColor"
          strokeWidth="0.8"
        />
        {/* Lines representing content */}
        <line x1="-7" y1="-6" x2="4" y2="-6" stroke="currentColor" strokeWidth="0.8" />
        <line x1="-7" y1="-1" x2="7" y2="-1" stroke="currentColor" strokeWidth="0.8" />
        <line x1="-7" y1="4" x2="2" y2="4" stroke="currentColor" strokeWidth="0.8" />
      </g>
    </svg>
  );
}

export { MechanismThumbnail, EmptyDocumentThumbnail };
export type { ThumbnailProps };
