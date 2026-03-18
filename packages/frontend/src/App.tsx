import { PROTOCOL_VERSION } from '@motionlab/protocol';
import { AppShell, Button, LeftPanel, RightPanel, TopBar } from '@motionlab/ui';
import { Import } from 'lucide-react';
import { useEffect } from 'react';
import { EntityInspector } from './components/EntityInspector.js';
import { ProjectTree } from './components/ProjectTree.js';
import { ViewportOverlay } from './components/ViewportOverlay.js';
import { sendImportAsset } from './engine/connection.js';
import type { ConnectionStatus } from './stores/engine-connection.js';
import { useEngineConnection } from './stores/engine-connection.js';
import { useMechanismStore } from './stores/mechanism.js';

const STATUS_CONFIG: Record<ConnectionStatus, { label: string; color: string }> = {
  discovering: { label: 'Discovering…', color: 'var(--color-muted-foreground)' },
  connecting: { label: 'Connecting…', color: 'var(--color-muted-foreground)' },
  handshaking: { label: 'Handshaking…', color: 'var(--color-muted-foreground)' },
  ready: { label: 'Engine ready', color: 'var(--color-success)' },
  error: { label: 'Engine error', color: 'var(--color-destructive)' },
  disconnected: { label: 'Disconnected', color: 'var(--color-warning)' },
};

function StatusIndicator() {
  const { status, errorMessage } = useEngineConnection();
  const config = STATUS_CONFIG[status];
  const label =
    status === 'error' && errorMessage ? `Error: ${errorMessage}` : config.label;

  return (
    <span className="flex items-center gap-1.5 text-2xs">
      <span
        className="inline-block size-2 rounded-full"
        style={{ backgroundColor: config.color }}
      />
      <span style={{ color: config.color }}>{label}</span>
      <span className="ml-2 opacity-50">v{PROTOCOL_VERSION}</span>
    </span>
  );
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

export function App() {
  const connect = useEngineConnection((s) => s.connect);

  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <AppShell
      topBar={
        <TopBar
          projectName="MotionLab"
          status={<StatusIndicator />}
          actions={<ImportButton />}
        />
      }
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
    />
  );
}
