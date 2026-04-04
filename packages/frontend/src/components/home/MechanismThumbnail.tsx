import { cn } from '@motionlab/ui';

interface ThumbnailProps {
  className?: string;
}

/**
 * Kinematic linkage SVG thumbnail for project documents.
 * Uses currentColor so it inherits text color from parent.
 */
function MechanismThumbnail({ className }: ThumbnailProps) {
  return (
    <svg
      viewBox="0 0 80 60"
      className={cn('size-full', className)}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="80" height="60" fill="var(--layer-raised)" rx="2" />
      <g fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5">
        <line x1="18" y1="46" x2="35" y2="22" />
        <line x1="35" y1="22" x2="58" y2="14" />
        <line x1="58" y1="14" x2="66" y2="40" />
        <line x1="35" y1="22" x2="44" y2="46" />
        <circle cx="18" cy="46" r="3" />
        <circle cx="35" cy="22" r="3" />
        <circle cx="58" cy="14" r="3" />
        <circle cx="66" cy="40" r="2.5" />
        <circle cx="44" cy="46" r="3" />
        <circle cx="18" cy="46" r="1" fill="currentColor" opacity="0.3" />
        <circle cx="44" cy="46" r="1" fill="currentColor" opacity="0.3" />
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
      aria-hidden="true"
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
