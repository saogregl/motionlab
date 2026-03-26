import {
  InspectorSection,
  QuatDisplay,
  Vec3Display,
} from '@motionlab/ui';
import { Move3D } from 'lucide-react';

interface PoseSectionProps {
  title?: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  defaultOpen?: boolean;
}

function PoseSection({
  title = 'Pose',
  position,
  rotation,
  defaultOpen = true,
}: PoseSectionProps) {
  return (
    <InspectorSection
      title={title}
      icon={<Move3D className="size-3.5" />}
      defaultOpen={defaultOpen}
    >
      <Vec3Display label="Position" value={position} unit="m" />
      <QuatDisplay value={rotation} label="Rotation" />
    </InspectorSection>
  );
}

export { PoseSection };
export type { PoseSectionProps };
