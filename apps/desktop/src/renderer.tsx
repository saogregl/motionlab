import { App } from '@motionlab/frontend';
import { Agentation } from 'agentation';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

const agentationEndpoint = import.meta.env.VITE_AGENTATION_ENDPOINT ?? 'http://localhost:4747';

createRoot(root).render(
  <StrictMode>
    <App />
    {import.meta.env.DEV && <Agentation endpoint={agentationEndpoint} />}
  </StrictMode>,
);
