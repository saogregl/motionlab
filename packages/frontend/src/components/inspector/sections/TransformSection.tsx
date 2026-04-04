import type { Axis } from '@motionlab/ui';
import { InspectorSection, QuatDisplay, Vec3Display } from '@motionlab/ui';

import { useCallback, useEffect, useRef } from 'react';

const DEBOUNCE_MS = 300;

interface TransformSectionProps {
  /** Frame label shown in section title, e.g. "(world)" or "(relative to Body_1)" */
  frameLabel: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  /** Enable editing (default true) */
  editable?: boolean;
  /** Disable input fields (e.g. during simulation) */
  disabled?: boolean;
  /** Called with the new pose after 300ms debounce */
  onTransformChange?: (pose: {
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
  }) => void;
  /** Default open state (default true) */
  defaultOpen?: boolean;
}

function TransformSection({
  frameLabel,
  position,
  rotation,
  editable = true,
  disabled,
  onTransformChange,
  defaultOpen = true,
}: TransformSectionProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingRef = useRef<{
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
  } | null>(null);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const scheduleUpdate = useCallback(
    (pose: {
      position: { x: number; y: number; z: number };
      orientation: { x: number; y: number; z: number; w: number };
    }) => {
      pendingRef.current = pose;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (pendingRef.current) {
          onTransformChange?.(pendingRef.current);
          pendingRef.current = null;
        }
      }, DEBOUNCE_MS);
    },
    [onTransformChange],
  );

  const handlePositionChange = useCallback(
    (axis: Axis, value: number) => {
      const newPos = { ...position, [axis]: value };
      scheduleUpdate({ position: newPos, orientation: rotation });
    },
    [position, rotation, scheduleUpdate],
  );

  const handleRotationChange = useCallback(
    (q: { x: number; y: number; z: number; w: number }) => {
      scheduleUpdate({ position, orientation: q });
    },
    [position, scheduleUpdate],
  );

  const isEditable = editable && !disabled;

  return (
    <InspectorSection title={`Transform ${frameLabel}`} defaultOpen={defaultOpen}>
      <Vec3Display
        label="Position"
        value={position}
        unit="m"
        editable={isEditable}
        onChange={handlePositionChange}
        step={0.001}
      />
      <QuatDisplay
        value={rotation}
        label="Rotation"
        editable={isEditable}
        onChange={handleRotationChange}
        disabled={disabled}
      />
    </InspectorSection>
  );
}

export { TransformSection };
export type { TransformSectionProps };
