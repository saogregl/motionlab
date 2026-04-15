import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@motionlab/ui';
import { useEngineConnection } from '../stores/engine-connection.js';

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AboutDialog({ open, onClose }: AboutDialogProps) {
  const engineVersion = useEngineConnection((s) => s.engineVersion);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[320px]">
        <DialogHeader>
          <DialogTitle>About MotionLab</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-2 text-xs text-text-secondary">
          <p>MotionLab is a desktop-first mechanism authoring and simulation workbench.</p>
          {engineVersion && (
            <p>
              Engine version: <span className="font-mono text-text-primary">{engineVersion}</span>
            </p>
          )}
          <p>
            Protocol: <span className="font-mono text-text-primary">v1</span>
          </p>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
