import {
  InspectorSection,
  NumericInput,
  PropertyRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  formatEngValue,
} from '@motionlab/ui';
import { Shield } from 'lucide-react';
import { useCallback, useRef } from 'react';

const DEBOUNCE_MS = 300;

type CollisionShapeType = 'none' | 'box' | 'sphere' | 'cylinder' | 'convex-hull';

interface CollisionConfig {
  shapeType: CollisionShapeType;
  halfExtents: { x: number; y: number; z: number };
  radius: number;
  height: number;
  offset: { x: number; y: number; z: number };
}

interface CollisionSectionProps {
  geometryId: string;
  collisionConfig?: CollisionConfig;
  isSimulating: boolean;
  onConfigChange: (config: { shapeType: CollisionShapeType; halfExtents?: { x: number; y: number; z: number }; radius?: number; height?: number; offset?: { x: number; y: number; z: number } }) => void;
}

const SHAPE_OPTIONS: { value: CollisionShapeType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'box', label: 'Box' },
  { value: 'sphere', label: 'Sphere' },
  { value: 'cylinder', label: 'Cylinder' },
];

function CollisionSection({
  geometryId: _geometryId,
  collisionConfig,
  isSimulating,
  onConfigChange,
}: CollisionSectionProps) {
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const debouncedChange = useCallback(
    (config: Parameters<typeof onConfigChange>[0]) => {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        onConfigChange(config);
      }, DEBOUNCE_MS);
    },
    [onConfigChange],
  );

  const shapeType = collisionConfig?.shapeType ?? 'none';

  const handleShapeChange = (newType: string | null) => {
    if (!newType) return;
    const type = newType as CollisionShapeType;
    // Send zero dimensions to trigger auto-fit on the engine
    onConfigChange({ shapeType: type });
  };

  return (
    <InspectorSection title="Collision Shape" icon={<Shield className="size-3.5" />}>
      <PropertyRow label="Shape">
        <Select value={shapeType} onValueChange={handleShapeChange} disabled={isSimulating}>
          <SelectTrigger className="h-6 w-full text-2xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SHAPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-2xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PropertyRow>

      {shapeType === 'box' && collisionConfig && (
        <>
          <PropertyRow label="Half X" unit="m" numeric>
            <NumericInput
              value={collisionConfig.halfExtents.x}
              onChange={(v) =>
                debouncedChange({
                  shapeType: 'box',
                  halfExtents: { ...collisionConfig.halfExtents, x: v },
                  offset: collisionConfig.offset,
                })
              }
              min={0.001}
              step={0.01}
              disabled={isSimulating}
            />
          </PropertyRow>
          <PropertyRow label="Half Y" unit="m" numeric>
            <NumericInput
              value={collisionConfig.halfExtents.y}
              onChange={(v) =>
                debouncedChange({
                  shapeType: 'box',
                  halfExtents: { ...collisionConfig.halfExtents, y: v },
                  offset: collisionConfig.offset,
                })
              }
              min={0.001}
              step={0.01}
              disabled={isSimulating}
            />
          </PropertyRow>
          <PropertyRow label="Half Z" unit="m" numeric>
            <NumericInput
              value={collisionConfig.halfExtents.z}
              onChange={(v) =>
                debouncedChange({
                  shapeType: 'box',
                  halfExtents: { ...collisionConfig.halfExtents, z: v },
                  offset: collisionConfig.offset,
                })
              }
              min={0.001}
              step={0.01}
              disabled={isSimulating}
            />
          </PropertyRow>
        </>
      )}

      {shapeType === 'sphere' && collisionConfig && (
        <PropertyRow label="Radius" unit="m" numeric>
          <NumericInput
            value={collisionConfig.radius}
            onChange={(v) =>
              debouncedChange({
                shapeType: 'sphere',
                radius: v,
                offset: collisionConfig.offset,
              })
            }
            min={0.001}
            step={0.01}
            disabled={isSimulating}
          />
        </PropertyRow>
      )}

      {shapeType === 'cylinder' && collisionConfig && (
        <>
          <PropertyRow label="Radius" unit="m" numeric>
            <NumericInput
              value={collisionConfig.radius}
              onChange={(v) =>
                debouncedChange({
                  shapeType: 'cylinder',
                  radius: v,
                  height: collisionConfig.height,
                  offset: collisionConfig.offset,
                })
              }
              min={0.001}
              step={0.01}
              disabled={isSimulating}
            />
          </PropertyRow>
          <PropertyRow label="Height" unit="m" numeric>
            <NumericInput
              value={collisionConfig.height}
              onChange={(v) =>
                debouncedChange({
                  shapeType: 'cylinder',
                  radius: collisionConfig.radius,
                  height: v,
                  offset: collisionConfig.offset,
                })
              }
              min={0.001}
              step={0.01}
              disabled={isSimulating}
            />
          </PropertyRow>
        </>
      )}

      {shapeType !== 'none' && collisionConfig && (
        <PropertyRow label="Status">
          <span className="text-2xs text-[var(--text-secondary)]">
            {collisionConfig.halfExtents.x > 0 || collisionConfig.radius > 0
              ? 'Configured'
              : 'Auto-fit pending'}
          </span>
        </PropertyRow>
      )}
    </InspectorSection>
  );
}

export { CollisionSection };
export type { CollisionSectionProps };
