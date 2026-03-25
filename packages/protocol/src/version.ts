/**
 * Protocol version — incremented on breaking changes.
 * Used for engine ↔ frontend compatibility checks.
 */
export const PROTOCOL_VERSION = 5;

export const PROTOCOL_NAME = 'motionlab';

export interface ProtocolHandshake {
  name: typeof PROTOCOL_NAME;
  version: number;
}

export function createHandshake(): ProtocolHandshake {
  return { name: PROTOCOL_NAME, version: PROTOCOL_VERSION };
}

export function isCompatible(remote: ProtocolHandshake): boolean {
  return remote.name === PROTOCOL_NAME && remote.version === PROTOCOL_VERSION;
}
