import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  NumericInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@motionlab/ui';
import { useState } from 'react';

interface ImportSettingsDialogProps {
  open: boolean;
  filePath: string;
  onConfirm: (options: {
    densityOverride: number;
    tessellationQuality: number;
    unitSystem: string;
  }) => void;
  onCancel: () => void;
}

export function ImportSettingsDialog({
  open,
  filePath,
  onConfirm,
  onCancel,
}: ImportSettingsDialogProps) {
  const [density, setDensity] = useState(1000);
  const [quality, setQuality] = useState('0.1');
  const [units, setUnits] = useState('millimeter');

  const fileName = filePath.split(/[/\\]/).pop() ?? filePath;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Import Settings</DialogTitle>
          <DialogDescription>Configure import options for {fileName}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Density (kg/m³)</label>
            <NumericInput variant="field" value={density} onChange={setDensity} step={100} precision={0} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Tessellation Quality</label>
            <Select value={quality} onValueChange={(v) => { if (v) setQuality(v); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0.5">Coarse</SelectItem>
                <SelectItem value="0.1">Standard</SelectItem>
                <SelectItem value="0.01">Fine</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Unit System</label>
            <Select value={units} onValueChange={(v) => { if (v) setUnits(v); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="millimeter">Millimeter</SelectItem>
                <SelectItem value="meter">Meter</SelectItem>
                <SelectItem value="inch">Inch</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onConfirm({
            densityOverride: density,
            tessellationQuality: parseFloat(quality),
            unitSystem: units,
          })}>Import</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
