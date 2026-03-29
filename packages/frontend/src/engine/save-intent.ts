export class SaveIntentTracker {
  private forceSaveAsNextSave = false;
  private pendingAutoSaveCount = 0;

  requestManualSave(): void {
    // Manual saves should not cancel in-flight autosaves; results are consumed in send order.
  }

  requestSaveAs(): void {
    this.forceSaveAsNextSave = true;
  }

  requestAutoSave(): boolean {
    if (this.pendingAutoSaveCount > 0) {
      return false;
    }
    this.pendingAutoSaveCount += 1;
    return true;
  }

  consumeProjectData(projectFilePath: string | null): { kind: 'autosave' } | { kind: 'manual'; existingPath: string | null } {
    if (this.pendingAutoSaveCount > 0) {
      this.pendingAutoSaveCount -= 1;
      return { kind: 'autosave' };
    }

    const existingPath = this.forceSaveAsNextSave ? null : projectFilePath;
    this.forceSaveAsNextSave = false;
    return { kind: 'manual', existingPath };
  }

  consumeError(): 'autosave' | 'manual' {
    if (this.pendingAutoSaveCount > 0) {
      this.pendingAutoSaveCount -= 1;
      return 'autosave';
    }
    return 'manual';
  }
}
