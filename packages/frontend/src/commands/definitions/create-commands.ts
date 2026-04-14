import {
  Activity,
  ArrowUpDown,
  Box,
  Circle,
  Crosshair,
  Cylinder,
  Gauge,
  Import,
  Link2,
  Lock,
  MoveHorizontal,
  Radio,
  RotateCcw,
  RotateCw,
  Zap,
} from 'lucide-react';

import { useEngineConnection } from '../../stores/engine-connection.js';
import { beginImportFlow } from '../../stores/import-flow.js';
import { useJointCreationStore } from '../../stores/joint-creation.js';
import { useLoadCreationStore } from '../../stores/load-creation.js';
import type { LoadTypeId } from '../../stores/mechanism.js';
import { useMechanismStore } from '../../stores/mechanism.js';
import { useSimulationStore } from '../../stores/simulation.js';
import { useToolModeStore } from '../../stores/tool-mode.js';
import { useUILayoutStore } from '../../stores/ui-layout.js';
import type { CommandDef } from '../types.js';

export function createCreateCommands(): CommandDef[] {
  const isBuildWorkspace = () => useUILayoutStore.getState().activeWorkspace === 'build';
  const isEngineReady = () => useEngineConnection.getState().status === 'ready';

  const notSimulating = () => {
    if (!isBuildWorkspace()) return false;
    const s = useSimulationStore.getState().state;
    return s !== 'running' && s !== 'paused';
  };

  const canImport = () =>
    isBuildWorkspace() && isEngineReady() && !useMechanismStore.getState().importing;

  const enterJointMode = (preselectedType?: string) => {
    useToolModeStore.getState().setMode('create-joint');
    const store = useJointCreationStore.getState();
    store.setPreselectedJointType(preselectedType ?? null);
    store.startCreation();
  };

  const enterLoadMode = (preselectedType?: LoadTypeId) => {
    useToolModeStore.getState().setMode('create-load');
    const store = useLoadCreationStore.getState();
    if (preselectedType) store.setPreselectedLoadType(preselectedType);
    store.startCreation();
  };

  return [
    {
      id: 'create.body',
      label: 'Create Body',
      icon: Box,
      category: 'create',
      shortcut: 'B',
      enabled: notSimulating,
      execute: () => {
        // Stub — body creation not yet wired
      },
    },
    {
      id: 'create.import',
      label: 'Import Geometry',
      icon: Import,
      category: 'create',
      enabled: canImport,
      execute: beginImportFlow,
    },
    {
      id: 'create.datum',
      label: 'Create Datum',
      icon: Crosshair,
      category: 'create',
      shortcut: 'D',
      enabled: notSimulating,
      execute: () => useToolModeStore.getState().setMode('create-datum'),
    },
    {
      id: 'create.datum.point',
      label: 'Create Datum Point',
      icon: Crosshair,
      category: 'create',
      enabled: () => false,
      execute: () => {},
    },
    {
      id: 'create.datum.axis',
      label: 'Create Datum Axis',
      icon: Crosshair,
      category: 'create',
      enabled: () => false,
      execute: () => {},
    },
    {
      id: 'create.datum.plane',
      label: 'Create Datum Plane',
      icon: Crosshair,
      category: 'create',
      enabled: () => false,
      execute: () => {},
    },
    {
      id: 'create.datum.from-face',
      label: 'Create Datum from Face',
      icon: Crosshair,
      category: 'create',
      shortcut: 'D',
      enabled: notSimulating,
      execute: () => useToolModeStore.getState().setMode('create-datum'),
    },
    {
      id: 'create.joint',
      label: 'Create Joint',
      icon: Link2,
      category: 'create',
      shortcut: 'J',
      enabled: notSimulating,
      execute: () => enterJointMode(),
    },
    {
      id: 'create.joint.revolute',
      label: 'Create Revolute Joint',
      icon: RotateCw,
      category: 'create',
      enabled: notSimulating,
      execute: () => enterJointMode('revolute'),
    },
    {
      id: 'create.joint.prismatic',
      label: 'Create Prismatic Joint',
      icon: MoveHorizontal,
      category: 'create',
      enabled: notSimulating,
      execute: () => enterJointMode('prismatic'),
    },
    {
      id: 'create.joint.fixed',
      label: 'Create Fixed Joint',
      icon: Lock,
      category: 'create',
      enabled: notSimulating,
      execute: () => enterJointMode('fixed'),
    },
    {
      id: 'create.joint.spherical',
      label: 'Create Spherical Joint',
      icon: Circle,
      category: 'create',
      enabled: notSimulating,
      execute: () => enterJointMode('spherical'),
    },
    {
      id: 'create.joint.cylindrical',
      label: 'Create Cylindrical Joint',
      icon: Cylinder,
      category: 'create',
      enabled: notSimulating,
      execute: () => enterJointMode('cylindrical'),
    },
    {
      id: 'create.joint.planar',
      label: 'Create Planar Joint',
      icon: MoveHorizontal,
      category: 'create',
      enabled: notSimulating,
      execute: () => enterJointMode('planar'),
    },
    {
      id: 'create.joint.universal',
      label: 'Create Universal Joint',
      icon: RotateCw,
      category: 'create',
      enabled: notSimulating,
      execute: () => enterJointMode('universal'),
    },
    {
      id: 'create.joint.distance',
      label: 'Create Distance Joint',
      icon: Link2,
      category: 'create',
      enabled: notSimulating,
      execute: () => enterJointMode('distance'),
    },
    {
      id: 'create.joint.point-line',
      label: 'Create Point-Line Joint',
      icon: MoveHorizontal,
      category: 'create',
      enabled: notSimulating,
      execute: () => enterJointMode('point-line'),
    },
    {
      id: 'create.joint.point-plane',
      label: 'Create Point-Plane Joint',
      icon: Circle,
      category: 'create',
      enabled: notSimulating,
      execute: () => enterJointMode('point-plane'),
    },
    {
      id: 'create.force.point',
      label: 'Create Point Force',
      icon: Zap,
      category: 'create',
      shortcut: 'L',
      enabled: notSimulating,
      execute: () => enterLoadMode('point-force'),
    },
    {
      id: 'create.force.torque',
      label: 'Create Point Torque',
      icon: RotateCcw,
      category: 'create',
      enabled: notSimulating,
      execute: () => enterLoadMode('point-torque'),
    },
    {
      id: 'create.force.spring-damper',
      label: 'Create Spring-Damper',
      icon: Activity,
      category: 'create',
      enabled: notSimulating,
      execute: () => enterLoadMode('spring-damper'),
    },
    {
      id: 'create.actuator.revolute-motor',
      label: 'Create Revolute Motor',
      icon: Gauge,
      category: 'create',
      enabled: () => false,
      execute: () => {},
    },
    {
      id: 'create.actuator.prismatic-motor',
      label: 'Create Prismatic Motor',
      icon: ArrowUpDown,
      category: 'create',
      enabled: () => false,
      execute: () => {},
    },
    {
      id: 'create.sensor',
      label: 'Create Sensor',
      icon: Radio,
      category: 'create',
      enabled: () => false,
      execute: () => {},
    },
  ];
}
