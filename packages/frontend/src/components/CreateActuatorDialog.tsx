import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  NumericInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@motionlab/ui';
import { useEffect, useState } from 'react';

import { sendCreateActuator, sendUpdateActuator } from '../engine/connection.js';
import type { ActuatorState, ActuatorTypeId, ControlModeId, JointTypeId } from '../stores/mechanism.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { getActuatorUnit as getCommandUnit, getEffortUnit } from '../utils/actuator-units.js';

interface CreateActuatorDialogProps {
  jointId: string;
  jointType: JointTypeId;
  open: boolean;
  onClose: () => void;
  /** When provided, dialog operates in edit mode */
  initialActuator?: ActuatorState;
}

export function CreateActuatorDialog({
  jointId,
  jointType,
  open,
  onClose,
  initialActuator,
}: CreateActuatorDialogProps) {
  const isEdit = !!initialActuator;
  const actuatorType: ActuatorTypeId =
    jointType === 'prismatic' ? 'prismatic-motor' : 'revolute-motor';
  const actuatorLabel = actuatorType === 'revolute-motor' ? 'Revolute Motor' : 'Prismatic Motor';

  const jointName = useMechanismStore((s) => s.joints.get(jointId)?.name ?? 'Joint');

  const [name, setName] = useState('');
  const [controlMode, setControlMode] = useState<ControlModeId>('speed');
  const [commandValue, setCommandValue] = useState(0);
  const [effortLimit, setEffortLimit] = useState<number | undefined>(undefined);
  const [hasEffortLimit, setHasEffortLimit] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return;
    if (initialActuator) {
      setName(initialActuator.name);
      setControlMode(initialActuator.controlMode);
      setCommandValue(initialActuator.commandValue);
      setEffortLimit(initialActuator.effortLimit);
      setHasEffortLimit(initialActuator.effortLimit !== undefined);
    } else {
      setName(`Motor: ${jointName}`);
      setControlMode('speed');
      setCommandValue(0);
      setEffortLimit(undefined);
      setHasEffortLimit(false);
    }
  }, [open, initialActuator, jointName]);

  const handleSubmit = () => {
    const state: ActuatorState = {
      id: initialActuator?.id ?? '',
      name: name || `Motor: ${jointName}`,
      type: actuatorType,
      jointId,
      controlMode,
      commandValue,
      commandFunction: initialActuator?.commandFunction ?? { shape: 'constant', value: commandValue },
      effortLimit: hasEffortLimit ? (effortLimit ?? 0) : undefined,
    };
    if (isEdit) {
      sendUpdateActuator(state);
    } else {
      sendCreateActuator(state);
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Motor' : 'Add Motor'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Edit motor on joint "${jointName}".`
              : `Add a ${actuatorLabel.toLowerCase()} to joint "${jointName}".`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Motor: ${jointName}`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Type</label>
            <div className="text-sm text-foreground">{actuatorLabel}</div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Control Mode</label>
            <Select value={controlMode} onValueChange={(v) => setControlMode(v as ControlModeId)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="position">Position</SelectItem>
                <SelectItem value="speed">Speed</SelectItem>
                <SelectItem value="effort">Effort</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              Command Value ({getCommandUnit(actuatorType, controlMode)})
            </label>
            <NumericInput
              variant="field"
              value={commandValue}
              onChange={setCommandValue}
              step={controlMode === 'position' ? 0.1 : controlMode === 'speed' ? 0.5 : 1}
              precision={3}
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">
                Effort Limit ({getEffortUnit(actuatorType)})
              </label>
              <button
                type="button"
                className="text-2xs text-muted-foreground hover:text-foreground"
                onClick={() => setHasEffortLimit(!hasEffortLimit)}
              >
                {hasEffortLimit ? 'Remove' : 'Add'}
              </button>
            </div>
            {hasEffortLimit && (
              <NumericInput
                variant="field"
                value={effortLimit ?? 0}
                onChange={setEffortLimit}
                min={0}
                step={1}
                precision={2}
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>{isEdit ? 'Update' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
