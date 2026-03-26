import { InspectorSection, NumericInput, PropertyRow } from '@motionlab/ui';
import { Box } from 'lucide-react';
import { useCallback, useRef } from 'react';

const DEBOUNCE_MS = 300;

type PrimitiveShape = 'box' | 'cylinder' | 'sphere';

interface PrimitiveParams {
  box?: { width: number; height: number; depth: number };
  cylinder?: { radius: number; height: number };
  sphere?: { radius: number };
}

interface PrimitiveParamsSectionProps {
  geometryId: string;
  shape: PrimitiveShape;
  params: PrimitiveParams;
  isSimulating: boolean;
  onParamsChange: (params: PrimitiveParams) => void;
}

function PrimitiveParamsSection({
  geometryId: _geometryId,
  shape,
  params,
  isSimulating,
  onParamsChange,
}: PrimitiveParamsSectionProps) {
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const debouncedChange = useCallback(
    (newParams: PrimitiveParams) => {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        onParamsChange(newParams);
      }, DEBOUNCE_MS);
    },
    [onParamsChange],
  );

  const shapeLabel = shape.charAt(0).toUpperCase() + shape.slice(1);

  return (
    <InspectorSection title={`${shapeLabel} Dimensions`} icon={<Box className="size-3.5" />}>
      {shape === 'box' && params.box && (
        <>
          <PropertyRow label="Width" unit="m" numeric>
            <NumericInput
              value={params.box.width}
              onChange={(v) => debouncedChange({ box: { ...params.box!, width: v } })}
              min={0.001}
              step={0.01}
              disabled={isSimulating}
            />
          </PropertyRow>
          <PropertyRow label="Height" unit="m" numeric>
            <NumericInput
              value={params.box.height}
              onChange={(v) => debouncedChange({ box: { ...params.box!, height: v } })}
              min={0.001}
              step={0.01}
              disabled={isSimulating}
            />
          </PropertyRow>
          <PropertyRow label="Depth" unit="m" numeric>
            <NumericInput
              value={params.box.depth}
              onChange={(v) => debouncedChange({ box: { ...params.box!, depth: v } })}
              min={0.001}
              step={0.01}
              disabled={isSimulating}
            />
          </PropertyRow>
        </>
      )}
      {shape === 'cylinder' && params.cylinder && (
        <>
          <PropertyRow label="Radius" unit="m" numeric>
            <NumericInput
              value={params.cylinder.radius}
              onChange={(v) => debouncedChange({ cylinder: { ...params.cylinder!, radius: v } })}
              min={0.001}
              step={0.01}
              disabled={isSimulating}
            />
          </PropertyRow>
          <PropertyRow label="Height" unit="m" numeric>
            <NumericInput
              value={params.cylinder.height}
              onChange={(v) => debouncedChange({ cylinder: { ...params.cylinder!, height: v } })}
              min={0.001}
              step={0.01}
              disabled={isSimulating}
            />
          </PropertyRow>
        </>
      )}
      {shape === 'sphere' && params.sphere && (
        <PropertyRow label="Radius" unit="m" numeric>
          <NumericInput
            value={params.sphere.radius}
            onChange={(v) => debouncedChange({ sphere: { radius: v } })}
            min={0.001}
            step={0.01}
            disabled={isSimulating}
          />
        </PropertyRow>
      )}
    </InspectorSection>
  );
}

export { PrimitiveParamsSection };
export type { PrimitiveParamsSectionProps };
