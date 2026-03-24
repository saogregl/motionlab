import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCreateCommands } from '../commands/definitions/create-commands.js';
import { createFileCommands } from '../commands/definitions/file-commands.js';
import { createHelpCommands } from '../commands/definitions/help-commands.js';
import { createSimulateCommands } from '../commands/definitions/simulate-commands.js';
import type { CommandDef } from '../commands/types.js';
import { useCommandPaletteStore } from '../stores/command-palette.js';
import { useDialogStore } from '../stores/dialogs.js';
import { useEngineConnection } from '../stores/engine-connection.js';
import { useImportFlowStore } from '../stores/import-flow.js';
import { useJointCreationStore } from '../stores/joint-creation.js';
import { useLoadCreationStore } from '../stores/load-creation.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useToolModeStore } from '../stores/tool-mode.js';

function findCommand(commands: CommandDef[], id: string): CommandDef {
  const command = commands.find((item) => item.id === id);
  if (!command) {
    throw new Error(`Command ${id} not found`);
  }
  return command;
}

function stubWindow(options?: {
  confirmReturn?: boolean;
  filePath?: string | null;
  projectFile?: { data: string } | null;
}) {
  const confirm = vi.fn(() => options?.confirmReturn ?? true);
  const openFileDialog = vi.fn(async () => options?.filePath ?? '/tmp/model.step');
  const openProjectFile = vi.fn(async () => options?.projectFile ?? { data: '{"project":"demo"}' });

  vi.stubGlobal('window', {
    confirm,
    motionlab: {
      openFileDialog,
      openProjectFile,
      showLogsFolder: vi.fn(),
    },
  });

  return {
    confirm,
    openFileDialog,
    openProjectFile,
  };
}

describe('Epic 12 command regressions', () => {
  beforeEach(() => {
    useEngineConnection.setState({ status: 'ready' });
    useSimulationStore.getState().reset();
    useJointCreationStore.setState({
      step: 'idle',
      parentDatumId: null,
      childDatumId: null,
      preselectedJointType: null,
    });
    useLoadCreationStore.getState().exitMode();
    useToolModeStore.setState({ activeMode: 'select', gizmoMode: 'off' });
    useImportFlowStore.getState().closeImportDialog();
    useCommandPaletteStore.getState().closePalette();
    useDialogStore.getState().close();
    useMechanismStore.setState({
      importing: false,
      importError: null,
      isDirty: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('preselects the requested joint subtype when entering joint creation', () => {
    const command = findCommand(createCreateCommands(), 'create.joint.prismatic');

    command.execute();

    expect(useToolModeStore.getState().activeMode).toBe('create-joint');
    expect(useJointCreationStore.getState().step).toBe('pick-parent');
    expect(useJointCreationStore.getState().preselectedJointType).toBe('prismatic');
  });

  it('clears stale joint subtype state for generic joint creation', () => {
    useJointCreationStore.setState({
      step: 'idle',
      parentDatumId: null,
      childDatumId: null,
      preselectedJointType: 'fixed',
    });

    const command = findCommand(createCreateCommands(), 'create.joint');
    command.execute();

    expect(useJointCreationStore.getState().preselectedJointType).toBeNull();
    expect(useJointCreationStore.getState().step).toBe('pick-parent');
  });

  it('auto-selects joint type from preselectedJointType in store', () => {
    // With the new select-type step, preselectedJointType is used as the
    // initial selectedJointType when setChildDatum is called.
    const store = useJointCreationStore.getState();
    store.setPreselectedJointType('fixed');
    store.startCreation();
    store.setParentDatum('d1');
    store.setChildDatum('d2', { kind: 'general', recommendedTypes: ['revolute'], distance: 1 });
    // preselectedJointType takes priority over recommendations
    expect(useJointCreationStore.getState().selectedJointType).toBe('fixed');

    store.exitMode();
    store.startCreation();
    store.setParentDatum('d1');
    store.setChildDatum('d2', { kind: 'coaxial', recommendedTypes: ['revolute', 'cylindrical'], distance: 1 });
    // Without preselection, first recommendation is used
    expect(useJointCreationStore.getState().selectedJointType).toBe('revolute');
  });

  it('preselects the requested load subtype when entering load creation', () => {
    const command = findCommand(createCreateCommands(), 'create.force.spring-damper');

    command.execute();

    expect(useToolModeStore.getState().activeMode).toBe('create-load');
    expect(useLoadCreationStore.getState().step).toBe('pick-datum');
    expect(useLoadCreationStore.getState().preselectedLoadType).toBe('spring-damper');
  });

  it('guards dirty state before opening a project', async () => {
    const { confirm, openProjectFile } = stubWindow({ confirmReturn: false });
    useMechanismStore.setState({ isDirty: true });

    const command = findCommand(createFileCommands(), 'file.open');
    await command.execute();

    expect(confirm).toHaveBeenCalledOnce();
    expect(openProjectFile).not.toHaveBeenCalled();
  });

  it('routes file import through the shared import settings flow', async () => {
    const { openFileDialog } = stubWindow({ filePath: '/tmp/assembly.step' });

    const command = findCommand(createFileCommands(), 'file.import-cad');
    await command.execute();

    expect(openFileDialog).toHaveBeenCalledOnce();
    expect(useImportFlowStore.getState().pendingFilePath).toBe('/tmp/assembly.step');
  });

  it('opens the command palette from the registry command', () => {
    const command = findCommand(createHelpCommands(), 'help.command-palette');

    command.execute();

    expect(useCommandPaletteStore.getState().isOpen).toBe(true);
  });

  it('restores simulation settings access through the command registry', () => {
    const command = findCommand(createSimulateCommands(), 'sim.settings');

    command.execute();

    expect(useDialogStore.getState().openDialog).toBe('sim-settings');
  });
});
