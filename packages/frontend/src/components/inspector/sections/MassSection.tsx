import type { Axis } from '@motionlab/ui';
import {
  EditableInertiaMatrix,
  formatEngValue,
  InertiaMatrixDisplay,
  InspectorSection,
  NumericInput,
  PropertyRow,
  Switch,
  Vec3Display,
} from '@motionlab/ui';
import { Grid3X3, Scale } from 'lucide-react';
import { useCallback, useRef } from 'react';

const DEBOUNCE_MS = 300;

interface MassProperties {
  mass: number;
  centerOfMass: { x: number; y: number; z: number };
  ixx: number;
  iyy: number;
  izz: number;
  ixy: number;
  ixz: number;
  iyz: number;
}

interface MassSectionProps {
  bodyId: string;
  massProperties: MassProperties;
  massOverride: boolean;
  geometryCount: number;
  isSimulating: boolean;
  onOverrideChange: (override: boolean) => void;
  onMassPropertiesChange: (props: MassProperties) => void;
}

function MassSection({
  bodyId: _bodyId,
  massProperties: mp,
  massOverride,
  geometryCount,
  isSimulating,
  onOverrideChange,
  onMassPropertiesChange,
}: MassSectionProps) {
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const debouncedChange = useCallback(
    (newProps: MassProperties) => {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        onMassPropertiesChange(newProps);
      }, DEBOUNCE_MS);
    },
    [onMassPropertiesChange],
  );

  return (
    <>
      <InspectorSection title="Mass Properties" icon={<Scale className="size-3.5" />}>
        <PropertyRow label="Source">
          <span className="text-2xs text-[var(--text-secondary)]">
            {massOverride
              ? 'User override'
              : geometryCount > 0
                ? `Computed from ${geometryCount} ${geometryCount === 1 ? 'geometry' : 'geometries'}`
                : 'Computed (no geometry attached)'}
          </span>
        </PropertyRow>
        <PropertyRow label="Override">
          <Switch
            checked={massOverride}
            onCheckedChange={onOverrideChange}
            disabled={isSimulating}
          />
        </PropertyRow>
        <PropertyRow label="Mass" unit="kg" numeric>
          {massOverride ? (
            <NumericInput
              value={mp.mass}
              onChange={(v) => debouncedChange({ ...mp, mass: v })}
              min={0.001}
              step={0.1}
              disabled={isSimulating}
            />
          ) : (
            <span className="font-[family-name:var(--font-mono)] tabular-nums">
              {formatEngValue(mp.mass)}
            </span>
          )}
        </PropertyRow>
        <Vec3Display
          label="Center of Mass"
          value={mp.centerOfMass}
          unit="m"
          editable={massOverride && !isSimulating}
          onChange={(axis: Axis, val: number) => {
            const newCom = { ...mp.centerOfMass, [axis]: val };
            debouncedChange({ ...mp, centerOfMass: newCom });
          }}
        />
      </InspectorSection>

      <InspectorSection title="Inertia Tensor" icon={<Grid3X3 className="size-3.5" />}>
        {massOverride ? (
          <EditableInertiaMatrix
            ixx={mp.ixx}
            iyy={mp.iyy}
            izz={mp.izz}
            ixy={mp.ixy}
            ixz={mp.ixz}
            iyz={mp.iyz}
            unit="kg m²"
            onChange={(values) => debouncedChange({ ...mp, ...values })}
            disabled={isSimulating}
          />
        ) : (
          <InertiaMatrixDisplay
            ixx={mp.ixx}
            iyy={mp.iyy}
            izz={mp.izz}
            ixy={mp.ixy}
            ixz={mp.ixz}
            iyz={mp.iyz}
            unit="kg m²"
          />
        )}
      </InspectorSection>
    </>
  );
}

export { MassSection };
export type { MassSectionProps, MassProperties };
