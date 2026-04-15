import { Button } from '@motionlab/ui';

import { sendUpdateDatumPose } from '../../../engine/connection.js';
import { useMechanismStore } from '../../../stores/mechanism.js';

interface AxisPresetBarProps {
  datumId: string;
  disabled?: boolean;
}

/**
 * Quaternion that rotates the datum Z-axis to align with the given world direction.
 * Datum Z-axis = [0,0,1] in local frame. We compute the rotation from [0,0,1] to the target.
 */
function quaternionForZAxis(target: [number, number, number]): {
  x: number;
  y: number;
  z: number;
  w: number;
} {
  // Rotation from [0,0,1] to target using the shortest arc quaternion
  const [tx, ty, tz] = target;
  // dot([0,0,1], target) = tz
  const dot = tz;

  if (dot > 0.9999) {
    // Already aligned
    return { x: 0, y: 0, z: 0, w: 1 };
  }
  if (dot < -0.9999) {
    // Opposite: rotate 180 around X
    return { x: 1, y: 0, z: 0, w: 0 };
  }

  // cross([0,0,1], target) = [-ty, tx, 0]
  const cx = -ty;
  const cy = tx;
  const cz = 0;
  const w = 1 + dot;
  const len = Math.sqrt(cx * cx + cy * cy + cz * cz + w * w);
  return { x: cx / len, y: cy / len, z: cz / len, w: w / len };
}

const PRESETS: { label: string; dir: [number, number, number] }[] = [
  { label: '+X', dir: [1, 0, 0] },
  { label: '+Y', dir: [0, 1, 0] },
  { label: '+Z', dir: [0, 0, 1] },
  { label: '\u2212X', dir: [-1, 0, 0] },
  { label: '\u2212Y', dir: [0, -1, 0] },
  { label: '\u2212Z', dir: [0, 0, -1] },
];

/**
 * Row of axis preset buttons that set the datum's Z-axis orientation.
 * Useful for quickly aligning a joint axis to a principal direction.
 */
export function AxisPresetBar({ datumId, disabled }: AxisPresetBarProps) {
  const datum = useMechanismStore((s) => s.datums.get(datumId));
  if (!datum) return null;

  const handlePreset = (dir: [number, number, number]) => {
    const orientation = quaternionForZAxis(dir);
    sendUpdateDatumPose(datumId, {
      position: datum.localPose.position,
      orientation,
    });
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1">
      <span className="text-2xs text-[var(--text-muted)] shrink-0">Axis:</span>
      <div className="flex gap-0.5">
        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            variant="outline"
            size="sm"
            className="h-5 min-w-0 px-1.5 text-[10px]"
            disabled={disabled}
            onClick={() => handlePreset(preset.dir)}
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
