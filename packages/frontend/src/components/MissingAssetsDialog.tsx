import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@motionlab/ui';
import type { MissingAssetInfo } from '@motionlab/protocol';
import { useCallback, useEffect, useState } from 'react';
import { sendRelocateAsset } from '../engine/connection.js';
import { onRelocateAssetResult } from '../engine/connection.js';

interface MissingAssetsDialogProps {
  open: boolean;
  onClose: () => void;
  missingAssets: MissingAssetInfo[];
}

export function MissingAssetsDialog({ open, onClose, missingAssets }: MissingAssetsDialogProps) {
  const [remaining, setRemaining] = useState<MissingAssetInfo[]>(missingAssets);
  const [relocating, setRelocating] = useState<string | null>(null);

  // Sync internal state when the prop list changes (e.g. new project load)
  useEffect(() => {
    setRemaining(missingAssets);
  }, [missingAssets]);

  // Listen for relocate results to remove resolved entries
  useEffect(() => {
    if (!open) return;
    onRelocateAssetResult((bodyId, success, errorMessage) => {
      setRelocating(null);
      if (success) {
        setRemaining((prev) => {
          const next = prev.filter((a) => a.bodyId !== bodyId);
          // Auto-close when all assets are resolved
          if (next.length === 0) {
            onClose();
          }
          return next;
        });
      } else {
        console.error('[missing-assets] relocation failed:', errorMessage);
      }
    });
    return () => {
      onRelocateAssetResult(null);
    };
  }, [open, onClose]);

  const handleLocate = useCallback(async (asset: MissingAssetInfo) => {
    if (!window.motionlab?.openFileDialog) return;
    try {
      const filePath = await window.motionlab.openFileDialog({
        filters: [
          { name: 'CAD Files', extensions: ['step', 'stp', 'iges', 'igs'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (!filePath) return;
      setRelocating(asset.bodyId);
      sendRelocateAsset(asset.bodyId, filePath);
    } catch {
      console.error('[missing-assets] failed to open file dialog');
    }
  }, []);

  const reasonLabel = (reason: string): string => {
    switch (reason) {
      case 'file_not_found':
        return 'File not found';
      case 'hash_mismatch':
        return 'File changed (hash mismatch)';
      case 'cache_corrupted':
        return 'Cache corrupted';
      default:
        return reason;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Missing Assets</DialogTitle>
          <DialogDescription>
            {remaining.length} asset{remaining.length !== 1 ? 's' : ''} could not be found.
            Locate the files to restore geometry, or continue without them.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-2 max-h-[300px] overflow-y-auto">
          {remaining.map((asset) => (
            <div
              key={asset.bodyId}
              className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-medium text-text-primary truncate">
                  {asset.bodyName}
                </span>
                <span className="text-xs text-muted-foreground truncate font-mono">
                  {asset.expectedAsset?.originalFilename ?? 'unknown'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {reasonLabel(asset.reason)}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={relocating === asset.bodyId}
                onClick={() => handleLocate(asset)}
              >
                {relocating === asset.bodyId ? 'Locating...' : 'Locate File'}
              </Button>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Continue Without
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
