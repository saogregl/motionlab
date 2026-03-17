import { create, fromBinary, toBinary, toJsonString } from '@bufbuild/protobuf';
import type { Event } from './generated/protocol/transport_pb.js';
import {
  CommandSchema,
  EngineStatus_State,
  EventSchema,
  HandshakeSchema,
  ImportAssetCommandSchema,
  ImportOptionsSchema,
  PingSchema,
  ProtocolVersionSchema,
} from './generated/protocol/transport_pb.js';
import { PROTOCOL_NAME, PROTOCOL_VERSION } from './version.js';

/**
 * Creates a binary-encoded Command envelope containing a Handshake payload.
 */
export function createHandshakeCommand(sessionToken: string, sequenceId = 0n): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId,
    payload: {
      case: 'handshake',
      value: create(HandshakeSchema, {
        protocol: create(ProtocolVersionSchema, {
          name: PROTOCOL_NAME,
          version: PROTOCOL_VERSION,
        }),
        sessionToken,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing a Ping payload.
 */
export function createPingCommand(sequenceId: bigint): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId,
    payload: {
      case: 'ping',
      value: create(PingSchema, {
        timestamp: BigInt(Date.now()),
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Creates a binary-encoded Command envelope containing an ImportAsset payload.
 */
export function createImportAssetCommand(
  filePath: string,
  options?: { densityOverride?: number; tessellationQuality?: number; unitSystem?: string },
  sequenceId?: bigint,
): Uint8Array {
  const cmd = create(CommandSchema, {
    sequenceId: sequenceId ?? 0n,
    payload: {
      case: 'importAsset',
      value: create(ImportAssetCommandSchema, {
        filePath,
        importOptions: options
          ? create(ImportOptionsSchema, {
              densityOverride: options.densityOverride ?? 0,
              tessellationQuality: options.tessellationQuality ?? 0,
              unitSystem: options.unitSystem ?? '',
            })
          : undefined,
      }),
    },
  });
  return toBinary(CommandSchema, cmd);
}

/**
 * Parses a binary Event envelope from an ArrayBuffer.
 */
export function parseEvent(data: ArrayBuffer): Event {
  return fromBinary(EventSchema, new Uint8Array(data));
}

/**
 * Returns a JSON string representation of an Event for debug logging.
 */
export function eventToDebugJson(evt: Event): string {
  return toJsonString(EventSchema, evt);
}

/**
 * Maps a proto EngineStatus.State enum value to a store-friendly string.
 */
export function engineStateToString(state: EngineStatus_State): string {
  switch (state) {
    case EngineStatus_State.READY:
      return 'ready';
    case EngineStatus_State.INITIALIZING:
      return 'initializing';
    case EngineStatus_State.BUSY:
      return 'busy';
    case EngineStatus_State.ERROR:
      return 'error';
    case EngineStatus_State.SHUTTING_DOWN:
      return 'shutting_down';
    default:
      return 'unknown';
  }
}
