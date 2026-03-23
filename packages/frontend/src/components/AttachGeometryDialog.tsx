import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@motionlab/ui';
import { useState } from 'react';

import { sendAttachGeometry } from '../engine/connection.js';
import { useMechanismStore } from '../stores/mechanism.js';

interface AttachGeometryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  geometryId: string;
}

export function AttachGeometryDialog({
  open,
  onOpenChange,
  geometryId,
}: AttachGeometryDialogProps) {
  const [selectedBodyId, setSelectedBodyId] = useState('');
  const bodies = useMechanismStore((s) => s.bodies);
  const geometry = useMechanismStore((s) => s.geometries.get(geometryId));

  const handleAttach = () => {
    if (!selectedBodyId) return;
    sendAttachGeometry(geometryId, selectedBodyId);
    onOpenChange(false);
    setSelectedBodyId('');
  };

  const bodyList = [...bodies.values()];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setSelectedBodyId('');
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Attach Geometry to Body</DialogTitle>
          <DialogDescription>
            Select the body to attach "{geometry?.name ?? 'geometry'}" to.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Target Body</label>
            <Select value={selectedBodyId} onValueChange={(v) => { if (v) setSelectedBodyId(v); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select a body..." />
              </SelectTrigger>
              <SelectContent>
                {bodyList.map((body) => (
                  <SelectItem key={body.id} value={body.id}>
                    {body.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAttach} disabled={!selectedBodyId}>
            Attach
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
