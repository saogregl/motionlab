import { PROTOCOL_VERSION } from '@motionlab/protocol';
import { Button } from '@motionlab/ui';
import { Viewport } from '@motionlab/viewport';
import { useEffect } from 'react';
import type { ConnectionStatus } from './stores/engine-connection.js';
import { useEngineConnection } from './stores/engine-connection.js';

const STATUS_CONFIG: Record<ConnectionStatus, { label: string; color: string }> = {
  discovering: { label: 'Discovering engine...', color: '#6c7086' },
  connecting: { label: 'Connecting...', color: '#6c7086' },
  handshaking: { label: 'Handshaking...', color: '#6c7086' },
  ready: { label: 'Engine ready', color: '#a6e3a1' },
  error: { label: 'Engine error', color: '#f38ba8' },
  disconnected: { label: 'Disconnected', color: '#fab387' },
};

export function App() {
  const { status, errorMessage, connect } = useEngineConnection();

  useEffect(() => {
    connect();
  }, [connect]);

  const config = STATUS_CONFIG[status];
  const label = status === 'error' && errorMessage ? `Engine error: ${errorMessage}` : config.label;

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          height: 40,
          background: '#1e1e2e',
          color: '#cdd6f4',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          fontSize: 13,
          fontFamily: 'system-ui, sans-serif',
          borderBottom: '1px solid #313244',
          gap: 12,
        }}
      >
        <span style={{ fontWeight: 600 }}>MotionLab</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: config.color,
              display: 'inline-block',
            }}
          />
          <span style={{ fontSize: 11, color: config.color }}>{label}</span>
        </span>
        <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>
          protocol v{PROTOCOL_VERSION}
        </span>
      </header>
      <main style={{ flex: 1, background: '#181825', padding: '16px' }}>
        <Button>Test Button</Button>
        <Viewport />
      </main>
    </div>
  );
}
