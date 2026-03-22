import {
  BodyContextMenu,
  DatumContextMenu,
  EmptyState,
  GroupHeaderRow,
  InlineEditableName,
  JointContextMenu,
  type TreeNode,
  TreeRow,
  type TreeRowRenderProps,
  TreeView,
} from '@motionlab/ui';
import { Box, Crosshair, Link2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { sendDeleteDatum, sendDeleteJoint, sendRenameDatum, sendUpdateJoint } from '../engine/connection.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useToolModeStore } from '../stores/tool-mode.js';

// ── Sentinel IDs for group / structural nodes ──

const ROOT_ID = '__root';
const BODIES_GROUP_ID = '__group_bodies';
const JOINTS_GROUP_ID = '__group_joints';

function isStructuralId(id: string) {
  return id.startsWith('__');
}

// ── Node type discriminator ──

type NodeType = 'root' | 'group' | 'body' | 'datum' | 'joint';

// ── Icons ──

const ICONS: Record<string, React.ReactNode> = {
  body: <Box className="size-3.5" />,
  datum: <Crosshair className="size-3.5" />,
  joint: <Link2 className="size-3.5" />,
};

// ── Component ──

export function ProjectTree() {
  const bodies = useMechanismStore((s) => s.bodies);
  const datums = useMechanismStore((s) => s.datums);
  const joints = useMechanismStore((s) => s.joints);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const setSelection = useSelectionStore((s) => s.setSelection);
  const simState = useSimulationStore((s) => s.state);
  const isSimulating = simState === 'running' || simState === 'paused';

  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set([ROOT_ID, BODIES_GROUP_ID, JOINTS_GROUP_ID]),
  );

  const [editingId, setEditingId] = useState<string | null>(null);

  // ── Build flat node list (depth-first pre-order) ──

  const nodes = useMemo<TreeNode[]>(() => {
    const result: TreeNode[] = [];

    // Root
    result.push({
      id: ROOT_ID,
      parentId: null,
      level: 0,
      name: 'Mechanism',
      hasChildren: true,
      _type: 'root' as NodeType,
    });

    // Bodies group
    result.push({
      id: BODIES_GROUP_ID,
      parentId: ROOT_ID,
      level: 1,
      name: 'Bodies',
      hasChildren: bodies.size > 0,
      _type: 'group' as NodeType,
      _count: bodies.size,
    });

    // Bodies + their datums
    for (const body of bodies.values()) {
      const bodyDatums = [...datums.values()].filter((d) => d.parentBodyId === body.id);
      result.push({
        id: body.id,
        parentId: BODIES_GROUP_ID,
        level: 2,
        name: body.name,
        hasChildren: bodyDatums.length > 0,
        _type: 'body' as NodeType,
      });
      for (const datum of bodyDatums) {
        result.push({
          id: datum.id,
          parentId: body.id,
          level: 3,
          name: datum.name,
          hasChildren: false,
          _type: 'datum' as NodeType,
        });
      }
    }

    // Joints group (only if joints exist)
    if (joints.size > 0) {
      result.push({
        id: JOINTS_GROUP_ID,
        parentId: ROOT_ID,
        level: 1,
        name: 'Joints',
        hasChildren: joints.size > 0,
        _type: 'group' as NodeType,
        _count: joints.size,
      });
      for (const joint of joints.values()) {
        result.push({
          id: joint.id,
          parentId: JOINTS_GROUP_ID,
          level: 2,
          name: joint.name,
          hasChildren: false,
          _type: 'joint' as NodeType,
          _jointType: joint.type,
        });
      }
    }

    return result;
  }, [bodies, datums, joints]);

  // ── Selection (filter out structural IDs) ──

  const handleSelectionChange = useCallback(
    (ids: Set<string>) => {
      const entity = [...ids].filter((id) => !isStructuralId(id));
      setSelection(entity);
    },
    [setSelection],
  );

  // ── Delete handler ──

  const handleDelete = useCallback(
    (ids: Set<string>) => {
      if (isSimulating) return;
      const { datums: dm, joints: jm } = useMechanismStore.getState();
      for (const id of ids) {
        if (dm.has(id)) {
          sendDeleteDatum(id);
        } else if (jm.has(id)) {
          sendDeleteJoint(id);
        }
      }
    },
    [isSimulating],
  );

  // ── Rename commit ──

  const handleRenameCommit = useCallback((id: string, newName: string) => {
    const { datums: dm, joints: jm } = useMechanismStore.getState();
    if (dm.has(id)) {
      sendRenameDatum(id, newName);
    } else if (jm.has(id)) {
      sendUpdateJoint(id, { name: newName });
    }
    setEditingId(null);
  }, []);

  // ── Render row ──

  const renderRow = useCallback(
    (node: TreeNode, props: TreeRowRenderProps) => {
      const nodeType = node._type as NodeType;

      // Group headers (root, bodies group, joints group)
      if (nodeType === 'root' || nodeType === 'group') {
        return (
          <GroupHeaderRow
            label={node.name}
            count={node._count as number | undefined}
            level={node.level}
            expanded={props.expanded}
            onToggleExpand={props.onToggleExpand}
          />
        );
      }

      // Entity rows
      const icon = ICONS[nodeType];
      const secondary = nodeType === 'joint' ? (node._jointType as string) : undefined;
      const isEditing = editingId === node.id;
      const row = isEditing ? (
        <div
          className="flex h-[var(--tree-row-h)] items-center"
          style={{ paddingLeft: `calc(var(--space-1) + ${node.level} * var(--tree-indent))` }}
        >
          <span className="size-4 shrink-0" />
          {icon && (
            <span className="mr-1.5 flex size-3.5 shrink-0 items-center justify-center">
              {icon}
            </span>
          )}
          <InlineEditableName
            value={node.name}
            isEditing
            onStartEdit={() => {}}
            onCommit={(newName) => handleRenameCommit(node.id, newName)}
            onCancel={() => setEditingId(null)}
          />
        </div>
      ) : (
        <TreeRow
          level={node.level}
          name={node.name}
          icon={icon}
          secondary={secondary}
          hasChildren={node.hasChildren}
          expanded={props.expanded}
          selected={props.selected}
          focused={props.focused}
          onToggleExpand={props.onToggleExpand}
          onSelect={props.onSelect}
        />
      );

      // Wrap in appropriate context menu
      if (nodeType === 'body') {
        return (
          <BodyContextMenu
            onRename={isSimulating ? undefined : () => setEditingId(node.id)}
            onDelete={undefined}
            onCreateDatum={
              isSimulating
                ? undefined
                : () => {
                    useToolModeStore.getState().setMode('create-datum');
                  }
            }
            onSelectInViewport={() => {
              setSelection([node.id]);
            }}
          >
            {row}
          </BodyContextMenu>
        );
      }

      if (nodeType === 'datum') {
        return (
          <DatumContextMenu
            onRename={isSimulating ? undefined : () => setEditingId(node.id)}
            onDelete={isSimulating ? undefined : () => sendDeleteDatum(node.id)}
            onCreateJoint={
              isSimulating
                ? undefined
                : () => {
                    useToolModeStore.getState().setMode('create-joint');
                    useJointCreationStore.getState().startCreation();
                    useJointCreationStore.getState().setParentDatum(node.id);
                  }
            }
            onSelectInViewport={() => {
              setSelection([node.id]);
            }}
          >
            {row}
          </DatumContextMenu>
        );
      }

      if (nodeType === 'joint') {
        return (
          <JointContextMenu
            onRename={isSimulating ? undefined : () => setEditingId(node.id)}
            onDelete={isSimulating ? undefined : () => sendDeleteJoint(node.id)}
            onChangeType={
              isSimulating
                ? undefined
                : (type: string) => {
                    const typeMap: Record<string, string> = {
                      Revolute: 'revolute',
                      Prismatic: 'prismatic',
                      Fixed: 'fixed',
                      Spherical: 'spherical',
                      Cylindrical: 'cylindrical',
                      Planar: 'planar',
                    };
                    const mapped = typeMap[type];
                    if (mapped) {
                      sendUpdateJoint(node.id, {
                        type: mapped as 'revolute' | 'prismatic' | 'fixed' | 'spherical' | 'cylindrical' | 'planar',
                      });
                    }
                  }
            }
            onSelectInViewport={() => {
              setSelection([node.id]);
            }}
          >
            {row}
          </JointContextMenu>
        );
      }

      return row;
    },
    [editingId, isSimulating, handleRenameCommit],
  );

  // ── Empty state ──

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
      renderRow={renderRow}
      multiSelect
      onDelete={isSimulating ? undefined : handleDelete}
    />
  );
}
