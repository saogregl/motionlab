import {
  DataPointTable,
  InspectorSection,
  NumericInput,
  PropertyRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@motionlab/ui';
import { Activity } from 'lucide-react';

import type { CommandFunctionShape, CommandFunctionShapeId } from '../../../stores/mechanism.js';
import { useSimulationSettingsStore } from '../../../stores/simulation-settings.js';
import { FunctionPreviewChart } from '../FunctionPreviewChart.js';

interface CommandFunctionSectionProps {
  fn: CommandFunctionShape;
  onChange: (fn: CommandFunctionShape) => void;
  unit: string;
  disabled?: boolean;
}

const SHAPE_LABELS: Record<CommandFunctionShapeId, string> = {
  'constant': 'Constant',
  'ramp': 'Ramp',
  'sine': 'Sine',
  'piecewise-linear': 'Piecewise Linear',
  'smooth-step': 'Smooth Step',
};

function defaultForShape(shape: CommandFunctionShapeId): CommandFunctionShape {
  switch (shape) {
    case 'constant': return { shape: 'constant', value: 0 };
    case 'ramp': return { shape: 'ramp', initialValue: 0, slope: 1 };
    case 'sine': return { shape: 'sine', amplitude: 1, frequency: 1, phase: 0, offset: 0 };
    case 'piecewise-linear': return { shape: 'piecewise-linear', times: [0, 1], values: [0, 1] };
    case 'smooth-step': return { shape: 'smooth-step', displacement: 1, duration: 1, profile: 'cycloidal', accelFraction: 0.3, decelFraction: 0.3 };
  }
}

export function CommandFunctionSection({ fn, onChange, unit, disabled }: CommandFunctionSectionProps) {
  const simDuration = useSimulationSettingsStore((s) => s.duration);

  const handleShapeChange = (shape: string | null) => {
    if (shape) onChange(defaultForShape(shape as CommandFunctionShapeId));
  };

  return (
    <InspectorSection title="Command Function" icon={<Activity className="size-3.5" />}>
      <PropertyRow label="Shape">
        <Select value={fn.shape} onValueChange={handleShapeChange}>
          <SelectTrigger size="sm" disabled={disabled}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SHAPE_LABELS).map(([id, label]) => (
              <SelectItem key={id} value={id}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PropertyRow>

      {fn.shape === 'constant' && (
        <PropertyRow label="Value" unit={unit} numeric>
          <NumericInput
            variant="inline"
            value={fn.value}
            onChange={(v) => onChange({ ...fn, value: v })}
            step={0.1}
            precision={4}
            disabled={disabled}
          />
        </PropertyRow>
      )}

      {fn.shape === 'ramp' && (
        <>
          <PropertyRow label="Initial Value" unit={unit} numeric>
            <NumericInput
              variant="inline"
              value={fn.initialValue}
              onChange={(v) => onChange({ ...fn, initialValue: v })}
              step={0.1}
              precision={4}
              disabled={disabled}
            />
          </PropertyRow>
          <PropertyRow label="Slope" unit={`${unit}/s`} numeric>
            <NumericInput
              variant="inline"
              value={fn.slope}
              onChange={(v) => onChange({ ...fn, slope: v })}
              step={0.1}
              precision={4}
              disabled={disabled}
            />
          </PropertyRow>
        </>
      )}

      {fn.shape === 'sine' && (
        <>
          <PropertyRow label="Amplitude" unit={unit} numeric>
            <NumericInput
              variant="inline"
              value={fn.amplitude}
              onChange={(v) => onChange({ ...fn, amplitude: v })}
              step={0.1}
              precision={4}
              disabled={disabled}
            />
          </PropertyRow>
          <PropertyRow label="Frequency" unit="Hz" numeric>
            <NumericInput
              variant="inline"
              value={fn.frequency}
              onChange={(v) => onChange({ ...fn, frequency: v })}
              step={0.1}
              min={0.001}
              precision={3}
              disabled={disabled}
            />
          </PropertyRow>
          <PropertyRow label="Phase" unit="rad" numeric>
            <NumericInput
              variant="inline"
              value={fn.phase}
              onChange={(v) => onChange({ ...fn, phase: v })}
              step={0.1}
              precision={3}
              disabled={disabled}
            />
          </PropertyRow>
          <PropertyRow label="Offset" unit={unit} numeric>
            <NumericInput
              variant="inline"
              value={fn.offset}
              onChange={(v) => onChange({ ...fn, offset: v })}
              step={0.1}
              precision={4}
              disabled={disabled}
            />
          </PropertyRow>
        </>
      )}

      {fn.shape === 'piecewise-linear' && (
        <DataPointTable
          columns={[
            { header: 'Time (s)', step: 0.1, precision: 3 },
            { header: 'Value', step: 0.1, precision: 4 },
          ]}
          rows={fn.times.map((t, i) => [t, fn.values[i]])}
          onChange={(rows) =>
            onChange({ ...fn, times: rows.map((r) => r[0]), values: rows.map((r) => r[1]) })
          }
          disabled={disabled}
        />
      )}

      {fn.shape === 'smooth-step' && (
        <>
          <PropertyRow label="Displacement" unit={unit} numeric>
            <NumericInput
              variant="inline"
              value={fn.displacement}
              onChange={(v) => onChange({ ...fn, displacement: v })}
              step={0.1}
              precision={4}
              disabled={disabled}
            />
          </PropertyRow>
          <PropertyRow label="Duration" unit="s" numeric>
            <NumericInput
              variant="inline"
              value={fn.duration}
              onChange={(v) => onChange({ ...fn, duration: v })}
              step={0.1}
              min={0.001}
              precision={3}
              disabled={disabled}
            />
          </PropertyRow>
          <PropertyRow label="Profile">
            <Select value={fn.profile} onValueChange={(v) => onChange({ ...fn, profile: v as 'cycloidal' | 'trapezoidal' })}>
              <SelectTrigger size="sm" disabled={disabled}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cycloidal">Cycloidal</SelectItem>
                <SelectItem value="trapezoidal">Trapezoidal</SelectItem>
              </SelectContent>
            </Select>
          </PropertyRow>
          {fn.profile === 'trapezoidal' && (
            <>
              <PropertyRow label="Accel %" numeric>
                <NumericInput
                  variant="inline"
                  value={fn.accelFraction * 100}
                  onChange={(v) => onChange({ ...fn, accelFraction: Math.max(0, Math.min(1, v / 100)) })}
                  step={5}
                  min={0}
                  max={100}
                  precision={0}
                  disabled={disabled}
                />
              </PropertyRow>
              <PropertyRow label="Decel %" numeric>
                <NumericInput
                  variant="inline"
                  value={fn.decelFraction * 100}
                  onChange={(v) => onChange({ ...fn, decelFraction: Math.max(0, Math.min(1, v / 100)) })}
                  step={5}
                  min={0}
                  max={100}
                  precision={0}
                  disabled={disabled}
                />
              </PropertyRow>
            </>
          )}
        </>
      )}

      {fn.shape !== 'constant' && (
        <div className="pt-1">
          <FunctionPreviewChart fn={fn} duration={simDuration} />
        </div>
      )}
    </InspectorSection>
  );
}
