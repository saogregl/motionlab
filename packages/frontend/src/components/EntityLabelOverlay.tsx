import { useEffect, useRef, useCallback } from 'react';

import type { LabelEntry, SceneGraphManager, ScreenLabel } from '@motionlab/viewport';
import { computeLabelLayout, DOF_TABLE } from '@motionlab/viewport';

import { useSelectionStore } from '../stores/selection.js';
import { useToolModeStore } from '../stores/tool-mode.js';

// ── Constants ──

/** Estimated pill height (px). */
const PILL_H = 20;
/** Extra horizontal padding beyond text width (px). */
const PILL_PAD_X = 16;
/** Minimum leader line length before it collapses (px). */
const MIN_LEADER_LEN = 8;

// ── Types ──

interface LabelDomEntry {
  entityId: string;
  entityType: 'body' | 'joint';
  jointType?: string;
  name: string;
  pill: HTMLDivElement;
  line: SVGLineElement;
  dot: SVGCircleElement;
  measuredWidth: number;
  measuredHeight: number;
}

// ── Component ──

interface EntityLabelOverlayProps {
  sceneGraph: SceneGraphManager | null;
}

export function EntityLabelOverlay({ sceneGraph }: EntityLabelOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pillContainerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const entriesRef = useRef<Map<string, LabelDomEntry>>(new Map());
  const culledBadgeRef = useRef<HTMLDivElement>(null);
  /** Cached measurement div for computing text widths. */
  const measureDivRef = useRef<HTMLDivElement | null>(null);
  /** Cached anchor screen positions from last frame — skip layout if unchanged. */
  const prevAnchorsRef = useRef<string>('');

  const labelsVisible = useToolModeStore((s) => s.labelsVisible);

  // ── Measurement helper ──
  const measureText = useCallback((text: string, isBody: boolean): { w: number; h: number } => {
    if (!measureDivRef.current) {
      const div = document.createElement('div');
      div.style.position = 'absolute';
      div.style.visibility = 'hidden';
      div.style.whiteSpace = 'nowrap';
      div.style.pointerEvents = 'none';
      document.body.appendChild(div);
      measureDivRef.current = div;
    }
    const div = measureDivRef.current;
    div.style.fontSize = '10px';
    div.style.fontWeight = '400';
    div.style.fontFamily = 'var(--font-mono, ui-monospace, monospace)';
    div.textContent = text;
    const rect = div.getBoundingClientRect();
    return { w: rect.width + PILL_PAD_X, h: PILL_H };
  }, []);

  // ── Create / remove DOM elements for a label entry ──
  const createEntry = useCallback(
    (label: LabelEntry, svg: SVGSVGElement, pillContainer: HTMLDivElement): LabelDomEntry => {
      const isBody = label.entityType === 'body';

      // SVG leader line
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('stroke', 'rgba(160,170,190,0.3)');
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-linecap', 'round');
      svg.appendChild(line);

      // SVG anchor dot
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('r', '2.5');
      dot.setAttribute('fill', 'rgba(160,170,190,0.5)');
      svg.appendChild(dot);

      // HTML pill label
      const pill = document.createElement('div');
      pill.style.position = 'absolute';
      pill.style.pointerEvents = 'auto';
      pill.style.cursor = 'pointer';
      pill.style.whiteSpace = 'nowrap';
      pill.style.transform = 'translate(-50%, -50%)';
      pill.style.transition = 'border-color 0.15s, color 0.15s';
      pill.style.display = 'none';

      // Just the text — no dot prefix, matching the JointHoverBadge style
      pill.textContent = label.name;

      // Style: matches `rounded bg-background/80 px-1.5 py-0.5 text-[10px]
      // font-mono text-muted-foreground backdrop-blur-sm` from JointHoverBadge
      Object.assign(pill.style, {
        display: 'none',
        backgroundColor: 'var(--background, rgba(18, 22, 34, 0.80))',
        backdropFilter: 'blur(4px)',
        borderRadius: 'var(--radius, 6px)',
        border: 'none',
        paddingLeft: '6px',
        paddingRight: '6px',
        paddingTop: '2px',
        paddingBottom: '2px',
        fontSize: isBody ? '10px' : '10px',
        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
        fontWeight: '400',
        color: 'var(--muted-foreground, #a0a8b8)',
        lineHeight: '1.4',
        userSelect: 'none',
        opacity: isBody ? '0.80' : '0.80',
      });

      // Hover handlers
      pill.addEventListener('pointerenter', () => {
        useSelectionStore.getState().setHovered(label.entityId);
        sceneGraph?.onLabelHover(label.entityId);
      });
      pill.addEventListener('pointerleave', () => {
        useSelectionStore.getState().setHovered(null);
        sceneGraph?.onLabelHover(null);
      });

      pillContainer.appendChild(pill);

      const measured = measureText(label.name, isBody);

      return {
        entityId: label.entityId,
        entityType: label.entityType,
        jointType: label.jointType,
        name: label.name,
        pill,
        line,
        dot,
        measuredWidth: measured.w,
        measuredHeight: measured.h,
      };
    },
    [sceneGraph, measureText],
  );

  const removeEntry = useCallback((entry: LabelDomEntry) => {
    entry.pill.remove();
    entry.line.remove();
    entry.dot.remove();
  }, []);

  // ── Main effect: lifecycle + RAF loop ──
  useEffect(() => {
    if (!sceneGraph) return;

    const svg = svgRef.current;
    const pillContainer = pillContainerRef.current;
    const container = containerRef.current;
    if (!svg || !pillContainer || !container) return;

    const entries = entriesRef.current;

    // Sync DOM entries with scene graph entities.
    const syncEntries = () => {
      const snapshot = sceneGraph.getLabelSnapshot();
      const currentIds = new Set(snapshot.map((l) => l.entityId));

      // Remove stale entries
      for (const [id, entry] of entries) {
        if (!currentIds.has(id)) {
          removeEntry(entry);
          entries.delete(id);
        }
      }

      // Add new entries, update names
      for (const label of snapshot) {
        const existing = entries.get(label.entityId);
        if (!existing) {
          entries.set(label.entityId, createEntry(label, svg, pillContainer));
        } else if (existing.name !== label.name) {
          // Update text
          existing.name = label.name;
          existing.pill.textContent = label.name;
          const measured = measureText(label.name, label.entityType === 'body');
          existing.measuredWidth = measured.w;
          existing.measuredHeight = measured.h;
        }
      }
    };

    syncEntries();

    const unsubEntityList = sceneGraph.onEntityListChanged(syncEntries);
    const prevOnLabelStateChanged = sceneGraph.onLabelStateChanged;
    sceneGraph.onLabelStateChanged = () => {
      prevOnLabelStateChanged?.();
      // No-op: the RAF loop will pick up state changes from getLabelSnapshot().
    };

    // Cached layout from last frame — only recomputed when anchors move.
    let cachedPlaced = new Map<string, { x: number; y: number; visible: boolean }>();
    let cachedCulledCount = 0;

    // RAF loop
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);

      if (!labelsVisible) {
        for (const entry of entries.values()) {
          entry.pill.style.display = 'none';
          entry.line.setAttribute('visibility', 'hidden');
          entry.dot.setAttribute('visibility', 'hidden');
        }
        if (culledBadgeRef.current) culledBadgeRef.current.style.display = 'none';
        return;
      }

      const snapshot = sceneGraph.getLabelSnapshot();
      const snapshotMap = new Map(snapshot.map((l) => [l.entityId, l]));

      // Project all anchors and build screen labels.
      // Round to whole pixels to avoid sub-pixel jitter from float drift.
      const screenLabels: ScreenLabel[] = [];
      const anchorMap = new Map<string, { x: number; y: number }>();
      const containerRect = container.getBoundingClientRect();
      const vw = containerRect.width;
      const vh = containerRect.height;

      for (const label of snapshot) {
        const entry = entries.get(label.entityId);
        if (!entry) continue;

        const projected = sceneGraph.projectToScreen(label.worldPosition);
        const ax = Math.round(projected.x);
        const ay = Math.round(projected.y);

        // Behind camera or outside viewport
        if (projected.z > 1 || ax < -50 || ay < -50 || ax > vw + 50 || ay > vh + 50) {
          entry.pill.style.display = 'none';
          entry.line.setAttribute('visibility', 'hidden');
          entry.dot.setAttribute('visibility', 'hidden');
          continue;
        }

        anchorMap.set(label.entityId, { x: ax, y: ay });
        screenLabels.push({
          entityId: label.entityId,
          entityType: label.entityType,
          anchorX: ax,
          anchorY: ay,
          width: entry.measuredWidth,
          height: entry.measuredHeight,
          screenRadius: label.screenRadius,
          isSelected: label.isSelected,
          isHovered: label.isHovered,
        });
      }

      // Build a fingerprint of anchor positions + selection state to detect changes.
      // Only rerun layout when positions or selection actually shift.
      const fingerprint = screenLabels
        .map((l) => `${l.entityId}:${l.anchorX},${l.anchorY}:${l.isSelected ? 1 : 0}`)
        .join('|');

      if (fingerprint !== prevAnchorsRef.current) {
        prevAnchorsRef.current = fingerprint;
        const { placed, culledCount } = computeLabelLayout(screenLabels, vw, vh);
        cachedPlaced = new Map(placed.map((p) => [p.entityId, p]));
        cachedCulledCount = culledCount;
      }

      // Apply positions + hover styling (hover styling always updates, layout doesn't).
      for (const entry of entries.values()) {
        const p = cachedPlaced.get(entry.entityId);
        const label = snapshotMap.get(entry.entityId);
        const anchor = anchorMap.get(entry.entityId);

        if (!p || !p.visible || !label || !anchor) {
          entry.pill.style.display = 'none';
          entry.line.setAttribute('visibility', 'hidden');
          entry.dot.setAttribute('visibility', 'hidden');
          continue;
        }

        // Position pill
        entry.pill.style.display = 'flex';
        entry.pill.style.left = `${p.x}px`;
        entry.pill.style.top = `${p.y}px`;

        // Apply hover/selected styling (visual only — never affects layout)
        if (label.isSelected) {
          entry.pill.style.border = '1px solid var(--accent-primary, rgba(15, 98, 254, 0.7))';
          entry.pill.style.color = 'var(--foreground, #ffffff)';
          entry.pill.style.opacity = '1';
          entry.pill.textContent = entry.name;
        } else if (label.isHovered) {
          entry.pill.style.border = 'none';
          entry.pill.style.color = 'var(--foreground, #e0e4ec)';
          entry.pill.style.opacity = '1';
          // Show DOF info on joint hover (replaces JointHoverBadge)
          const dof = entry.jointType ? DOF_TABLE[entry.jointType] : undefined;
          entry.pill.textContent = dof
            ? `${entry.name} \u00b7 ${dof.label}`
            : entry.name;
        } else {
          entry.pill.style.border = 'none';
          entry.pill.style.color = 'var(--muted-foreground, #a0a8b8)';
          entry.pill.style.opacity = '0.80';
          entry.pill.textContent = entry.name;
        }

        // Leader line
        const dx = p.x - anchor.x;
        const dy = p.y - anchor.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > MIN_LEADER_LEN) {
          entry.line.setAttribute('visibility', 'visible');
          entry.line.setAttribute('x1', String(anchor.x));
          entry.line.setAttribute('y1', String(anchor.y));
          entry.line.setAttribute('x2', String(p.x));
          entry.line.setAttribute('y2', String(p.y));

          if (label.isHovered) {
            entry.line.setAttribute('stroke', 'rgba(160,170,190,0.5)');
            entry.line.setAttribute('stroke-width', '1.5');
          } else {
            entry.line.setAttribute('stroke', 'rgba(160,170,190,0.3)');
            entry.line.setAttribute('stroke-width', '1');
          }
        } else {
          entry.line.setAttribute('visibility', 'hidden');
        }

        // Anchor dot
        entry.dot.setAttribute('visibility', 'visible');
        entry.dot.setAttribute('cx', String(anchor.x));
        entry.dot.setAttribute('cy', String(anchor.y));
      }

      // Culled badge
      if (culledBadgeRef.current) {
        if (cachedCulledCount > 0) {
          culledBadgeRef.current.style.display = 'flex';
          culledBadgeRef.current.textContent = `+${cachedCulledCount} more`;
        } else {
          culledBadgeRef.current.style.display = 'none';
        }
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      sceneGraph.onLabelStateChanged = prevOnLabelStateChanged;

      // Clean up DOM entries
      for (const entry of entries.values()) {
        removeEntry(entry);
      }
      entries.clear();

      // Clean up measurement div
      if (measureDivRef.current) {
        measureDivRef.current.remove();
        measureDivRef.current = null;
      }
    };
  }, [sceneGraph, labelsVisible, createEntry, removeEntry, measureText]);

  if (!sceneGraph) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 15 }}
    >
      <svg
        ref={svgRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
      <div ref={pillContainerRef} className="absolute inset-0 pointer-events-none" />
      <div
        ref={culledBadgeRef}
        className="absolute pointer-events-none"
        style={{
          display: 'none',
          bottom: '48px',
          right: '12px',
          alignItems: 'center',
          backgroundColor: 'rgba(18, 22, 34, 0.75)',
          backdropFilter: 'blur(4px)',
          borderRadius: '9999px',
          border: '1px solid rgba(160, 170, 190, 0.2)',
          padding: '2px 10px',
          fontSize: '10px',
          color: '#a0a8b8',
        }}
      />
    </div>
  );
}
