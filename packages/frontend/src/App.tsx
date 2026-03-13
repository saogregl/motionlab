import { PROTOCOL_VERSION } from '@motionlab/protocol';
import { Button } from '@motionlab/ui';
import { Viewport } from '@motionlab/viewport';

export function App() {
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
        }}
      >
        <span style={{ fontWeight: 600 }}>MotionLab</span>
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
