import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  NumericInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@motionlab/ui';
import { useEffect, useState } from 'react';

import { sendCreateJoint } from '../engine/connection.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { nextJointName } from '../utils/joint-naming.js';

type JointType = 'revolute' | 'prismatic' | 'fixed';

export function JointConfigDialog() {
  const step = useJointCreationStore((s) => s.step);
  const parentDatumId = useJointCreationStore((s) => s.parentDatumId);
  const childDatumId = useJointCreationStore((s) => s.childDatumId);
  const reset = useJointCreationStore((s) => s.reset);
  const cancel = useJointCreationStore((s) => s.cancel);

  const [type, setType] = useState<JointType>('revolute');
  const [name, setName] = useState('');
  const [lowerLimit, setLowerLimit] = useState(0);
  const [upperLimit, setUpperLimit] = useState(0);

  const open = step === 'configure';

  // Auto-generate name when dialog opens
  useEffect(() => {
    if (open) {
      const joints = useMechanismStore.getState().joints;
      setName(nextJointName(joints));
      setType('revolute');
      setLowerLimit(0);
      setUpperLimit(0);
    }
  }, [open]);

  const handleConfirm = () => {
    if (!parentDatumId || !childDatumId) return;
    const trimmedName = name.trim() || 'Joint';
    sendCreateJoint(
      parentDatumId,
      childDatumId,
      type,
      trimmedName,
      type === 'fixed' ? 0 : lowerLimit,
      type === 'fixed' ? 0 : upperLimit,
    );
    reset(); // back to pick-parent, stay in create-joint mode
  };

  const handleCancel = () => {
    cancel(); // back to pick-parent
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); }}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Create Joint</DialogTitle>
          <DialogDescription>
            Configure the joint between the selected datums.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Type</label>
            <Select value={type} onValueChange={(v) => setType(v as JointType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="revolute">Revolute</SelectItem>
                <SelectItem value="prismatic">Prismatic</SelectItem>
                <SelectItem value="fixed">Fixed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type !== 'fixed' && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  Lower Limit {type === 'revolute' ? '(rad)' : '(m)'}
                </label>
                <NumericInput
                  value={lowerLimit}
                  onChange={setLowerLimit}
                  step={type === 'revolute' ? 0.1 : 0.01}
                  precision={4}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  Upper Limit {type === 'revolute' ? '(rad)' : '(m)'}
                </label>
                <NumericInput
                  value={upperLimit}
                  onChange={setUpperLimit}
                  step={type === 'revolute' ? 0.1 : 0.01}
                  precision={4}
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
