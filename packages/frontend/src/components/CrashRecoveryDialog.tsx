import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@motionlab/ui';
import { useState } from 'react';

import { sendLoadProject } from '../engine/connection.js';
import { useMechanismStore } from '../stores/mechanism.js';
import type { RecoverableProject } from '../types/motionlab.js';

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function truncatePath(filePath: string, maxLen = 50): string {
  if (filePath.length <= maxLen) return filePath;
  const parts = filePath.split('/');
  if (parts.length <= 3) return `\u2026${filePath.slice(-maxLen)}`;
  return `\u2026/${parts.slice(-3).join('/')}`;
}

interface CrashRecoveryDialogProps {
  recoverableProjects: RecoverableProject[];
  onClose: () => void;
}

export function CrashRecoveryDialog({ recoverableProjects, onClose }: CrashRecoveryDialogProps) {
  const [remaining, setRemaining] = useState(recoverableProjects);
  const [recovering, setRecovering] = useState<string | null>(null);

  const handleRecover = async (project: RecoverableProject) => {
    if (!window.motionlab?.readAutoSave) return;
    setRecovering(project.autoSavePath);
    try {
      const data = await window.motionlab.readAutoSave(project.autoSavePath);
      sendLoadProject(new Uint8Array(data));
      // Set project metadata to original path so subsequent saves go to the right place
      const mechStore = useMechanismStore.getState();
      // Small delay to let loadProjectResult handler run first
      setTimeout(() => {
        mechStore.setProjectMeta(project.name, project.originalPath);
        mechStore.markDirty(); // Recovered state differs from last saved version
      }, 500);
      // Clean up the autosave file
      await window.motionlab.discardAutoSave(project.autoSavePath);
      onClose();
    } catch (err) {
      console.error('[recovery] failed to recover:', err);
      setRecovering(null);
    }
  };

  const handleDiscard = async (project: RecoverableProject) => {
    await window.motionlab?.discardAutoSave?.(project.autoSavePath);
    const next = remaining.filter((p) => p.autoSavePath !== project.autoSavePath);
    setRemaining(next);
    if (next.length === 0) onClose();
  };

  const handleDiscardAll = async () => {
    for (const project of remaining) {
      await window.motionlab?.discardAutoSave?.(project.autoSavePath);
    }
    onClose();
  };

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[520px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Recover Unsaved Work</DialogTitle>
          <DialogDescription>
            MotionLab didn&apos;t shut down properly. The following projects have unsaved changes
            that can be recovered.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-2 max-h-[300px] overflow-y-auto">
          {remaining.map((project) => (
            <div
              key={project.autoSavePath}
              className="flex items-center justify-between gap-3 rounded border border-border-default px-3 py-2"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-medium text-text-primary truncate">
                  {project.name}
                </span>
                <span className="text-xs text-text-tertiary truncate font-mono">
                  {project.originalPath ? truncatePath(project.originalPath) : 'Unsaved project'}
                </span>
                <span className="text-xs text-text-tertiary">
                  Last modified {formatRelativeTime(project.modifiedAt)}
                </span>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={recovering !== null}
                  onClick={() => handleDiscard(project)}
                >
                  Discard
                </Button>
                <Button
                  size="sm"
                  disabled={recovering !== null}
                  onClick={() => handleRecover(project)}
                >
                  {recovering === project.autoSavePath ? 'Recovering\u2026' : 'Recover'}
                </Button>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={recovering !== null} onClick={handleDiscardAll}>
            Discard All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
