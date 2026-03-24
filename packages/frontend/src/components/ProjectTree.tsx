import {
  BodyContextMenu,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  DatumContextMenu,
  EmptyState,
  GeometryContextMenu,
  GroupHeaderRow,
  InlineEditableName,
  JointContextMenu,
  type TreeNode,
  TreeRow,
  type TreeRowRenderProps,
  TreeView,
  Button,
} from '@motionlab/ui';
import { Activity, Box, Cog, Crosshair, Hexagon, Import, Link2, Plus, RotateCcw, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { executeCommand } from '../commands/registry.js';
import {
  getSceneGraph,
  sendDeleteBody,
  sendDeleteDatum,
  sendDeleteJoint,
  sendDeleteActuator,
  sendDeleteLoad,
  sendDetachGeometry,
  sendRenameDatum,
  sendUpdateActuator,
  sendUpdateBody,
  sendUpdateJoint,
  sendUpdateLoad,
} from '../engine/connection.js';
import { AttachGeometryDialog } from './AttachGeometryDialog.js';
import { CreateBodyDialog } from './CreateBodyDialog.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import { useLoadCreationStore } from '../stores/load-creation.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useToastStore } from '../stores/toast.js';
import { useToolModeStore } from '../stores/tool-mode.js';
import { useVisibilityStore } from '../stores/visibility.js';
import {
  resolveViewportEntityId,
  resolveViewportEntityIds,
} from '../utils/viewport-entity-resolution.js';

// ── Sentinel IDs for group / structural nodes ──

const ROOT_ID = '__root';
const BODIES_GROUP_ID = '__group_bodies';
const GEOMETRIES_GROUP_ID = '__group_geometries';
const JOINTS_GROUP_ID = '__group_joints';
const LOADS_GROUP_ID = '__group_loads';

function isStructuralId(id: string) {
  return id.startsWith('__');
}

// ── Node type discriminator ──

type NodeType = 'root' | 'group' | 'body' | 'geometry' | 'datum' | 'joint' | 'load' | 'actuator';

// ── Icons ──

const LOAD_TYPE_ICONS: Record<string, React.ReactNode> = {
  'point-force': <Zap className="size-3.5" />,
  'point-torque': <RotateCcw className="size-3.5" />,
  'spring-damper': <Activity className="size-3.5" />,
};

const ICONS: Record<string, React.ReactNode> = {
  body: <Box className="size-3.5" />,
  geometry: <Hexagon className="size-3.5" />,
  datum: <Crosshair className="size-3.5" />,
  joint: <Link2 className="size-3.5" />,
  load: <Zap className="size-3.5" />,
  actuator: <Cog className="size-3.5" />,
};

// ── Component ──

export function ProjectTree() {
  const bodies = useMechanismStore((s) => s.bodies);
  const geometries = useMechanismStore((s) => s.geometries);
  const datums = useMechanismStore((s) => s.datums);
  const joints = useMechanismStore((s) => s.joints);
  const loads = useMechanismStore((s) => s.loads);
  const actuators = useMechanismStore((s) => s.actuators);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const setSelection = useSelectionStore((s) => s.setSelection);
  const lastSelectedId = useSelectionStore((s) => s.lastSelectedId);
  const simState = useSimulationStore((s) => s.state);
  const isSimulating = simState === 'running' || simState === 'paused';
  const hiddenIds = useVisibilityStore((s) => s.hiddenIds);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set([ROOT_ID, BODIES_GROUP_ID, GEOMETRIES_GROUP_ID, JOINTS_GROUP_ID, LOADS_GROUP_ID]),
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [createBodyOpen, setCreateBodyOpen] = useState(false);
  const [attachGeomId, setAttachGeomId] = useState<string | null>(null);

  // ── Connection index for cross-reference indicators ──

  const connectionIndex = useMemo(() => {
    const bodyJointCount = new Map<string, number>();
    const jointBodies = new Map<string, [string, string]>();

    for (const [jid, joint] of joints) {
      const parentDatum = datums.get(joint.parentDatumId);
      const childDatum = datums.get(joint.childDatumId);
      const parentBody = parentDatum ? bodies.get(parentDatum.parentBodyId) : undefined;
      const childBody = childDatum ? bodies.get(childDatum.parentBodyId) : undefined;

      if (parentBody) bodyJointCount.set(parentBody.id, (bodyJointCount.get(parentBody.id) ?? 0) + 1);
      if (childBody && childBody.id !== parentBody?.id) bodyJointCount.set(childBody.id, (bodyJointCount.get(childBody.id) ?? 0) + 1);

      jointBodies.set(jid, [parentBody?.name ?? '?', childBody?.name ?? '?']);
    }

    return { bodyJointCount, jointBodies };
  }, [joints, datums, bodies]);

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

    // Bodies + their geometries + their datums
    for (const body of bodies.values()) {
      const bodyGeometries = [...geometries.values()].filter((g) => g.parentBodyId === body.id);
      const bodyDatums = [...datums.values()].filter((d) => d.parentBodyId === body.id);
      const hasChildren = bodyGeometries.length > 0 || bodyDatums.length > 0;
      result.push({
        id: body.id,
        parentId: BODIES_GROUP_ID,
        level: 2,
        name: body.name,
        hasChildren,
        _type: 'body' as NodeType,
        _noGeometry: bodyGeometries.length === 0,
      });
      // Geometry children first
      for (const geom of bodyGeometries) {
        result.push({
          id: geom.id,
          parentId: body.id,
          level: 3,
          name: geom.name,
          hasChildren: false,
          _type: 'geometry' as NodeType,
        });
      }
      // Then datum children
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

    const unparentedGeometries = [...geometries.values()].filter((g) => g.parentBodyId == null);
    if (unparentedGeometries.length > 0) {
      result.push({
        id: GEOMETRIES_GROUP_ID,
        parentId: ROOT_ID,
        level: 1,
        name: 'Detached Geometry',
        hasChildren: true,
        _type: 'group' as NodeType,
        _count: unparentedGeometries.length,
      });
      for (const geom of unparentedGeometries) {
        result.push({
          id: geom.id,
          parentId: GEOMETRIES_GROUP_ID,
          level: 2,
          name: geom.name,
          hasChildren: false,
          _type: 'geometry' as NodeType,
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
        const jointActuators = [...actuators.values()].filter((a) => a.jointId === joint.id);
        result.push({
          id: joint.id,
          parentId: JOINTS_GROUP_ID,
          level: 2,
          name: joint.name,
          hasChildren: jointActuators.length > 0,
          _type: 'joint' as NodeType,
          _jointType: joint.type,
        });
        for (const act of jointActuators) {
          result.push({
            id: act.id,
            parentId: joint.id,
            level: 3,
            name: act.name,
            hasChildren: false,
            _type: 'actuator' as NodeType,
            _actuatorType: act.type,
          });
        }
      }
    }

    // Loads group (only if loads exist)
    if (loads.size > 0) {
      result.push({
        id: LOADS_GROUP_ID,
        parentId: ROOT_ID,
        level: 1,
        name: 'Loads',
        hasChildren: loads.size > 0,
        _type: 'group' as NodeType,
        _count: loads.size,
      });
      for (const load of loads.values()) {
        result.push({
          id: load.id,
          parentId: LOADS_GROUP_ID,
          level: 2,
          name: load.name,
          hasChildren: false,
          _type: 'load' as NodeType,
          _loadType: load.type,
        });
      }
    }

    return result;
  }, [bodies, geometries, datums, joints, loads, actuators]);

  // ── Auto-expand parents of selected entities ──

  useEffect(() => {
    if (selectedIds.size === 0) return;

    const needed = new Set<string>();
    for (const id of selectedIds) {
      const node = nodes.find((n) => n.id === id);
      if (!node) continue;
      let parentId = node.parentId;
      while (parentId) {
        needed.add(parentId);
        const parent = nodes.find((n) => n.id === parentId);
        parentId = parent?.parentId ?? null;
      }
    }

    const missing = [...needed].filter((id) => !expandedIds.has(id));
    if (missing.length > 0) {
      const next = new Set(expandedIds);
      for (const id of missing) next.add(id);
      setExpandedIds(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- expandedIds excluded to avoid loops
  }, [selectedIds, nodes]);

  // ── Selection (filter out structural IDs) ──

  const handleSelectionChange = useCallback(
    (ids: Set<string>) => {
      const entity = [...ids].filter((id) => !isStructuralId(id));
      setSelection(entity);

      const viewportIds = resolveViewportEntityIds(
        new Set(entity),
        bodies,
        geometries,
      );

      // Focus viewport on selected entity/entities
      if (viewportIds.size === 1) {
        const [viewportId] = [...viewportIds];
        if (viewportId) {
          getSceneGraph()?.focusOnEntity(viewportId);
        }
      } else if (viewportIds.size > 1) {
        getSceneGraph()?.focusOnEntities([...viewportIds]);
      }
    },
    [bodies, geometries, setSelection],
  );

  // ── Delete handler ──

  const handleDelete = useCallback(
    (ids: Set<string>) => {
      if (isSimulating) return;
      const { bodies: bm, datums: dm, joints: jm, loads: lm, actuators: am } = useMechanismStore.getState();
      for (const id of ids) {
        if (bm.has(id)) {
          sendDeleteBody(id);
        } else if (dm.has(id)) {
          sendDeleteDatum(id);
        } else if (jm.has(id)) {
          sendDeleteJoint(id);
        } else if (lm.has(id)) {
          sendDeleteLoad(id);
        } else if (am.has(id)) {
          sendDeleteActuator(id);
        }
      }
    },
    [isSimulating],
  );

  // ── Rename commit ──

  const handleRenameCommit = useCallback((id: string, newName: string) => {
    const { bodies: bm, datums: dm, joints: jm, loads: lm, actuators: am } = useMechanismStore.getState();
    if (bm.has(id)) {
      sendUpdateBody(id, { name: newName });
    } else if (dm.has(id)) {
      sendRenameDatum(id, newName);
    } else if (jm.has(id)) {
      sendUpdateJoint(id, { name: newName });
    } else if (lm.has(id)) {
      const existing = lm.get(id)!;
      sendUpdateLoad({ ...existing, name: newName });
    } else if (am.has(id)) {
      const existing = am.get(id)!;
      sendUpdateActuator({ ...existing, name: newName });
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
            actions={
              node.id === BODIES_GROUP_ID && !isSimulating ? (
                <button
                  type="button"
                  className="flex size-4 items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  onClick={() => setCreateBodyOpen(true)}
                  title="Create empty body"
                >
                  <Plus className="size-3" />
                </button>
              ) : undefined
            }
          />
        );
      }

      // Entity rows
      const icon = nodeType === 'load'
        ? (LOAD_TYPE_ICONS[node._loadType as string] ?? ICONS.load)
        : nodeType === 'actuator'
          ? ICONS.actuator
          : ICONS[nodeType];
      let secondary: string | undefined;
      if (nodeType === 'joint') {
        const jBodies = connectionIndex.jointBodies.get(node.id);
        secondary = jBodies
          ? `${node._jointType as string} \u00b7 ${jBodies[0]} \u2194 ${jBodies[1]}`
          : (node._jointType as string);
      } else if (nodeType === 'body') {
        const jCount = connectionIndex.bodyJointCount.get(node.id);
        if (jCount && jCount > 0) {
          secondary = `(${jCount} ${jCount === 1 ? 'joint' : 'joints'})`;
        }
      } else if (nodeType === 'actuator') {
        const act = actuators.get(node.id);
        if (act) {
          secondary = act.controlMode;
        }
      }
      const isEditing = editingId === node.id;
      const isHidden = hiddenIds.has(node.id);
      const bodyStatus = nodeType === 'body' && node._noGeometry ? 'warning' as const : undefined;
      const row = isEditing ? (
        <div
          className="flex h-[var(--tree-row-h)] items-center"
          style={{ paddingLeft: `calc(var(--space-1) + ${node.level} * var(--tree-indent))` }}
        >
          <span className="size-4 shrink-0" />
          {icon && (
            <span className="mr-1 flex size-3.5 shrink-0 items-center justify-center">
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
          className={isHidden ? 'opacity-40' : undefined}
          status={bodyStatus}
        />
      );

      // Wrap in appropriate context menu
      if (nodeType === 'body') {
        const allBodyIds = [...bodies.keys()];
        return (
          <BodyContextMenu
            isHidden={isHidden}
            onSelectInViewport={() => {
              setSelection([node.id]);
            }}
            onIsolate={
              isSimulating
                ? undefined
                : () => {
                    useVisibilityStore.getState().isolate(node.id, allBodyIds);
                  }
            }
            onToggleVisibility={
              isSimulating
                ? undefined
                : () => {
                    useVisibilityStore.getState().toggleVisibility(node.id);
                  }
            }
            onCreateDatum={
              isSimulating
                ? undefined
                : () => {
                    useToolModeStore.getState().setMode('create-datum');
                  }
            }
            onCreateJoint={
              isSimulating
                ? undefined
                : () => {
                    // Find the first datum on this body and pre-select it
                    const bodyDatums = [...datums.values()].filter(
                      (d) => d.parentBodyId === node.id,
                    );
                    if (bodyDatums.length > 0) {
                      useToolModeStore.getState().setMode('create-joint');
                      const store = useJointCreationStore.getState();
                      store.setPreselectedJointType(null);
                      store.startCreation();
                      store.setParentDatum(bodyDatums[0].id);
                    }
                  }
            }
            onRename={isSimulating ? undefined : () => setEditingId(node.id)}
            renameDisabledReason={isSimulating ? 'Not available during simulation' : undefined}
            isolateDisabledReason={isSimulating ? 'Not available during simulation' : undefined}
            visibilityDisabledReason={isSimulating ? 'Not available during simulation' : undefined}
            createDatumDisabledReason={isSimulating ? 'Not available during simulation' : undefined}
            createJointDisabledReason={isSimulating ? 'Not available during simulation' : undefined}
            onProperties={() => {
              useSelectionStore.getState().select(node.id);
            }}
            onDelete={
              isSimulating
                ? undefined
                : () => {
                    const bodyGeoms = [...geometries.values()].filter(
                      (g) => g.parentBodyId === node.id,
                    );
                    const bodyDatums = [...datums.values()].filter(
                      (d) => d.parentBodyId === node.id,
                    );
                    const attachedCount = bodyGeoms.length + bodyDatums.length;
                    if (attachedCount > 0) {
                      const confirmed = window.confirm(
                        `Delete "${node.name}"? This will also remove ${bodyGeoms.length} geometry(s) and ${bodyDatums.length} datum(s).`,
                      );
                      if (!confirmed) return;
                    }
                    sendDeleteBody(node.id);
                  }
            }
            deleteDisabledReason={isSimulating ? 'Not available during simulation' : undefined}
          >
            {row}
          </BodyContextMenu>
        );
      }

      if (nodeType === 'geometry') {
        const geom = geometries.get(node.id);
        const focusTargetId = resolveViewportEntityId(node.id, bodies, geometries);
        return (
          <GeometryContextMenu
            isParented={!!geom?.parentBodyId}
            onSelectInViewport={() => setSelection([node.id])}
            onFocusViewport={
              focusTargetId
                ? () => getSceneGraph()?.focusOnEntity(focusTargetId)
                : undefined
            }
            focusDisabledReason={!focusTargetId ? 'Geometry is not attached to a body' : undefined}
            onAttachToBody={isSimulating ? undefined : () => setAttachGeomId(node.id)}
            attachDisabledReason={isSimulating ? 'Not available during simulation' : undefined}
            onDetachFromBody={
              isSimulating || !geom?.parentBodyId
                ? undefined
                : () => sendDetachGeometry(node.id)
            }
            detachDisabledReason={
              isSimulating
                ? 'Not available during simulation'
                : !geom?.parentBodyId
                  ? 'Geometry is not attached to a body'
                  : undefined
            }
            onProperties={() => useSelectionStore.getState().select(node.id)}
          >
            {row}
          </GeometryContextMenu>
        );
      }

      if (nodeType === 'datum') {
        return (
          <DatumContextMenu
            onSelectInViewport={() => {
              setSelection([node.id]);
            }}
            onFocusViewport={() => {
              getSceneGraph()?.focusOnEntity(node.id);
            }}
            onCreateJoint={
              isSimulating
                ? undefined
                : () => {
                    useToolModeStore.getState().setMode('create-joint');
                    const store = useJointCreationStore.getState();
                    store.setPreselectedJointType(null);
                    store.startCreation();
                    store.setParentDatum(node.id);
                  }
            }
            createJointDisabledReason={isSimulating ? 'Not available during simulation' : undefined}
            onCreateLoad={
              isSimulating
                ? undefined
                : () => {
                    useToolModeStore.getState().setMode('create-load');
                    const store = useLoadCreationStore.getState();
                    store.startCreation();
                    store.setDatum(node.id);
                  }
            }
            createLoadDisabledReason={isSimulating ? 'Not available during simulation' : undefined}
            onRename={isSimulating ? undefined : () => setEditingId(node.id)}
            renameDisabledReason={isSimulating ? 'Not available during simulation' : undefined}
            onProperties={() => {
              useSelectionStore.getState().select(node.id);
            }}
            onDelete={isSimulating ? undefined : () => sendDeleteDatum(node.id)}
            deleteDisabledReason={isSimulating ? 'Not available during simulation' : undefined}
          >
            {row}
          </DatumContextMenu>
        );
      }

      if (nodeType === 'joint') {
        return (
          <JointContextMenu
            onSelectInViewport={() => {
              setSelection([node.id]);
            }}
            onFocusViewport={() => {
              getSceneGraph()?.focusOnEntity(node.id);
            }}
            onEditJoint={() => {
              const joint = joints.get(node.id);
              if (!joint) return;
              useSelectionStore.getState().select(node.id);
              useToolModeStore.getState().setMode('create-joint');
              useJointCreationStore
                .getState()
                .editExisting(node.id, joint.parentDatumId, joint.childDatumId, joint.type);
            }}
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
            onAddMotor={
              (() => {
                if (isSimulating) return undefined;
                const joint = joints.get(node.id);
                if (!joint) return undefined;
                // Only revolute and prismatic joints support motors
                if (joint.type !== 'revolute' && joint.type !== 'prismatic') return undefined;
                // Check if this joint already has an actuator
                for (const a of actuators.values()) {
                  if (a.jointId === node.id) return undefined;
                }
                // Select joint → opens JointInspector with "Add Motor" button
                return () => useSelectionStore.getState().select(node.id);
              })()
            }
            addMotorDisabledReason={
              isSimulating
                ? 'Not available during simulation'
                : (() => {
                    const joint = joints.get(node.id);
                    if (!joint) return undefined;
                    if (joint.type !== 'revolute' && joint.type !== 'prismatic') return 'Only revolute and prismatic joints support motors';
                    for (const a of actuators.values()) {
                      if (a.jointId === node.id) return 'Joint already has a motor';
                    }
                    return undefined;
                  })()
            }
            onSwapBodies={
              isSimulating
                ? undefined
                : () => {
                    const joint = joints.get(node.id);
                    if (!joint) return;
                    sendUpdateJoint(node.id, {
                      parentDatumId: joint.childDatumId,
                      childDatumId: joint.parentDatumId,
                    });
                    useToastStore.getState().addToast({
                      variant: 'info',
                      title: 'Parent/child swapped',
                      description: 'Joint axis may have changed direction.',
                    });
                  }
            }
            onReverseDirection={
              isSimulating
                ? undefined
                : () => {
                    const joint = joints.get(node.id);
                    if (!joint) return;
                    sendUpdateJoint(node.id, {
                      parentDatumId: joint.childDatumId,
                      childDatumId: joint.parentDatumId,
                    });
                    useToastStore.getState().addToast({
                      variant: 'info',
                      title: 'Joint direction reversed',
                      description: 'Joint axis may have changed direction.',
                    });
                  }
            }
            onRename={isSimulating ? undefined : () => setEditingId(node.id)}
            renameDisabledReason={isSimulating ? 'Not available during simulation' : undefined}
            changeTypeDisabledReason={isSimulating ? 'Not available during simulation' : undefined}
            swapBodiesDisabledReason={isSimulating ? 'Not available during simulation' : undefined}
            reverseDirectionDisabledReason={isSimulating ? 'Not available during simulation' : undefined}
            onProperties={() => {
              useSelectionStore.getState().select(node.id);
            }}
            onDelete={isSimulating ? undefined : () => sendDeleteJoint(node.id)}
            deleteDisabledReason={isSimulating ? 'Not available during simulation' : undefined}
          >
            {row}
          </JointContextMenu>
        );
      }

      if (nodeType === 'load') {
        return (
          <ContextMenu>
            <ContextMenuTrigger>{row}</ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => setSelection([node.id])}>
                Select in Viewport
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => getSceneGraph()?.focusOnEntity(node.id)}>
                Focus Viewport on Load
              </ContextMenuItem>
              {!isSimulating && (
                <ContextMenuItem onSelect={() => setEditingId(node.id)}>
                  Rename
                </ContextMenuItem>
              )}
              <ContextMenuItem onSelect={() => useSelectionStore.getState().select(node.id)}>
                Properties
              </ContextMenuItem>
              {!isSimulating && (
                <ContextMenuItem
                  onSelect={() => sendDeleteLoad(node.id)}
                  className="text-destructive"
                >
                  Delete
                </ContextMenuItem>
              )}
            </ContextMenuContent>
          </ContextMenu>
        );
      }

      if (nodeType === 'actuator') {
        return (
          <ContextMenu>
            <ContextMenuTrigger>{row}</ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => setSelection([node.id])}>
                Select
              </ContextMenuItem>
              {!isSimulating && (
                <ContextMenuItem onSelect={() => setEditingId(node.id)}>
                  Rename
                </ContextMenuItem>
              )}
              <ContextMenuItem onSelect={() => useSelectionStore.getState().select(node.id)}>
                Properties
              </ContextMenuItem>
              {!isSimulating && (
                <ContextMenuItem
                  onSelect={() => sendDeleteActuator(node.id)}
                  className="text-destructive"
                >
                  Delete
                </ContextMenuItem>
              )}
            </ContextMenuContent>
          </ContextMenu>
        );
      }

      return row;
    },
    [editingId, isSimulating, handleRenameCommit, hiddenIds, bodies, geometries, datums, joints, loads, actuators, setSelection, connectionIndex],
  );

  // ── Empty state ──

  if (bodies.size === 0) {
    return (
      <EmptyState
        icon={<Import className="size-5" />}
        message="No bodies yet"
        hint="Import a STEP or IGES file to get started"
        action={
          window.motionlab?.openFileDialog ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => executeCommand('create.import')}
            >
              <Import className="size-3.5 mr-1" />
              Import
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      <TreeView
        nodes={nodes}
        selectedIds={selectedIds}
        onSelectionChange={handleSelectionChange}
        expandedIds={expandedIds}
        onExpandedChange={setExpandedIds}
        renderRow={renderRow}
        multiSelect
        onDelete={isSimulating ? undefined : handleDelete}
        scrollToId={lastSelectedId}
      />
      <CreateBodyDialog open={createBodyOpen} onOpenChange={setCreateBodyOpen} />
      <AttachGeometryDialog
        open={!!attachGeomId}
        onOpenChange={(open) => {
          if (!open) setAttachGeomId(null);
        }}
        geometryId={attachGeomId ?? ''}
      />
    </>
  );
}
