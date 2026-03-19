import { PROTOCOL_VERSION } from '@motionlab/protocol';
import type { StatusType } from '@motionlab/ui';
import {
  AppShell,
  Button,
  DensityToggle,
  LeftPanel,
  RightPanel,
  StatusBadge,
  ThemeToggle,
  TooltipProvider,
  TopBar,
  useDensity,
  useTheme,
} from '@motionlab/ui';
import { FolderOpen, Import, Save } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { CommandPalette } from './components/CommandPalette.js';
import { EntityInspector } from './components/EntityInspector.js';
import { ProjectTree } from './components/ProjectTree.js';
import { SimulationToolbar } from './components/SimulationToolbar.js';
import { TimelinePanel } from './components/TimelinePanel.js';
import { ViewportOverlay } from './components/ViewportOverlay.js';
import { sendImportAsset, sendLoadProject, sendSaveProject } from './engine/connection.js';
import type { ConnectionStatus } from './stores/engine-connection.js';
import { useEngineConnection } from './stores/engine-connection.js';
import { useMechanismStore } from './stores/mechanism.js';
import { useSimulationStore } from './stores/simulation.js';
import { useUILayoutStore } from './stores/ui-layout.js';

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
  const status = useEngineConnection((s) => s.status);
  const importing = useMechanismStore((s) => s.importing);
  const setImporting = useMechanismStore((s) => s.setImporting);
  const setImportError = useMechanismStore((s) => s.setImportError);

  const isDesktop = !!window.motionlab?.openFileDialog;
  const disabled = !isDesktop || status !== 'ready' || importing;

  const handleClick = async () => {
    if (!window.motionlab) return;
    try {
      const filePath = await window.motionlab.openFileDialog({
        filters: [
          { name: 'CAD Files', extensions: ['step', 'stp', 'iges', 'igs'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (!filePath) return;
      setImportError(null);
      setImporting(true);
      sendImportAsset(filePath);
    } catch {
      setImportError('Failed to open file dialog');
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={handleClick}
      title={!isDesktop ? 'Desktop app required' : undefined}
    >
      <Import className="size-3.5 mr-1.5" />
      {importing ? 'Importing…' : 'Import'}
    </Button>
  );
}

function SaveButton() {
  const status = useEngineConnection((s) => s.status);
  const projectName = useMechanismStore((s) => s.projectName);
  const disabled = status !== 'ready';

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => sendSaveProject(projectName)}
      title="Save project (Ctrl+S)"
    >
      <Save className="size-3.5 mr-1.5" />
      Save
    </Button>
  );
}

function OpenButton() {
  const status = useEngineConnection((s) => s.status);
  const disabled = status !== 'ready';

  const handleClick = async () => {
    if (!window.motionlab) return;
    try {
      const result = await window.motionlab.openProjectFile();
      if (!result) return;
      sendLoadProject(result.data);
    } catch {
      console.error('Failed to open project file');
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={handleClick}
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

export function App() {
  const connect = useEngineConnection((s) => s.connect);
  const projectName = useMechanismStore((s) => s.projectName);

  useEffect(() => {
    connect();
  }, [connect]);

  const handleSave = useCallback(() => {
    const status = useEngineConnection.getState().status;
    if (status !== 'ready') return;
    sendSaveProject(useMechanismStore.getState().projectName);
  }, []);

  const handleOpen = useCallback(async () => {
    const status = useEngineConnection.getState().status;
    if (status !== 'ready' || !window.motionlab) return;
    const result = await window.motionlab.openProjectFile();
    if (!result) return;
    sendLoadProject(result.data);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        handleOpen();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        useUILayoutStore.getState().toggleChartPanel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave, handleOpen]);

  return (
    <TooltipProvider>
      <AppShell
        topBar={
          <TopBar
            projectName={projectName}
            status={<EngineStatusBadge />}
            actions={<TopBarActions />}
          />
        }
        toolbar={<SimulationToolbar />}
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
      />
      <CommandPalette />
    </TooltipProvider>
  );
}
