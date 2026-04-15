import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Box,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Clock,
  Command,
  Crosshair,
  FolderOpen,
  Gauge,
  GitBranch,
  Layers,
  LineChart,
  Menu,
  Minus,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Settings,
  Share2,
  SkipForward,
  Square,
  StepForward,
  Triangle,
  Undo2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { cn } from '../../lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { TooltipProvider } from '../ui/tooltip';

/* ─────────────────────────────────────────────────────────────────────────────
 * Titlebar Design Proposals — MotionLab
 *
 * Each story renders a candidate titlebar above a mock app frame so proposals
 * can be compared as finished products. The mock frame includes a richer
 * viewport backdrop and contextual details to ground each titlebar in the
 * product context of a mechanism simulation workbench.
 *
 * Reference applications studied:
 * - Ansys Discovery / Mechanical — tabbed toolbar ribbon
 * - Siemens NX — ribbon + contextual quick access toolbar
 * - Unity — clean layered top bar with play/pause transport
 * - Blender — workspace tabs in the top bar itself
 * - OnShape — cloud-native breadcrumb + version bar
 * - SolidWorks — CommandManager + FeatureManager integration
 * ──────────────────────────────────────────────────────────────────────────── */

/* ── Shared mock frame ─────────────────────────────────────────────────────── */

function MockFrame({ topBar, secondaryBar }: { topBar: ReactNode; secondaryBar?: ReactNode }) {
  return (
    <div className="flex h-screen w-screen flex-col bg-bg-app text-text-primary">
      {topBar}
      {secondaryBar}

      {/* Main row */}
      <div className="flex min-h-0 flex-1">
        {/* Left rail (icon strip) */}
        <div className="flex w-10 shrink-0 flex-col items-center gap-1.5 border-e border-border-default bg-layer-recessed py-2">
          <MockRailIcon icon={<Box className="size-3.5" />} active />
          <MockRailIcon icon={<Crosshair className="size-3.5" />} />
          <MockRailIcon icon={<Layers className="size-3.5" />} />
          <MockRailIcon icon={<Gauge className="size-3.5" />} />
          <div className="flex-1" />
          <MockRailIcon icon={<Settings className="size-3.5" />} />
        </div>

        {/* Left panel */}
        <div className="flex w-[260px] shrink-0 flex-col border-e border-border-default bg-layer-base">
          <div className="flex h-8 items-center border-b border-border-default px-3 text-[length:var(--text-xs)] font-medium text-text-secondary">
            Model Tree
          </div>
          <div className="flex-1 p-1">
            {['Housing', 'Crankshaft', 'Connecting Rod', 'Piston', 'Flywheel'].map((name) => (
              <div
                key={name}
                className="flex h-[var(--tree-row-h)] items-center gap-2 rounded-[var(--radius-sm)] px-2 text-[length:var(--text-sm)] text-text-secondary hover:bg-layer-base-hover"
              >
                <Box className="size-3.5 text-text-tertiary" />
                {name}
              </div>
            ))}
          </div>
        </div>

        {/* Viewport area */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex-1 bg-bg-viewport">
            {/* Viewport grid effect */}
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  'linear-gradient(var(--text-primary) 1px, transparent 1px), linear-gradient(90deg, var(--text-primary) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[length:var(--text-lg)] text-text-tertiary">3D Viewport</span>
            </div>
          </div>
          {/* Bottom panel */}
          <div className="h-[160px] shrink-0 border-t border-border-default bg-layer-base">
            <div className="flex h-7 items-center gap-2 border-b border-border-default px-2">
              <span className="text-[length:var(--text-xs)] font-medium text-text-primary">
                Timeline
              </span>
              <span className="text-[length:var(--text-xs)] text-text-tertiary">Charts</span>
              <span className="text-[length:var(--text-xs)] text-text-tertiary">Log</span>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex w-[280px] shrink-0 flex-col border-s border-border-default bg-layer-base">
          <div className="flex h-8 items-center border-b border-border-default px-3 text-[length:var(--text-xs)] font-medium text-text-secondary">
            Inspector
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex h-6 shrink-0 items-center justify-between border-t border-border-default bg-layer-recessed px-3 text-[length:var(--text-2xs)] text-text-tertiary">
        <span>Ready</span>
        <div className="flex items-center gap-3">
          <span>0 selected</span>
          <span>60 fps</span>
          <span>v0.1.0</span>
        </div>
      </div>
    </div>
  );
}

function MockRailIcon({ icon, active = false }: { icon: ReactNode; active?: boolean }) {
  return (
    <div
      className={cn(
        'flex size-7 items-center justify-center rounded-[var(--radius-sm)] transition-colors',
        active
          ? 'bg-accent-soft text-accent-text'
          : 'text-text-tertiary hover:bg-layer-recessed-hover hover:text-text-secondary',
      )}
    >
      {icon}
    </div>
  );
}

/* ── Shared bits ───────────────────────────────────────────────────────────── */

function WindowControls() {
  const btn =
    'inline-flex items-center justify-center h-full w-[46px] text-text-secondary transition-colors hover:bg-layer-hover';
  return (
    <div className="ml-1 flex h-full">
      <button type="button" className={btn} aria-label="Minimize">
        <Minus className="size-4" />
      </button>
      <button type="button" className={btn} aria-label="Maximize">
        <Square className="size-3.5" />
      </button>
      <button
        type="button"
        className={cn(btn, 'hover:bg-[#e81123] hover:text-white')}
        aria-label="Close"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function Logo({ size = 16, variant = 'solid' }: { size?: number; variant?: 'solid' | 'outline' }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-[var(--radius-sm)]',
        variant === 'solid'
          ? 'bg-accent-primary text-text-inverse'
          : 'border border-accent-primary text-accent-primary',
      )}
      style={{ width: size + 6, height: size + 6 }}
    >
      <Triangle className="size-3 fill-current" strokeWidth={0} />
    </div>
  );
}

function MockMenuItems() {
  return (
    <>
      <DropdownMenuItem>
        New Project
        <DropdownMenuShortcut>Ctrl+N</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem>
        Open…
        <DropdownMenuShortcut>Ctrl+O</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>Open Recent</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem>Brake Caliper</DropdownMenuItem>
          <DropdownMenuItem>4-Bar Linkage</DropdownMenuItem>
          <DropdownMenuItem>Quadcopter Arm</DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem>
        Save
        <DropdownMenuShortcut>Ctrl+S</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem>Save As…</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem>Import…</DropdownMenuItem>
      <DropdownMenuItem>Export…</DropdownMenuItem>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Proposal A — "NX Quick Access"
 *
 * Inspired by Siemens NX. Two-row titlebar:
 * Row 1 (thin): App logo + file breadcrumb + window controls
 * Row 2 (toolbar): Quick Access Toolbar (undo/redo/save) + workspace mode
 *   tabs (Model / Simulate / Results) centered + transport play/pause right.
 *
 * WHY: Separates *window chrome* from *authoring controls*. The QAT gives
 * muscle-memory shortcuts immediate access. Workspace tabs make mode
 * switching a top-level affordance, which maps well to MotionLab's
 * Model → Simulate → Results workflow.
 * ──────────────────────────────────────────────────────────────────────────── */

function NXQuickAccessTitlebar() {
  return (
    <>
      {/* Row 1: window chrome */}
      <div className="flex h-[30px] shrink-0 items-center bg-layer-recessed ps-2 pe-0">
        <div className="flex items-center gap-1.5 text-[length:var(--text-xs)]">
          <Logo size={12} />
          <span className="font-medium text-text-primary">MotionLab</span>
          <ChevronRight className="size-3 text-text-disabled" />
          <span className="text-text-tertiary">Projects</span>
          <ChevronRight className="size-3 text-text-disabled" />
          <span className="text-text-secondary">Brake Caliper</span>
          <span className="ml-0.5 rounded-[2px] bg-warning-soft px-1 py-px text-[length:var(--text-3xs)] font-medium text-text-secondary">
            modified
          </span>
        </div>
        <div className="flex-1" />
        <WindowControls />
      </div>

      {/* Row 2: Quick Access Toolbar + workspace tabs */}
      <div className="flex h-[34px] shrink-0 items-center border-b border-border-default bg-layer-base ps-2 pe-2">
        {/* QAT cluster */}
        <div className="flex items-center gap-0.5 pe-3">
          <QATButton icon={<Undo2 />} label="Undo" />
          <QATButton icon={<Redo2 />} label="Redo" />
          <div className="mx-1 h-4 w-px bg-border-default" />
          <QATButton icon={<Save />} label="Save" />
          <QATButton icon={<FolderOpen />} label="Open" />
        </div>

        {/* Workspace tabs (centered) */}
        <div className="flex flex-1 justify-center">
          <div className="flex items-center rounded-[var(--radius-md)] bg-layer-recessed p-0.5">
            <WorkspacePill label="Model" icon={<Box className="size-3" />} active />
            <WorkspacePill label="Simulate" icon={<Zap className="size-3" />} />
            <WorkspacePill label="Results" icon={<LineChart className="size-3" />} />
          </div>
        </div>

        {/* Transport cluster */}
        <div className="flex items-center gap-0.5">
          <StatusPill status="compiled" />
          <div className="mx-1 h-4 w-px bg-border-default" />
          <TransportButton icon={<SkipForward className="size-3.5 rotate-180" />} label="Reset" />
          <TransportButton icon={<Play className="size-3.5 fill-current" />} label="Play" accent />
          <TransportButton icon={<StepForward className="size-3.5" />} label="Step" />
        </div>
      </div>
    </>
  );
}

function QATButton({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      className="inline-flex size-7 items-center justify-center rounded-[var(--radius-sm)] text-text-secondary transition-colors hover:bg-layer-base-hover hover:text-text-primary [&>svg]:size-3.5"
      aria-label={label}
    >
      {icon}
    </button>
  );
}

function WorkspacePill({
  label,
  icon,
  active = false,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-[26px] items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-[length:var(--text-xs)] font-medium transition-all',
        active
          ? 'bg-layer-base text-text-primary shadow-[var(--shadow-low)]'
          : 'text-text-tertiary hover:text-text-secondary',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function StatusPill({ status }: { status: 'compiled' | 'stale' | 'running' | 'failed' }) {
  const config = {
    compiled: { color: 'text-success', bg: 'bg-success-soft', label: 'Compiled' },
    stale: { color: 'text-warning', bg: 'bg-warning-soft', label: 'Stale' },
    running: { color: 'text-accent-text', bg: 'bg-accent-soft', label: 'Running' },
    failed: { color: 'text-danger', bg: 'bg-danger-soft', label: 'Failed' },
  }[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--text-2xs)] font-medium',
        config.bg,
        config.color,
      )}
    >
      <Circle className="size-1.5 fill-current" strokeWidth={0} />
      {config.label}
    </span>
  );
}

function TransportButton({
  icon,
  label,
  accent = false,
}: {
  icon: ReactNode;
  label: string;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-[var(--radius-sm)] transition-colors',
        accent
          ? 'bg-accent-primary text-text-inverse hover:bg-accent-hover'
          : 'text-text-secondary hover:bg-layer-base-hover hover:text-text-primary',
      )}
      aria-label={label}
    >
      {icon}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Proposal B — "Unity Transport Bar"
 *
 * Inspired by Unity's clean separation. Single-row titlebar with three
 * distinct zones:
 *   Left:   App menu (hamburger) + project name + dirty state
 *   Center: Play / Pause / Step transport controls (the hero element)
 *   Right:  Version badge + command search + settings + window controls
 *
 * WHY: For a simulation workbench, *running the simulation* is the single
 * most important action. Centering the transport makes it impossible to miss
 * and creates a clear visual anchor. This is the Unity model: the play
 * triangle in the center is the most recognizable element of that UI.
 * ──────────────────────────────────────────────────────────────────────────── */

function UnityTransportTitlebar() {
  return (
    <div className="flex h-[40px] shrink-0 items-center border-b border-border-default bg-layer-base ps-1 pe-0">
      {/* Left: app menu + project */}
      <div className="flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex size-8 items-center justify-center rounded-[var(--radius-sm)] text-text-secondary transition-colors hover:bg-layer-base-hover hover:text-text-primary data-[popup-open]:bg-layer-base-hover">
            <Menu className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <MockMenuItems />
          </DropdownMenuContent>
        </DropdownMenu>
        <Logo />
        <div className="flex items-baseline gap-1.5 ps-1">
          <span className="text-[length:var(--text-sm)] font-semibold text-text-primary">
            Brake Caliper
          </span>
          <span className="text-[length:var(--text-2xs)] text-warning">●</span>
          <span className="text-[length:var(--text-2xs)] text-text-tertiary">unsaved</span>
        </div>
      </div>

      {/* Center: transport hero — elevated pill */}
      <div className="flex flex-1 justify-center">
        <div className="flex items-center gap-px rounded-full border border-border-default bg-layer-recessed p-[3px]">
          <button
            type="button"
            className="inline-flex size-[28px] items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-layer-base hover:text-text-primary"
            aria-label="Reset"
          >
            <RotateCcw className="size-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex size-[28px] items-center justify-center rounded-full bg-accent-primary text-text-inverse transition-colors hover:bg-accent-hover"
            aria-label="Play"
          >
            <Play className="size-3.5 fill-current" strokeWidth={0} />
          </button>
          <button
            type="button"
            className="inline-flex size-[28px] items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-layer-base hover:text-text-primary"
            aria-label="Pause"
          >
            <Pause className="size-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex size-[28px] items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-layer-base hover:text-text-primary"
            aria-label="Step Forward"
          >
            <StepForward className="size-3.5" />
          </button>
          <div className="mx-1 h-4 w-px bg-border-default" />
          <div className="flex items-center gap-1 pe-1.5 text-[length:var(--text-2xs)] tabular-nums text-text-tertiary">
            <Clock className="size-3" />
            <span>0.000s</span>
            <span className="text-text-disabled">/</span>
            <span>2.000s</span>
          </div>
        </div>
      </div>

      {/* Right: version + search + settings */}
      <div className="flex items-center gap-1 pe-1">
        <span className="rounded-[var(--radius-sm)] bg-layer-recessed px-1.5 py-0.5 text-[length:var(--text-2xs)] font-medium tabular-nums text-text-tertiary">
          v3
        </span>
        <StatusPill status="compiled" />
        <div className="mx-0.5 h-4 w-px bg-border-default" />
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-[length:var(--text-xs)] text-text-tertiary transition-colors hover:bg-layer-base-hover hover:text-text-secondary"
          aria-label="Command search"
        >
          <Search className="size-3.5" />
          <kbd className="rounded-[2px] border border-border-default bg-layer-recessed px-1 text-[length:var(--text-3xs)] font-medium">
            ⌘K
          </kbd>
        </button>
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-layer-base-hover hover:text-text-secondary"
          aria-label="Settings"
        >
          <Settings className="size-3.5" />
        </button>
      </div>

      <WindowControls />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Proposal C — "Ansys Discovery Tabbed Ribbon"
 *
 * Inspired by Ansys Discovery. Two-row architecture:
 * Row 1: Thin title row with logo, file name, centered product name,
 *         and window controls.
 * Row 2: Tabbed ribbon that swaps the toolbar context (Design / Simulate /
 *         Results). Each tab reveals a different tool strip.
 *
 * The active tab's secondary toolbar strip is shown as the `secondaryBar`
 * slot of MockFrame, simulating the ribbon tool row.
 *
 * WHY: This is the standard in heavyweight CAE tools. Users of NX, Discovery,
 * CATIA, etc. will feel immediately at home. The ribbon provides progressive
 * disclosure — tools appear only when their workflow context is active.
 * ──────────────────────────────────────────────────────────────────────────── */

function AnsysRibbonTitlebar() {
  const [activeTab, setActiveTab] = useState<'design' | 'simulate' | 'results'>('design');

  return (
    <>
      {/* Row 1: title chrome */}
      <div className="flex h-[28px] shrink-0 items-center bg-layer-recessed ps-2 pe-0">
        <div className="flex items-center gap-2">
          <Logo size={12} />
          <span className="text-[length:var(--text-xs)] text-text-tertiary">
            Brake Caliper — MotionLab
          </span>
        </div>
        <div className="flex-1" />
        <WindowControls />
      </div>

      {/* Row 2: ribbon tabs + contextual tool strip */}
      <div className="flex flex-col border-b border-border-default bg-layer-base">
        {/* Tab row */}
        <div className="flex h-[32px] items-center gap-0 ps-1">
          <RibbonTab
            label="Design"
            active={activeTab === 'design'}
            onClick={() => setActiveTab('design')}
          />
          <RibbonTab
            label="Simulate"
            active={activeTab === 'simulate'}
            onClick={() => setActiveTab('simulate')}
          />
          <RibbonTab
            label="Results"
            active={activeTab === 'results'}
            onClick={() => setActiveTab('results')}
          />

          <div className="flex-1" />

          {/* Far-right: save state + search */}
          <div className="flex items-center gap-1 pe-2">
            <StatusPill status="compiled" />
            <button
              type="button"
              className="inline-flex size-6 items-center justify-center rounded-[var(--radius-sm)] text-text-tertiary hover:bg-layer-base-hover hover:text-text-secondary"
              aria-label="Search"
            >
              <Search className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Tool strip — changes per tab */}
        <div className="flex h-[36px] items-center gap-1 border-t border-border-default bg-layer-base px-2">
          {activeTab === 'design' && (
            <>
              <RibbonToolGroup label="Create">
                <RibbonToolButton icon={<Box />} label="Body" />
                <RibbonToolButton icon={<Crosshair />} label="Datum" />
                <RibbonToolButton icon={<CircleDot />} label="Joint" />
              </RibbonToolGroup>
              <div className="mx-1 h-5 w-px bg-border-default" />
              <RibbonToolGroup label="Modify">
                <RibbonToolButton icon={<Undo2 />} label="Undo" />
                <RibbonToolButton icon={<Redo2 />} label="Redo" />
              </RibbonToolGroup>
              <div className="mx-1 h-5 w-px bg-border-default" />
              <RibbonToolGroup label="File">
                <RibbonToolButton icon={<Save />} label="Save" />
                <RibbonToolButton icon={<Upload />} label="Import" />
                <RibbonToolButton icon={<Share2 />} label="Export" />
              </RibbonToolGroup>
            </>
          )}
          {activeTab === 'simulate' && (
            <>
              <RibbonToolGroup label="Run">
                <RibbonToolButton icon={<Play />} label="Run" accent />
                <RibbonToolButton icon={<Pause />} label="Pause" />
                <RibbonToolButton icon={<RotateCcw />} label="Reset" />
              </RibbonToolGroup>
              <div className="mx-1 h-5 w-px bg-border-default" />
              <RibbonToolGroup label="Setup">
                <RibbonToolButton icon={<Zap />} label="Drivers" />
                <RibbonToolButton icon={<Gauge />} label="Sensors" />
                <RibbonToolButton icon={<Settings />} label="Config" />
              </RibbonToolGroup>
            </>
          )}
          {activeTab === 'results' && (
            <>
              <RibbonToolGroup label="Analyze">
                <RibbonToolButton icon={<LineChart />} label="Charts" />
                <RibbonToolButton icon={<Share2 />} label="Export" />
              </RibbonToolGroup>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function RibbonTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative inline-flex h-[32px] items-center px-4 text-[length:var(--text-sm)] font-medium transition-colors',
        active ? 'text-accent-text' : 'text-text-tertiary hover:text-text-secondary',
      )}
    >
      {label}
      {active && (
        <span className="absolute inset-x-1 bottom-0 h-[2px] rounded-t-full bg-accent-primary" />
      )}
    </button>
  );
}

function RibbonToolGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-0">
      <div className="flex items-center gap-0.5">{children}</div>
      <span className="text-[length:var(--text-3xs)] text-text-disabled">{label}</span>
    </div>
  );
}

function RibbonToolButton({
  icon,
  label,
  accent = false,
}: {
  icon: ReactNode;
  label: string;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex size-6 items-center justify-center rounded-[var(--radius-sm)] transition-colors [&>svg]:size-3.5',
        accent
          ? 'bg-accent-primary text-text-inverse hover:bg-accent-hover'
          : 'text-text-secondary hover:bg-layer-base-hover hover:text-text-primary',
      )}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Proposal D — "OnShape Cloud-Native"
 *
 * Inspired by OnShape's browser-native CAD bar. Single row, relatively
 * compact. Features:
 *   - Logo opens app-level menu
 *   - Rich file identity chip: folder path + document name + version +
 *     branch + save state, all in one interactive breadcrumb
 *   - Centered command palette (prominent, Figma-like)
 *   - Right side: share button + avatar + window controls
 *
 * WHY: This is the most "modern SaaS product" approach. If MotionLab
 * ever targets web deployment or wants a contemporary, less-CAD-heavy
 * feel, this is the pattern. The file identity chip is richer than a
 * plain filename — it shows project context, version, and branch at
 * a glance without needing to open menus.
 * ──────────────────────────────────────────────────────────────────────────── */

function OnShapeCloudTitlebar() {
  return (
    <div className="flex h-[42px] shrink-0 items-center border-b border-border-default bg-layer-base ps-2 pe-0">
      {/* Logo + app menu */}
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 transition-colors hover:bg-layer-base-hover">
          <Logo size={16} />
          <ChevronDown className="size-3 text-text-tertiary" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <MockMenuItems />
        </DropdownMenuContent>
      </DropdownMenu>

      {/* File identity chip */}
      <div className="ms-2 flex items-center gap-1 rounded-[var(--radius-md)] border border-border-default bg-layer-recessed px-2.5 py-1">
        <FolderOpen className="size-3.5 text-text-tertiary" />
        <span className="text-[length:var(--text-xs)] text-text-tertiary">My Projects</span>
        <ChevronRight className="size-3 text-text-disabled" />
        <span className="text-[length:var(--text-sm)] font-medium text-text-primary">
          Brake Caliper
        </span>
        <div className="mx-1 h-3.5 w-px bg-border-default" />
        <div className="flex items-center gap-1 text-[length:var(--text-2xs)]">
          <GitBranch className="size-3 text-text-tertiary" />
          <span className="text-text-tertiary">main</span>
        </div>
        <div className="mx-1 h-3.5 w-px bg-border-default" />
        <span className="rounded-[2px] bg-success-soft px-1 py-px text-[length:var(--text-3xs)] font-medium text-success">
          v12 · Saved
        </span>
      </div>

      {/* Center: command palette */}
      <div className="flex flex-1 justify-center px-6">
        <button
          type="button"
          className="flex h-[30px] w-[380px] max-w-full items-center gap-2 rounded-full border border-border-default bg-layer-recessed px-3.5 text-[length:var(--text-sm)] text-text-tertiary transition-colors hover:border-border-strong hover:bg-layer-base"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="flex-1 text-left">Search commands, parts, joints…</span>
          <kbd className="flex shrink-0 items-center gap-0.5 rounded-[3px] border border-border-default bg-layer-base px-1.5 py-px text-[length:var(--text-2xs)] text-text-tertiary">
            <Command className="size-2.5" />K
          </kbd>
        </button>
      </div>

      {/* Right: share + avatar */}
      <div className="flex items-center gap-1.5 pe-1">
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-[length:var(--text-xs)] font-medium text-text-secondary transition-colors hover:bg-layer-base-hover hover:text-text-primary"
        >
          <Share2 className="size-3.5" />
          Share
        </button>
        <div className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-[length:var(--text-2xs)] font-semibold text-accent-text">
          ML
        </div>
      </div>

      <WindowControls />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Proposal E — "Blender Workspaces"
 *
 * Inspired by Blender's top bar. Workspace tabs live *in* the titlebar
 * itself as first-class peers of the window controls. No separate toolbar
 * row — everything fits in a single 38px bar.
 *
 *   Logo · Menus · | · [Model] [Simulate] [Results] [+] · flex · Search · ⚙ · WC
 *
 * The menus change based on active workspace. This is the most space-
 * efficient approach — every pixel of the top bar is functional.
 *
 * WHY: Maximizes viewport real estate. For users who primarily work with
 * the 3D viewport (the whole point of MotionLab), having zero wasted
 * vertical space is extremely valuable. This is the "power user" option.
 * ──────────────────────────────────────────────────────────────────────────── */

function BlenderWorkspaceTitlebar() {
  const [activeWs, setActiveWs] = useState<'model' | 'simulate' | 'results'>('model');

  const menus =
    activeWs === 'model'
      ? ['File', 'Edit', 'Add', 'View']
      : activeWs === 'simulate'
        ? ['File', 'Edit', 'Simulation', 'View']
        : ['File', 'Edit', 'Export', 'View'];

  return (
    <div className="flex h-[38px] shrink-0 items-center border-b border-border-default bg-layer-base ps-2 pe-0">
      {/* Logo */}
      <Logo />

      {/* Context menus */}
      <div className="ms-2 flex items-center">
        {menus.map((m) => (
          <MenuBarItem key={m} label={m} />
        ))}
      </div>

      <div className="mx-2 h-4 w-px bg-border-default" />

      {/* Workspace tabs — inline, draggable-looking */}
      <div className="flex items-center gap-px">
        <BlenderTab
          label="Model"
          active={activeWs === 'model'}
          onClick={() => setActiveWs('model')}
        />
        <BlenderTab
          label="Simulate"
          active={activeWs === 'simulate'}
          onClick={() => setActiveWs('simulate')}
        />
        <BlenderTab
          label="Results"
          active={activeWs === 'results'}
          onClick={() => setActiveWs('results')}
        />
        <button
          type="button"
          className="inline-flex size-6 items-center justify-center rounded-[var(--radius-sm)] text-text-disabled transition-colors hover:bg-layer-base-hover hover:text-text-tertiary"
          aria-label="Add workspace"
        >
          <span className="text-[length:var(--text-sm)]">+</span>
        </button>
      </div>

      <div className="flex-1" />

      {/* Right: project name + search + settings */}
      <div className="flex items-center gap-1.5 pe-1">
        <span className="text-[length:var(--text-xs)] text-text-tertiary">Brake Caliper</span>
        <StatusPill status="compiled" />
        <div className="mx-0.5 h-4 w-px bg-border-default" />
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-layer-base-hover hover:text-text-secondary"
          aria-label="Search"
        >
          <Search className="size-3.5" />
        </button>
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-layer-base-hover hover:text-text-secondary"
          aria-label="Settings"
        >
          <Settings className="size-3.5" />
        </button>
      </div>

      <WindowControls />
    </div>
  );
}

function BlenderTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-[26px] items-center rounded-[var(--radius-sm)] px-3 text-[length:var(--text-xs)] font-medium transition-all',
        active
          ? 'bg-accent-soft text-accent-text'
          : 'text-text-tertiary hover:bg-layer-base-hover hover:text-text-secondary',
      )}
    >
      {label}
    </button>
  );
}

function MenuBarItem({ label }: { label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-7 items-center rounded-[var(--radius-sm)] px-2 text-[length:var(--text-sm)] text-text-secondary transition-colors hover:bg-layer-base-hover data-[popup-open]:bg-layer-base-hover">
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <MockMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Proposal F — "CAD Toolbar Dock"
 *
 * Hybrid original design. Single-row titlebar, but with a key innovation:
 * the title bar *is* the primary toolbar. No separate toolbar row needed.
 *
 *   [☰ MotionLab ▾] · Undo Redo | Body Datum Joint | ····· | ▶ Play · t=0.342s | Status · ⚙ · WC
 *
 * This merges:
 * - App menu (hamburger + brand name dropdown)
 * - Edit shortcuts (undo/redo)
 * - Creation tools cluster
 * - flexed spacer
 * - Transport + time readout
 * - Status + settings + window controls
 *
 * All in one 40px row. No wasted space, no mode switching, everything
 * always visible. The closest analogy is a "toolbar that IS the titlebar."
 *
 * WHY: This is the pragmatic approach for MotionLab's pre-MVP stage.
 * No complex ribbon to build, no tab context switching to implement.
 * One row, all tools, simple implementation, and easily extensible.
 * ──────────────────────────────────────────────────────────────────────────── */

function CADToolbarDockTitlebar() {
  return (
    <div className="flex h-[40px] shrink-0 items-center border-b border-border-default bg-layer-base ps-1 pe-0">
      {/* App menu cluster */}
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 transition-colors hover:bg-layer-base-hover data-[popup-open]:bg-layer-base-hover">
          <Logo size={14} />
          <span className="text-[length:var(--text-sm)] font-semibold text-text-primary">
            MotionLab
          </span>
          <ChevronDown className="size-3 text-text-tertiary" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <MockMenuItems />
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Project name */}
      <div className="ms-1 flex items-center gap-1.5 border-l border-border-default ps-2">
        <span className="text-[length:var(--text-sm)] text-text-secondary">Brake Caliper</span>
        <span className="text-[length:var(--text-2xs)] text-warning">●</span>
      </div>

      <div className="mx-2 h-4 w-px bg-border-default" />

      {/* Edit tools */}
      <div className="flex items-center gap-0.5">
        <ToolbarDockButton icon={<Undo2 />} label="Undo" />
        <ToolbarDockButton icon={<Redo2 />} label="Redo" />
      </div>

      <div className="mx-2 h-4 w-px bg-border-default" />

      {/* Creation tools */}
      <div className="flex items-center gap-0.5">
        <ToolbarDockButton icon={<Box />} label="Body" text="Body" />
        <ToolbarDockButton icon={<Crosshair />} label="Datum" text="Datum" />
        <ToolbarDockButton icon={<CircleDot />} label="Joint" text="Joint" />
        <ToolbarDockButton icon={<Zap />} label="Driver" text="Driver" />
      </div>

      <div className="flex-1" />

      {/* Transport + time */}
      <div className="flex items-center gap-1 pe-1">
        <div className="flex items-center gap-0.5">
          <TransportButton icon={<RotateCcw className="size-3.5" />} label="Reset" />
          <TransportButton
            icon={<Play className="size-3.5 fill-current" />}
            label="Play"
            accent
          />
          <TransportButton icon={<StepForward className="size-3.5" />} label="Step" />
        </div>
        <span className="ms-1 min-w-[72px] rounded-[var(--radius-sm)] bg-layer-recessed px-2 py-0.5 text-center font-[family-name:var(--font-mono)] text-[length:var(--text-2xs)] tabular-nums text-text-secondary">
          t = 0.342 s
        </span>

        <div className="mx-1 h-4 w-px bg-border-default" />

        <StatusPill status="compiled" />
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-layer-base-hover hover:text-text-secondary"
          aria-label="Settings"
        >
          <Settings className="size-3.5" />
        </button>
      </div>

      <WindowControls />
    </div>
  );
}

function ToolbarDockButton({
  icon,
  label,
  text,
}: {
  icon: ReactNode;
  label: string;
  text?: string;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-sm)] px-1.5 text-text-secondary transition-colors hover:bg-layer-base-hover hover:text-text-primary [&>svg]:size-3.5"
      aria-label={label}
    >
      {icon}
      {text && (
        <span className="text-[length:var(--text-xs)] font-medium">{text}</span>
      )}
    </button>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
 * EXPERIMENTAL PROPOSALS (G · H · I)
 *
 * Proposals A–F refine existing CAE/CAD/Unity/Blender conventions. The three
 * below deliberately step away from convention and commit to a single strong
 * aesthetic idea. The goal is to make the titlebar itself a recognizable,
 * signature element of MotionLab — not just chrome around the viewport.
 * ════════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────────────────
 * Proposal G — "Telemetry Spine"
 *
 * The titlebar is an instrument cluster, not a chrome strip. Live readouts
 * (step time, energy drift, contact count, sim clock) flow across the bar as
 * labeled cells with mini sparklines. Mono everywhere, tabular numerics, a
 * subtle scanline overlay. The Run control is a beveled "ignition" stamp.
 *
 * WHY: A simulation workbench is a measurement instrument. Lean into that.
 * Users glance at the top of the window and see the *health of the run*, not
 * generic chrome. Bloomberg-terminal density meets oscilloscope phosphor.
 * ──────────────────────────────────────────────────────────────────────────── */

const SPARK_STEP = [4, 6, 5, 7, 5, 6, 4, 5, 3, 4, 3, 4, 2, 3, 2];
const SPARK_ENERGY = [3, 4, 3, 4, 3, 4, 3, 5, 3, 4, 3, 5, 4, 5, 4];
const SPARK_CONTACTS = [8, 9, 11, 10, 12, 13, 12, 13, 14, 13, 14, 15, 14, 14, 14];

function TelemetrySpineTitlebar() {
  return (
    <div
      className="relative flex h-[46px] shrink-0 items-stretch border-b border-border-default bg-layer-recessed pe-0"
      style={{
        backgroundImage:
          'repeating-linear-gradient(0deg, transparent 0, transparent 2px, rgba(255,255,255,0.018) 2px, rgba(255,255,255,0.018) 3px)',
      }}
    >
      {/* Brand spine */}
      <div className="flex items-center gap-2.5 border-e border-border-default px-3">
        <div className="relative flex size-6 items-center justify-center rounded-[2px] bg-accent-primary text-text-inverse shadow-[inset_0_-1px_0_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.15)]">
          <Triangle className="size-3 fill-current" strokeWidth={0} />
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-[family-name:var(--font-mono)] text-[8px] uppercase tracking-[0.22em] text-text-disabled">
            ML · Workbench
          </span>
          <span className="mt-0.5 font-[family-name:var(--font-mono)] text-[length:var(--text-xs)] text-text-primary">
            BRAKE_CALIPER.mlx
          </span>
        </div>
      </div>

      {/* Telemetry cells */}
      <TelemetryCell label="STEP τ" value="0.84" unit="ms">
        <Sparkline values={SPARK_STEP} tone="success" />
      </TelemetryCell>
      <TelemetryCell label="ΔE" value="+0.02" unit="%">
        <Sparkline values={SPARK_ENERGY} tone="warning" />
      </TelemetryCell>
      <TelemetryCell label="CONTACTS" value="14" unit="·">
        <Sparkline values={SPARK_CONTACTS} tone="success" />
      </TelemetryCell>
      <TelemetryCell label="SIM CLOCK" value="0.342" unit="s" wide>
        <span className="font-[family-name:var(--font-mono)] text-[8px] tabular-nums text-text-disabled">
          /2.000s · 17.0% ▮▮▮▱▱▱▱▱▱▱
        </span>
      </TelemetryCell>

      <div className="flex-1" />

      {/* Status indicator */}
      <div className="flex items-center gap-2 border-s border-border-default px-3">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-success" />
        </span>
        <span className="font-[family-name:var(--font-mono)] text-[length:var(--text-2xs)] uppercase tracking-[0.18em] text-text-secondary">
          armed
        </span>
      </div>

      {/* Ignition cluster */}
      <div className="flex items-center gap-0.5 border-s border-border-default ps-2 pe-2">
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center text-text-tertiary transition-colors hover:text-text-secondary"
          aria-label="Reset"
        >
          <RotateCcw className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Run simulation"
          className="group relative inline-flex h-7 items-center gap-1.5 bg-success-soft px-3 text-success transition-colors hover:bg-success/25"
          style={{
            clipPath: 'polygon(8% 0, 100% 0, 92% 100%, 0 100%)',
          }}
        >
          <Play className="size-3 fill-current" strokeWidth={0} />
          <span className="font-[family-name:var(--font-mono)] text-[length:var(--text-2xs)] uppercase tracking-[0.18em]">
            Run
          </span>
        </button>
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center text-text-tertiary transition-colors hover:text-text-secondary"
          aria-label="Step"
        >
          <StepForward className="size-3.5" />
        </button>
      </div>

      <WindowControls />
    </div>
  );
}

function TelemetryCell({
  label,
  value,
  unit,
  children,
  wide = false,
}: {
  label: string;
  value: string;
  unit: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col justify-center gap-0.5 border-e border-border-default px-3 py-1',
        wide ? 'min-w-[150px]' : 'min-w-[92px]',
      )}
    >
      <span className="font-[family-name:var(--font-mono)] text-[8px] uppercase tracking-[0.18em] text-text-disabled">
        {label}
      </span>
      <span className="flex items-baseline gap-1">
        <span className="font-[family-name:var(--font-mono)] text-[length:var(--text-xs)] tabular-nums text-text-primary">
          {value}
        </span>
        <span className="font-[family-name:var(--font-mono)] text-[8px] text-text-tertiary">
          {unit}
        </span>
      </span>
      <div className="mt-px">{children}</div>
    </div>
  );
}

function Sparkline({
  values,
  tone,
}: {
  values: number[];
  tone: 'success' | 'warning' | 'danger';
}) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 64;
  const h = 10;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`);
  const linePath = `M${pts.join(' L')}`;
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;
  const toneClass =
    tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-danger';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={cn('block', toneClass)}>
      <path d={areaPath} fill="currentColor" fillOpacity={0.16} />
      <path d={linePath} fill="none" stroke="currentColor" strokeWidth={1} strokeLinejoin="round" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Proposal H — "Engineer's Title Block"
 *
 * The titlebar IS an ANSI/ISO drawing title block transplanted to the top of
 * the window. A rigid grid of labeled fields — PROJECT · DOC NO · REV · SCALE
 * · UNITS · DRAWN · STATUS — separated by hairlines. All-caps mono, zero
 * rounded corners, drafting-plate vibe. The action lives in a stamped "RUN
 * SIM" cell on the far right.
 *
 * WHY: MotionLab is mechanism authoring software. Drawings are the historical
 * native artifact of mechanism engineering. Borrowing the title block makes
 * the workbench feel rooted in the discipline rather than imitating
 * generic SaaS or game-engine UIs. The aesthetic is unmistakable.
 * ──────────────────────────────────────────────────────────────────────────── */

function TitleBlockTitlebar() {
  return (
    <div
      className="flex h-[48px] shrink-0 items-stretch border-b-2 border-border-default bg-layer-base"
      style={{ borderRadius: 0 }}
    >
      {/* Brand corner */}
      <div className="flex items-center gap-2 border-e border-border-default bg-layer-recessed px-3">
        <div className="flex size-6 items-center justify-center border border-text-primary">
          <Triangle className="size-2.5 fill-text-primary text-text-primary" strokeWidth={0} />
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-[family-name:var(--font-mono)] text-[9px] font-semibold uppercase tracking-[0.18em] text-text-primary">
            MotionLab
          </span>
          <span className="mt-0.5 font-[family-name:var(--font-mono)] text-[7px] uppercase tracking-[0.22em] text-text-disabled">
            Mechanism R&D
          </span>
        </div>
      </div>

      <TitleBlockField label="PROJECT" value="Brake Caliper" wide emphasized />
      <TitleBlockField label="DOC NO" value="ML-0042-A" />
      <TitleBlockField label="REV" value="03" />
      <TitleBlockField label="SCALE" value="1:1" />
      <TitleBlockField label="UNITS" value="SI · mm" />
      <TitleBlockField label="DRAWN" value="L.S.G." />
      <TitleBlockField label="STATUS" value="MODIFIED" tone="warning" />

      {/* Drafting note */}
      <div className="flex items-center border-e border-border-default px-3">
        <span className="font-[family-name:var(--font-mono)] text-[7px] uppercase leading-tight tracking-[0.16em] text-text-disabled">
          ◇ Do Not Scale
          <br />
          ◇ Third Angle Proj.
        </span>
      </div>

      <div className="flex flex-1 items-center justify-end gap-3 border-e border-border-default px-3">
        <button
          type="button"
          aria-label="Reset"
          className="font-[family-name:var(--font-mono)] text-[length:var(--text-2xs)] uppercase tracking-[0.18em] text-text-tertiary hover:text-text-secondary"
        >
          ↺ Reset
        </button>
        <button
          type="button"
          aria-label="Step"
          className="font-[family-name:var(--font-mono)] text-[length:var(--text-2xs)] uppercase tracking-[0.18em] text-text-tertiary hover:text-text-secondary"
        >
          ⇥ Step
        </button>
      </div>

      {/* RUN SIM stamp */}
      <button
        type="button"
        className="group flex items-center gap-2 border-e border-border-default bg-success-soft px-5 transition-colors hover:bg-success/25"
        aria-label="Run simulation"
      >
        <Play className="size-3 fill-success text-success" strokeWidth={0} />
        <span className="font-[family-name:var(--font-mono)] text-[length:var(--text-xs)] font-semibold uppercase tracking-[0.22em] text-success">
          Run Sim
        </span>
      </button>

      <WindowControls />
    </div>
  );
}

function TitleBlockField({
  label,
  value,
  wide = false,
  emphasized = false,
  tone,
}: {
  label: string;
  value: string;
  wide?: boolean;
  emphasized?: boolean;
  tone?: 'warning' | 'danger' | 'success';
}) {
  const toneClass =
    tone === 'warning'
      ? 'text-warning'
      : tone === 'danger'
        ? 'text-danger'
        : tone === 'success'
          ? 'text-success'
          : 'text-text-primary';
  return (
    <div
      className={cn(
        'flex flex-col justify-center gap-0.5 border-e border-border-default px-3 py-1',
        wide ? 'min-w-[160px]' : 'min-w-[78px]',
      )}
    >
      <span className="font-[family-name:var(--font-mono)] text-[7px] uppercase tracking-[0.22em] text-text-disabled">
        {label}
      </span>
      <span
        className={cn(
          'font-[family-name:var(--font-mono)] uppercase tabular-nums tracking-wide',
          emphasized
            ? 'text-[length:var(--text-sm)] font-semibold'
            : 'text-[length:var(--text-xs)]',
          toneClass,
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Proposal I — "Floating Glass Spine"
 *
 * The titlebar dissolves. Three discrete pills float over the app surface
 * (brand · transport · tools), each with a backdrop blur and a prominent
 * drop shadow. There is no continuous chrome strip — the viewport reads as
 * bezel-less, and the controls feel like instruments hovering in front of
 * the work, not a frame around it.
 *
 * WHY: For a viewport-first creative tool, every pixel of contiguous chrome
 * is real estate stolen from the work. Discrete floating capsules give the
 * controls *presence* without committing to a full bar. visionOS-ish, but
 * with a tactile, mechanical pill geometry rather than glassy translucency.
 * The asymmetric three-pill layout is immediately recognizable as MotionLab.
 * ──────────────────────────────────────────────────────────────────────────── */

const FLOATING_PILL_SHADOW =
  '0 12px 32px -16px rgba(0,0,0,0.55), 0 4px 12px -6px rgba(0,0,0,0.35), 0 1px 0 0 rgba(255,255,255,0.04) inset';

function FloatingGlassSpineTitlebar() {
  return (
    <div className="relative z-20 flex h-[60px] shrink-0 items-center justify-between gap-3 bg-bg-app px-3 pe-0">
      {/* Brand pill */}
      <div
        className="flex h-10 items-center gap-2.5 rounded-full border border-border-default bg-layer-base px-3.5"
        style={{ boxShadow: FLOATING_PILL_SHADOW }}
      >
        <div className="flex size-6 items-center justify-center rounded-full bg-accent-primary text-text-inverse">
          <Triangle className="size-3 fill-current" strokeWidth={0} />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-[length:var(--text-sm)] font-semibold text-text-primary">
            Brake Caliper
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[length:var(--text-3xs)] uppercase tracking-[0.14em] text-text-tertiary">
            <Circle className="size-1.5 fill-warning text-warning" strokeWidth={0} />
            Unsaved · v3
          </span>
        </div>
        <div className="mx-1 h-5 w-px bg-border-default" />
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-layer-recessed hover:text-text-primary"
          aria-label="Project menu"
        >
          <ChevronDown className="size-3.5" />
        </button>
      </div>

      {/* Center action capsule */}
      <div
        className="flex h-11 items-center gap-1 rounded-full border border-border-default bg-layer-base p-1 ps-1.5"
        style={{ boxShadow: FLOATING_PILL_SHADOW }}
      >
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-layer-recessed hover:text-text-primary"
          aria-label="Reset"
        >
          <RotateCcw className="size-4" />
        </button>
        <button
          type="button"
          className="group relative inline-flex h-9 items-center gap-2 rounded-full bg-accent-primary px-5 text-text-inverse transition-colors hover:bg-accent-hover"
          aria-label="Run"
        >
          <Play className="size-3.5 fill-current" strokeWidth={0} />
          <span className="text-[length:var(--text-sm)] font-semibold tracking-tight">Run</span>
        </button>
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-layer-recessed hover:text-text-primary"
          aria-label="Pause"
        >
          <Pause className="size-4" />
        </button>
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-layer-recessed hover:text-text-primary"
          aria-label="Step"
        >
          <StepForward className="size-4" />
        </button>
        <div className="mx-1 h-5 w-px bg-border-default" />
        <div className="flex items-center gap-1.5 pe-3 font-[family-name:var(--font-mono)] text-[length:var(--text-2xs)] tabular-nums text-text-tertiary">
          <Clock className="size-3" />
          <span className="text-text-secondary">0.342</span>
          <span className="text-text-disabled">/ 2.000s</span>
        </div>
      </div>

      {/* Tools pill + window controls cluster */}
      <div className="flex items-center gap-2">
        <div
          className="flex h-10 items-center gap-1 rounded-full border border-border-default bg-layer-base px-1.5"
          style={{ boxShadow: FLOATING_PILL_SHADOW }}
        >
          <div className="flex items-center gap-1 ps-1 pe-1.5">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-success" />
            </span>
            <span className="text-[length:var(--text-3xs)] uppercase tracking-[0.14em] text-text-tertiary">
              Compiled
            </span>
          </div>
          <div className="h-5 w-px bg-border-default" />
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[length:var(--text-xs)] text-text-tertiary transition-colors hover:bg-layer-recessed hover:text-text-secondary"
            aria-label="Search"
          >
            <Search className="size-3.5" />
            <kbd className="rounded-[3px] border border-border-default bg-layer-recessed px-1 text-[length:var(--text-3xs)]">
              ⌘K
            </kbd>
          </button>
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-layer-recessed hover:text-text-secondary"
            aria-label="Share"
          >
            <Share2 className="size-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-layer-recessed hover:text-text-secondary"
            aria-label="Settings"
          >
            <Settings className="size-3.5" />
          </button>
        </div>
        <WindowControls />
      </div>
    </div>
  );
}

/* ── Storybook meta ────────────────────────────────────────────────────────── */

const meta: Meta = {
  title: 'Shell/Titlebar Proposals',
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj;

export const A_NXQuickAccess: Story = {
  name: 'A · NX Quick Access (two-row)',
  render: () => <MockFrame topBar={<NXQuickAccessTitlebar />} />,
};

export const B_UnityTransport: Story = {
  name: 'B · Unity Transport Bar',
  render: () => <MockFrame topBar={<UnityTransportTitlebar />} />,
};

export const C_AnsysRibbon: Story = {
  name: 'C · Ansys Tabbed Ribbon',
  render: () => <MockFrame topBar={<AnsysRibbonTitlebar />} />,
};

export const D_OnShapeCloud: Story = {
  name: 'D · OnShape Cloud-Native',
  render: () => <MockFrame topBar={<OnShapeCloudTitlebar />} />,
};

export const E_BlenderWorkspaces: Story = {
  name: 'E · Blender Workspaces',
  render: () => <MockFrame topBar={<BlenderWorkspaceTitlebar />} />,
};

export const F_CADToolbarDock: Story = {
  name: 'F · CAD Toolbar Dock (single row)',
  render: () => <MockFrame topBar={<CADToolbarDockTitlebar />} />,
};

/* ── Experimental ──────────────────────────────────────────────────────────── */

export const G_TelemetrySpine: Story = {
  name: 'G · Telemetry Spine ✦ experimental',
  render: () => <MockFrame topBar={<TelemetrySpineTitlebar />} />,
};

export const H_TitleBlock: Story = {
  name: "H · Engineer's Title Block ✦ experimental",
  render: () => <MockFrame topBar={<TitleBlockTitlebar />} />,
};

export const I_FloatingGlassSpine: Story = {
  name: 'I · Floating Glass Spine ✦ experimental',
  render: () => <MockFrame topBar={<FloatingGlassSpineTitlebar />} />,
};
