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
  Switch,
} from '@motionlab/ui';
import { useState } from 'react';

import { sendCreateBody } from '../engine/connection.js';
import { useMechanismStore } from '../stores/mechanism.js';

interface CreateBodyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateBodyDialog({ open, onOpenChange }: CreateBodyDialogProps) {
  const [name, setName] = useState('');
  const [mass, setMass] = useState(1.0);
  const [motionType, setMotionType] = useState<'dynamic' | 'fixed'>('dynamic');
  const [manualMassOverride, setManualMassOverride] = useState(false);
  const bodyCount = useMechanismStore((s) => s.bodies.size);

  const effectiveName = name || `Body ${bodyCount + 1}`;

  const handleCreate = () => {
    sendCreateBody(effectiveName, {
      massProperties: manualMassOverride
        ? {
            mass,
            centerOfMass: { x: 0, y: 0, z: 0 },
            ixx: mass * 0.01,
            iyy: mass * 0.01,
            izz: mass * 0.01,
            ixy: 0,
            ixz: 0,
            iyz: 0,
          }
        : undefined,
      motionType,
    });
    onOpenChange(false);
    setName('');
    setMass(1.0);
    setMotionType('dynamic');
    setManualMassOverride(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Create Body</DialogTitle>
          <DialogDescription>
            Create an empty body. Enable manual mass only when the body should start in override
            mode.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Body ${bodyCount + 1}`}
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Manual Mass Override</label>
            <Switch checked={manualMassOverride} onCheckedChange={setManualMassOverride} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Mass (kg)</label>
            <NumericInput
              variant="field"
              value={mass}
              onChange={setMass}
              min={0.001}
              step={0.1}
              precision={3}
              disabled={!manualMassOverride}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Motion Type</label>
            <Select
              value={motionType}
              onValueChange={(v) => setMotionType(v as 'dynamic' | 'fixed')}
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dynamic">Dynamic</SelectItem>
                <SelectItem value="fixed">Fixed (Ground)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
