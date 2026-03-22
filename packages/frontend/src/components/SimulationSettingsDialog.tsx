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
import { useSimulationSettingsStore } from '../stores/simulation-settings.js';

interface SimulationSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SimulationSettingsDialog({ open, onClose }: SimulationSettingsDialogProps) {
  const timestep = useSimulationSettingsStore((s) => s.timestep);
  const gravity = useSimulationSettingsStore((s) => s.gravity);
  const setTimestep = useSimulationSettingsStore((s) => s.setTimestep);
  const setGravity = useSimulationSettingsStore((s) => s.setGravity);
  const applyPreset = useSimulationSettingsStore((s) => s.applyPreset);

  const timestepStr = String(timestep);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Simulation Settings</DialogTitle>
          <DialogDescription>Configure solver parameters for the next compilation.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Timestep (s)</label>
            <Select value={timestepStr} onValueChange={(v) => { if (v) setTimestep(parseFloat(v)); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0.01">0.01 (fast)</SelectItem>
                <SelectItem value="0.001">0.001 (default)</SelectItem>
                <SelectItem value="0.0001">0.0001 (precise)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Gravity Preset</label>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => applyPreset('earth')}>Earth</Button>
              <Button size="sm" variant="outline" onClick={() => applyPreset('moon')}>Moon</Button>
              <Button size="sm" variant="outline" onClick={() => applyPreset('mars')}>Mars</Button>
              <Button size="sm" variant="outline" onClick={() => applyPreset('zero-g')}>Zero-G</Button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Gravity (m/s²)</label>
            <div className="grid grid-cols-3 gap-1">
              <div className="flex flex-col gap-0.5">
                <span className="text-2xs text-muted-foreground">X</span>
                <NumericInput value={gravity.x} onChange={(v) => setGravity({ ...gravity, x: v })} step={0.1} precision={2} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-2xs text-muted-foreground">Y</span>
                <NumericInput value={gravity.y} onChange={(v) => setGravity({ ...gravity, y: v })} step={0.1} precision={2} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-2xs text-muted-foreground">Z</span>
                <NumericInput value={gravity.z} onChange={(v) => setGravity({ ...gravity, z: v })} step={0.1} precision={2} />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
