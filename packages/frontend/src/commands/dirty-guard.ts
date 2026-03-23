import { useMechanismStore } from '../stores/mechanism.js';

/**
 * Checks if the project has unsaved changes and prompts the user to confirm discarding them.
 * Returns 'proceed' if the user confirms or there are no unsaved changes, 'cancel' otherwise.
 */
export async function guardDirtyState(): Promise<'proceed' | 'cancel'> {
  const { isDirty } = useMechanismStore.getState();
  if (!isDirty) return 'proceed';
  const confirmed = window.confirm('You have unsaved changes. Discard them?');
  return confirmed ? 'proceed' : 'cancel';
}
