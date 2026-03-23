import { cn } from '../../lib/utils';

interface SkeletonRowProps {
  /** Row variant matching a real component's dimensions */
  variant: 'tree-row' | 'property-row' | 'chart';
  /** Number of skeleton rows to render */
  count?: number;
  className?: string;
}

function SkeletonBar({ className }: { className?: string }) {
  return <div className={cn('animate-shimmer rounded-sm', className)} />;
}

function TreeRowSkeleton() {
  return (
    <div className="flex h-[var(--tree-row-h)] items-center gap-2 ps-6 pe-2">
      <SkeletonBar className="size-3.5 shrink-0 rounded-full" />
      <SkeletonBar className="h-2.5 flex-1 max-w-[120px]" />
    </div>
  );
}

function PropertyRowSkeleton() {
  return (
    <div className="flex h-[var(--inspector-row-h)] items-center gap-2 ps-2 pe-1">
      <SkeletonBar className="h-2.5 w-[var(--inspector-label-w)]" />
      <SkeletonBar className="h-2.5 flex-1" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex h-16 items-end gap-1 ps-2 pe-2 py-2">
      <SkeletonBar className="h-full w-4 flex-1" />
      <SkeletonBar className="h-3/4 w-4 flex-1" />
      <SkeletonBar className="h-1/2 w-4 flex-1" />
      <SkeletonBar className="h-2/3 w-4 flex-1" />
      <SkeletonBar className="h-full w-4 flex-1" />
      <SkeletonBar className="h-1/3 w-4 flex-1" />
    </div>
  );
}

const VARIANT_COMPONENT = {
  'tree-row': TreeRowSkeleton,
  'property-row': PropertyRowSkeleton,
  chart: ChartSkeleton,
};

function LoadingSkeleton({ variant, count = 3, className }: SkeletonRowProps) {
  const Row = VARIANT_COMPONENT[variant];
  return (
    <div data-slot="loading-skeleton" className={cn('flex flex-col', className)}>
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows keyed by index
        <Row key={i} />
      ))}
    </div>
  );
}

export { LoadingSkeleton };
export type { SkeletonRowProps };
