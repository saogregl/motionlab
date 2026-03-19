import {
  EmptyState,
  GroupHeaderRow,
  type TreeNode,
  TreeRow,
  type TreeRowRenderProps,
  TreeView,
} from '@motionlab/ui';
import { Box } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';

const BODIES_GROUP_ID = '__group_bodies';

export function BodyTree() {
  const bodies = useMechanismStore((s) => s.bodies);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const setSelection = useSelectionStore((s) => s.setSelection);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set([BODIES_GROUP_ID]));

  const nodes = useMemo<TreeNode[]>(() => {
    const result: TreeNode[] = [
      {
        id: BODIES_GROUP_ID,
        parentId: null,
        level: 0,
        name: 'Bodies',
        hasChildren: true,
        _type: 'group',
        _count: bodies.size,
      },
    ];
    for (const body of bodies.values()) {
      result.push({
        id: body.id,
        parentId: BODIES_GROUP_ID,
        level: 1,
        name: body.name,
        hasChildren: false,
        _type: 'body',
      });
    }
    return result;
  }, [bodies]);

  const handleSelectionChange = (ids: Set<string>) => {
    const filtered = [...ids].filter((id) => id !== BODIES_GROUP_ID);
    setSelection(filtered);
  };

  if (bodies.size === 0) {
    return (
      <EmptyState message="No bodies imported" hint="Import a STEP or IGES file to get started" />
    );
  }

  return (
    <TreeView
      nodes={nodes}
      selectedIds={selectedIds}
      onSelectionChange={handleSelectionChange}
      expandedIds={expandedIds}
      onExpandedChange={setExpandedIds}
      renderRow={(node: TreeNode, props: TreeRowRenderProps) =>
        node._type === 'group' ? (
          <GroupHeaderRow
            label={node.name}
            count={node._count as number}
            level={node.level}
            expanded={props.expanded}
            onToggleExpand={props.onToggleExpand}
          />
        ) : (
          <TreeRow
            level={node.level}
            name={node.name}
            icon={<Box className="size-4" />}
            hasChildren={false}
            expanded={false}
            selected={props.selected}
            focused={props.focused}
            onToggleExpand={props.onToggleExpand}
            onSelect={props.onSelect}
          />
        )
      }
    />
  );
}
