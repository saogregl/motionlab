import { PROTOCOL_VERSION } from '@motionlab/protocol';
import type { MissingAssetInfo } from '@motionlab/protocol';
import type { StatusType } from '@motionlab/ui';
import {
  AppShell,
  Button,
  DensityToggle,
  LeftPanel,
  RightPanel,
  StatusBadge,
  StatusBar,
  ThemeToggle,
  Toaster,
  TooltipProvider,
  TopBar,
  useDensity,
  useTheme,
} from '@motionlab/ui';
import { FolderOpen, Import, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { initCommands } from './commands/init.js';
import { executeCommand } from './commands/registry.js';
import { initShortcutManager } from './commands/shortcut-manager.js';
import { AboutDialog } from './components/AboutDialog.js';
import { CommandPalette } from './components/CommandPalette.js';
import { CrashRecoveryDialog } from './components/CrashRecoveryDialog.js';
import { MissingAssetsDialog } from './components/MissingAssetsDialog.js';
import { EntityInspector } from './components/EntityInspector.js';
import { ImportSettingsDialog } from './components/ImportSettingsDialog.js';
import { KeyboardShortcutsDialog } from './components/KeyboardShortcutsDialog.js';
import { ProjectTree } from './components/ProjectTree.js';
import { SimulationSettingsDialog } from './components/SimulationSettingsDialog.js';
import { MainToolbar } from './components/MainToolbar.js';
import { TimelinePanel } from './components/TimelinePanel.js';
import { ViewportOverlay } from './components/ViewportOverlay.js';
import { WelcomeScreen } from './components/WelcomeScreen.js';
import { onMissingAssets, sendAutoSave, sendImportAsset, sendLoadProject } from './engine/connection.js';
import { useDialogStore } from './stores/dialogs.js';
import type { ConnectionStatus } from './stores/engine-connection.js';
import { useEngineConnection } from './stores/engine-connection.js';
import { useImportFlowStore } from './stores/import-flow.js';
import { useMechanismStore } from './stores/mechanism.js';
import { useSimulationStore } from './stores/simulation.js';
import type { RecoverableProject } from './types/motionlab.js';

type StatusBarConnectionState = 'connected' | 'connecting' | 'disconnected' | 'error';

const CONNECTION_TO_BAR: Record<ConnectionStatus, StatusBarConnectionState> = {
  discovering: 'connecting',
  connecting: 'connecting',
  handshaking: 'connecting',
  ready: 'connected',
  error: 'error',
  disconnected: 'disconnected',
};

const CONNECTION_TO_STATUS: Record<ConnectionStatus, StatusType> = {
  discovering: 'stale',
  connecting: 'stale',
  handshaking: 'stale',
  ready: 'compiled',
  error: 'failed',
  disconnected: 'warning',
};

const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  discovering: 'Discovering…',
  connecting: 'Connecting…',
  handshaking: 'Handshaking…',
  ready: 'Engine ready',
  error: 'Engine error',
  disconnected: 'Disconnected',
};

function EngineStatusBadge() {
  const { status, errorMessage } = useEngineConnection();
  const simState = useSimulationStore((s) => s.state);

  // When simulation is running, show running status
  if (status === 'ready' && simState === 'running') {
    return <StatusBadge status="running" label="Simulating" />;
  }
  if (status === 'ready' && simState === 'compiling') {
    return <StatusBadge status="stale" label="Compiling…" />;
  }
  if (status === 'ready' && simState === 'error') {
    return <StatusBadge status="failed" label="Sim error" />;
  }

  const label =
    status === 'error' && errorMessage
      ? `Error: ${errorMessage}`
      : `${CONNECTION_LABELS[status]}  v${PROTOCOL_VERSION}`;

  return <StatusBadge status={CONNECTION_TO_STATUS[status]} label={label} />;
}

function ImportButton() {
  const importing = useMechanismStore((s) => s.importing);
  const isDesktop = !!window.motionlab?.openFileDialog;
  const disabled = !isDesktop || useEngineConnection((s) => s.status !== 'ready') || importing;

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => executeCommand('file.import-cad')}
      title={!isDesktop ? 'Desktop app required' : undefined}
    >
      <Import className="size-3.5 mr-1.5" />
      {importing ? 'Importing…' : 'Import'}
    </Button>
  );
}

function SaveButton() {
  const disabled = useEngineConnection((s) => s.status !== 'ready');

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => executeCommand('file.save')}
      title="Save project (Ctrl+S)"
    >
      <Save className="size-3.5 mr-1.5" />
      Save
    </Button>
  );
}

function OpenButton() {
  const disabled = useEngineConnection((s) => s.status !== 'ready');

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => executeCommand('file.open')}
      title="Open project (Ctrl+O)"
    >
      <FolderOpen className="size-3.5 mr-1.5" />
      Open
    </Button>
  );
}

function TopBarActions() {
  const { theme, toggleTheme } = useTheme();
  const { density, toggleDensity } = useDensity();

  return (
    <>
      <OpenButton />
      <SaveButton />
      <ImportButton />
      <ThemeToggle theme={theme} onToggle={toggleTheme} />
      <DensityToggle density={density} onToggle={toggleDensity} />
    </>
  );
}

function StatusBarContainer() {
  const connStatus = useEngineConnection((s) => s.status);
  const simState = useSimulationStore((s) => s.state);
  const simTime = useSimulationStore((s) => s.simTime);
  const maxSimTime = useSimulationStore((s) => s.maxSimTime);
  const bodies = useMechanismStore((s) => s.bodies);
  const joints = useMechanismStore((s) => s.joints);

  return (
    <StatusBar
      connectionState={CONNECTION_TO_BAR[connStatus]}
      simulationState={simState}
      currentTime={simTime}
      duration={maxSimTime}
      entityCounts={{
        bodies: bodies.size,
        joints: joints.size,
      }}
    />
  );
}

// Initialize command registry before first render
initCommands();

export function App() {
  const connect = useEngineConnection((s) => s.connect);
  const projectName = useMechanismStore((s) => s.projectName);
  const isDirty = useMechanismStore((s) => s.isDirty);
  const openDialog = useDialogStore((s) => s.openDialog);
  const closeDialog = useDialogStore((s) => s.close);
  const openDialogFn = useDialogStore((s) => s.open);

  const [missingAssets, setMissingAssets] = useState<MissingAssetInfo[]>([]);
  const [recoverableProjects, setRecoverableProjects] = useState<RecoverableProject[]>([]);
  const pendingImportFilePath = useImportFlowStore((s) => s.pendingFilePath);
  const closeImportDialog = useImportFlowStore((s) => s.closeImportDialog);
  const setImporting = useMechanismStore((s) => s.setImporting);
  const setImportError = useMechanismStore((s) => s.setImportError);

  // Check for crash recovery autosave files on mount (Epic 20.2)
  useEffect(() => {
    window.motionlab?.checkAutoSaveRecovery?.()
      .then((projects) => {
        if (projects && projects.length > 0) {
          setRecoverableProjects(projects);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    connect();
    // Register dirty check callback for before-quit dialog (desktop only)
    if (typeof window.motionlab?.onCheckDirty === 'function') {
      window.motionlab.onCheckDirty(() => useMechanismStore.getState().isDirty);
    }
    // Register auto-save tick handler (Epic 20.2)
    if (typeof window.motionlab?.onAutoSaveTick === 'function') {
      window.motionlab.onAutoSaveTick(() => {
        const { isDirty, projectName } = useMechanismStore.getState();
        if (!isDirty) return;
        sendAutoSave(projectName);
      });
    }
    // Register file-open handler for file associations / CLI args (Epic 20.2)
    if (typeof window.motionlab?.onOpenFileRequest === 'function') {
      window.motionlab.onOpenFileRequest(async (filePath: string) => {
        const { isDirty } = useMechanismStore.getState();
        if (isDirty) {
          const confirmed = window.confirm('You have unsaved changes. Discard them?');
          if (!confirmed) return;
        }
        const file = await window.motionlab!.readFileByPath!(filePath);
        if (file) sendLoadProject(file.data);
      });
    }
  }, [connect]);

  // Listen for missing assets from project loads
  useEffect(() => {
    onMissingAssets((assets) => {
      setMissingAssets(assets);
      openDialogFn('missing-assets');
    });
    return () => { onMissingAssets(null); };
  }, [openDialogFn]);

  // Sync native window title with project name and dirty state
  useEffect(() => {
    const title = `${projectName}${isDirty ? '*' : ''} — MotionLab`;
    window.motionlab?.setWindowTitle?.(title);
  }, [projectName, isDirty]);

  // Centralized keyboard shortcut manager — reads bindings from command registry
  useEffect(() => initShortcutManager(), []);

  return (
    <TooltipProvider>
      <AppShell
        topBar={
          <TopBar
            projectName={projectName}
            isDirty={isDirty}
            status={<EngineStatusBadge />}
            actions={<TopBarActions />}
          />
        }
        toolbar={<MainToolbar />}
        leftPanel={
          <LeftPanel>
            <ProjectTree />
          </LeftPanel>
        }
        viewport={<ViewportOverlay />}
        rightPanel={
          <RightPanel>
            <EntityInspector />
          </RightPanel>
        }
        bottomDock={<TimelinePanel />}
        statusBar={<StatusBarContainer />}
      />
      <WelcomeScreen />
      <Toaster />
      <CommandPalette />
      <ImportSettingsDialog
        open={!!pendingImportFilePath}
        filePath={pendingImportFilePath ?? ''}
        onConfirm={(options) => {
          if (!pendingImportFilePath) return;
          setImportError(null);
          setImporting(true);
          sendImportAsset(pendingImportFilePath, options);
          closeImportDialog();
        }}
        onCancel={closeImportDialog}
      />
      <SimulationSettingsDialog open={openDialog === 'sim-settings'} onClose={closeDialog} />
      <KeyboardShortcutsDialog open={openDialog === 'shortcuts'} onClose={closeDialog} />
      <AboutDialog open={openDialog === 'about'} onClose={closeDialog} />
      <MissingAssetsDialog
        open={openDialog === 'missing-assets'}
        onClose={closeDialog}
        missingAssets={missingAssets}
      />
      {recoverableProjects.length > 0 && (
        <CrashRecoveryDialog
          recoverableProjects={recoverableProjects}
          onClose={() => setRecoverableProjects([])}
        />
      )}
    </TooltipProvider>
  );
}
