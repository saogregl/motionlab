import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@motionlab/ui';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  { key: 'Ctrl/Cmd+K', action: 'Open command palette' },
  { key: 'Ctrl/Cmd+O', action: 'Open project' },
  { key: 'Ctrl/Cmd+S', action: 'Save project' },
  { key: 'V', action: 'Select mode' },
  { key: 'D', action: 'Create datum mode' },
  { key: 'J', action: 'Create joint mode' },
  { key: 'Escape', action: 'Cancel / Select mode' },
  { key: 'Space', action: 'Play / Pause simulation' },
  { key: '.', action: 'Step simulation' },
  { key: 'R', action: 'Reset simulation' },
  { key: 'Delete', action: 'Delete selected' },
  { key: 'Ctrl/Cmd+Shift+C', action: 'Toggle charts' },
];

export function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-0 py-2">
          {shortcuts.map(({ key, action }) => (
            <div key={key} className="flex items-center justify-between px-1 py-1.5">
              <span className="text-xs text-text-secondary">{action}</span>
              <kbd className="rounded border border-border bg-layer-elevated px-1.5 py-0.5 font-mono text-2xs text-text-primary">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
