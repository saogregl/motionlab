import { CopyableId, InlineEditableName, InspectorSection, PropertyRow } from '@motionlab/ui';

import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';

interface IdentitySectionProps {
  entityId: string;
  entityType: 'body' | 'geometry' | 'datum' | 'joint' | 'load' | 'actuator' | 'sensor';
  name: string;
  onRename?: (newName: string) => void;
  metadata?: Array<{ label: string; value: ReactNode }>;
  disabled?: boolean;
}

function IdentitySection({
  entityId,
  entityType,
  name,
  onRename,
  metadata,
  disabled,
}: IdentitySectionProps) {
  const [editingName, setEditingName] = useState(false);

  const startEditName = useCallback(() => {
    if (!onRename || disabled) return;
    setEditingName(true);
  }, [onRename, disabled]);

  const commitName = useCallback(
    (newName: string) => {
      if (newName !== name) {
        onRename?.(newName);
      }
      setEditingName(false);
    },
    [name, onRename],
  );

  const typeLabel = entityType.charAt(0).toUpperCase() + entityType.slice(1);

  return (
    <InspectorSection title="Identity">
      <PropertyRow label="Name">
        {onRename ? (
          <InlineEditableName
            value={name}
            isEditing={editingName}
            onStartEdit={startEditName}
            onCommit={commitName}
            onCancel={() => setEditingName(false)}
          />
        ) : (
          <span className="text-2xs truncate">{name}</span>
        )}
      </PropertyRow>
      {metadata?.map((entry) => (
        <PropertyRow key={entry.label} label={entry.label}>
          {entry.value}
        </PropertyRow>
      ))}
      <PropertyRow label={`${typeLabel} ID`}>
        <CopyableId value={entityId} />
      </PropertyRow>
    </InspectorSection>
  );
}

export { IdentitySection };
export type { IdentitySectionProps };
