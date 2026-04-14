import { getBodyPoseCount } from '../stores/body-poses.js';
import { useDialogStore } from '../stores/dialogs.js';
import { useEngineConnection } from '../stores/engine-connection.js';
import { useImportFlowStore } from '../stores/import-flow.js';
import { useMechanismStore } from '../stores/mechanism.js';
import { useSelectionStore } from '../stores/selection.js';
import type { ChannelDescriptor } from '../stores/simulation.js';
import { useSimulationStore } from '../stores/simulation.js';
import { useTraceStore } from '../stores/traces.js';
import { useUILayoutStore } from '../stores/ui-layout.js';
import { DebugRecorder } from './recorder.js';
import type {
  DebugBundleResult,
  DebugEvent,
  DebugSessionInfo,
  DebugSnapshot,
  MotionLabDebugAPI,
} from './types.js';

const eventListeners = new Set<(event: DebugEvent) => void>();
const recorder = new DebugRecorder({
  appendProtocolEntry: (entry) =>
    window.motionlab?.appendDebugProtocolEntry?.(entry as unknown as Record<string, unknown>),
  appendConsoleEntry: (entry) =>
    window.motionlab?.appendDebugConsoleEntry?.(entry as unknown as Record<string, unknown>),
  appendAnomaly: (anomaly) =>
    window.motionlab?.appendDebugAnomaly?.(anomaly as unknown as Record<string, unknown>),
});

let installed = false;
let consolePatched = false;
let lastSelectionSignature = '';
let lastAutoExportAt = 0;

function emit(event: DebugEvent): void {
  for (const listener of eventListeners) {
    try {
      listener(event);
    } catch {
      // Debug listeners must not affect app behavior.
    }
  }
}

function isEnabled(): boolean {
  return (
    typeof window.motionlab?.getDebugSessionInfo === 'function' &&
    typeof window.motionlab?.exportDebugBundle === 'function'
  );
}

async function getSessionInfo(): Promise<DebugSessionInfo | null> {
  if (!isEnabled()) return null;
  try {
    return await window.motionlab!.getDebugSessionInfo!();
  } catch {
    return null;
  }
}

function summarizeChannel(
  descriptor: ChannelDescriptor,
  samples: Array<{ time: number; value: number; vec?: { x: number; y: number; z: number } }>,
) {
  const last = samples.at(-1);
  return {
    channelId: descriptor.channelId,
    name: descriptor.name,
    dataType: descriptor.dataType,
    unit: descriptor.unit,
    sampleCount: samples.length,
    latestSample: last
      ? {
          time: last.time,
          value: last.vec ?? last.value,
        }
      : null,
  };
}

function serializeMechanismStore() {
  const state = useMechanismStore.getState();
  return {
    counts: {
      bodies: state.bodies.size,
      geometries: state.geometries.size,
      datums: state.datums.size,
      joints: state.joints.size,
      loads: state.loads.size,
      actuators: state.actuators.size,
    },
    bodies: [...state.bodies.values()].map((body) => ({
      ...body,
    })),
    geometries: [...state.geometries.values()].map((geometry) => ({
      id: geometry.id,
      name: geometry.name,
      parentBodyId: geometry.parentBodyId,
      localPose: geometry.localPose,
      vertexCount: geometry.meshData.vertices.length / 3,
      triangleCount: geometry.meshData.indices.length / 3,
      normalCount: geometry.meshData.normals.length / 3,
      partIndexCount: geometry.partIndex?.length ?? 0,
      computedMassProperties: geometry.computedMassProperties,
      sourceAssetRef: geometry.sourceAssetRef,
      primitiveSource: geometry.primitiveSource ?? null,
      collisionConfig: geometry.collisionConfig ?? null,
    })),
    datums: [...state.datums.values()],
    joints: [...state.joints.values()],
    loads: [...state.loads.values()],
    actuators: [...state.actuators.values()],
    importing: state.importing,
    importError: state.importError,
    pendingRenameEntityId: state.pendingRenameEntityId,
  };
}

function serializeSelectionStore() {
  const state = useSelectionStore.getState();
  return {
    selectedIds: [...state.selectedIds],
    hoveredId: state.hoveredId,
    lastSelectedId: state.lastSelectedId,
    selectionFilter: state.selectionFilter ? [...state.selectionFilter] : null,
  };
}

function serializeSimulationStore() {
  const state = useSimulationStore.getState();
  return {
    state: state.state,
    simTime: state.simTime,
    stepCount: state.stepCount,
    maxSimTime: state.maxSimTime,
    loopEnabled: state.loopEnabled,
    errorMessage: state.errorMessage,
    compilationDiagnostics: [...state.compilationDiagnostics],
    structuredDiagnostics: [...state.structuredDiagnostics],
    channelDescriptors: [...state.channelDescriptors],
    needsCompile: state.needsCompile,
  };
}

function serializeUILayoutStore() {
  const state = useUILayoutStore.getState();
  return {
    activeWorkspace: state.activeWorkspace,
    bottomPanelExpanded: state.bottomPanelExpanded,
    bottomPanelActiveTab: state.bottomPanelActiveTab,
    leftPanelOpen: state.leftPanelOpen,
    rightPanelOpen: state.rightPanelOpen,
    rightPanelAutoShow: state.rightPanelAutoShow,
    leftPanelWidth: state.leftPanelWidth,
    rightPanelWidth: state.rightPanelWidth,
    resultsLeftPanelOpen: state.resultsLeftPanelOpen,
    resultsLeftPanelWidth: state.resultsLeftPanelWidth,
    resultsBottomDockExpanded: state.resultsBottomDockExpanded,
    resultsBottomDockActiveTab: state.resultsBottomDockActiveTab,
    importMode: state.importMode,
  };
}

function serializeTraceRuntime() {
  const state = useTraceStore.getState();
  const summaries = [...state.channels.values()].map((descriptor) =>
    summarizeChannel(descriptor, state.traces.get(descriptor.channelId) ?? []),
  );
  return {
    bodyPoseCount: getBodyPoseCount(),
    traceChannelCount: state.channels.size,
    activeChannelCount: state.activeChannels.size,
    traceSummaries: summaries,
  };
}

function checkSelectionInvariant(): void {
  if (!isEnabled()) return;
  const mechanism = useMechanismStore.getState();
  const selection = useSelectionStore.getState();
  const validIds = new Set<string>([
    ...mechanism.bodies.keys(),
    ...mechanism.geometries.keys(),
    ...mechanism.datums.keys(),
    ...mechanism.joints.keys(),
    ...mechanism.loads.keys(),
    ...mechanism.actuators.keys(),
  ]);
  const invalidSelectedIds = [...selection.selectedIds].filter((id) => !validIds.has(id));
  const hoveredMissing =
    selection.hoveredId && !validIds.has(selection.hoveredId) ? selection.hoveredId : null;
  const signature = `${invalidSelectedIds.sort().join(',')}|${hoveredMissing ?? ''}`;
  if (!signature || signature === '|') {
    lastSelectionSignature = '';
    return;
  }
  if (signature === lastSelectionSignature) return;
  lastSelectionSignature = signature;
  recorder.recordAnomaly({
    severity: 'warning',
    code: 'selection-invalid-reference',
    message: 'Selection references missing entities',
    details: {
      invalidSelectedIds,
      hoveredMissing,
    },
  });
}

async function buildSnapshot(): Promise<DebugSnapshot> {
  const mechanism = useMechanismStore.getState();
  const connection = useEngineConnection.getState();
  return {
    capturedAt: new Date().toISOString(),
    session: await getSessionInfo(),
    project: {
      hasActiveProject: mechanism.hasActiveProject,
      projectName: mechanism.projectName,
      projectFilePath: mechanism.projectFilePath,
      isDirty: mechanism.isDirty,
    },
    connection: {
      status: connection.status,
      engineVersion: connection.engineVersion,
      engineStatus: connection.engineStatus,
      errorMessage: connection.errorMessage,
      endpoint: connection.endpoint,
    },
    stores: {
      mechanism: serializeMechanismStore(),
      selection: serializeSelectionStore(),
      simulation: serializeSimulationStore(),
      dialogs: { openDialog: useDialogStore.getState().openDialog },
      importFlow: {
        pendingFilePath: useImportFlowStore.getState().pendingFilePath,
        pendingImportOptions: useImportFlowStore.getState().pendingImportOptions,
      },
      uiLayout: serializeUILayoutStore(),
    },
    runtime: serializeTraceRuntime(),
    protocol: {
      recentEntries: recorder.getRecentEntries(),
      recentStreamEntries: recorder.getRecentStreamEntries(),
      pendingCommands: recorder.getPendingCommands(),
    },
    console: recorder.getConsoleEntries(),
    anomalies: recorder.getAnomalies(),
  };
}

async function exportBundle(reason?: string): Promise<DebugBundleResult> {
  if (!isEnabled()) {
    throw new Error('Debug mode is not enabled');
  }
  const result = await window.motionlab!.exportDebugBundle!({
    reason,
    snapshot: await buildSnapshot(),
  });
  emit({ type: 'bundle-exported', bundlePath: result.bundlePath, reason });
  return result;
}

function maybeAutoExport(code: string): void {
  const now = Date.now();
  if (now - lastAutoExportAt < 30_000) return;
  lastAutoExportAt = now;
  void exportBundle(`auto:${code}`).catch(() => {
    // Auto-export is best effort only.
  });
}

function installConsolePatch(): void {
  if (consolePatched || !isEnabled()) return;
  consolePatched = true;
  for (const level of ['debug', 'info', 'warn', 'error', 'log'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      recorder.recordConsole(level, args);
      original(...args);
    };
  }
}

export function installDebugApi(): void {
  if (installed) return;
  installed = true;
  recorder.setEnabled(isEnabled());

  window.motionlabDebug = {
    isEnabled,
    getSessionInfo,
    getSnapshot: buildSnapshot,
    exportBundle,
    onDebugEvent(callback) {
      eventListeners.add(callback);
      return () => {
        eventListeners.delete(callback);
      };
    },
  };

  recorder.onEvent((event) => {
    emit(event);
    if (event.type === 'anomaly' && event.anomaly.severity === 'error') {
      maybeAutoExport(event.anomaly.code);
    }
  });

  if (!isEnabled()) return;

  installConsolePatch();
  useSelectionStore.subscribe(checkSelectionInvariant);
  useMechanismStore.subscribe(checkSelectionInvariant);
  window.motionlab?.onDebugEvent?.((event) => {
    emit({ type: 'host', event });
  });
}

export function getDebugRecorder(): DebugRecorder {
  return recorder;
}
