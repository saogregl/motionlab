import { create } from 'zustand';
import { connect as connectWs, disconnect as disconnectWs } from '../engine/connection.js';
import type { MotionLabEndpoint } from '../types/motionlab.js';

export type ConnectionStatus =
  | 'discovering'
  | 'connecting'
  | 'handshaking'
  | 'ready'
  | 'error'
  | 'disconnected';

export interface EngineConnectionState {
  status: ConnectionStatus;
  endpoint?: MotionLabEndpoint;
  engineVersion?: string;
  engineStatus?: string;
  errorMessage?: string;
  connect: () => void;
  disconnect: () => void;
}

export const useEngineConnection = create<EngineConnectionState>()((set, get) => ({
  status: 'disconnected',
  connect: () => connectWs(set, get),
  disconnect: () => disconnectWs(set),
}));
