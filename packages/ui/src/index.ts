/**
 * @motionlab/ui — shared UI primitives
 *
 * This package will contain headless, composable UI components
 * for the MotionLab desktop-like interface.
 */

export type { VariantProps } from 'class-variance-authority';
export type { SelectionChipProps } from './components/engineering/selection-chip';
// Engineering
export { SelectionChip } from './components/engineering/selection-chip';
export type { CopyableIdProps } from './components/engineering/copyable-id';
export { CopyableId } from './components/engineering/copyable-id';
export type { EditableInertiaMatrixProps } from './components/engineering/editable-inertia-matrix';
export { EditableInertiaMatrix } from './components/engineering/editable-inertia-matrix';
export type { InertiaMatrixDisplayProps } from './components/engineering/inertia-matrix-display';
export { InertiaMatrixDisplay } from './components/engineering/inertia-matrix-display';
export type { QuatDisplayProps, OrientationMode } from './components/engineering/quat-display';
export { QuatDisplay } from './components/engineering/quat-display';
export type { Vec3DisplayProps } from './components/engineering/vec3-display';
export { Vec3Display } from './components/engineering/vec3-display';
export { formatEngValue } from './lib/format';
export { quatToEulerDeg, eulerDegToQuat, isNearGimbalLock } from './lib/quat-math';
export type { Axis, AxisColorLabelProps } from './components/primitives/axis-color-label';
export { AxisColorLabel } from './components/primitives/axis-color-label';
export type {
  BodyContextMenuProps,
  DatumContextMenuProps,
  GeometryContextMenuProps,
  JointContextMenuProps,
  MultiSelectContextMenuProps,
} from './components/primitives/context-menus';
export {
  BodyContextMenu,
  BodyContextMenuItems,
  DatumContextMenu,
  DatumContextMenuItems,
  GeometryContextMenu,
  GeometryContextMenuItems,
  JointContextMenu,
  JointContextMenuItems,
  MultiSelectContextMenu,
  MultiSelectContextMenuItems,
} from './components/primitives/context-menus';
export type { DensityToggleProps } from './components/primitives/density-toggle';
export { DensityToggle } from './components/primitives/density-toggle';
export type { ConnectionBannerProps } from './components/primitives/connection-banner';
export { ConnectionBanner } from './components/primitives/connection-banner';
export type { EmptyStateProps } from './components/primitives/empty-state';
export { EmptyState } from './components/primitives/empty-state';
export type { FloatingToolCardProps } from './components/primitives/floating-tool-card';
export { FloatingToolCard } from './components/primitives/floating-tool-card';
export type { InlineEditableNameProps } from './components/primitives/inline-editable-name';
export { InlineEditableName } from './components/primitives/inline-editable-name';
export { InspectorPanel } from './components/primitives/inspector-panel';
export type { SkeletonRowProps } from './components/primitives/loading-skeleton';
export { LoadingSkeleton } from './components/primitives/loading-skeleton';
export { InspectorSection } from './components/primitives/inspector-section';
export type { SliderProps } from './components/primitives/slider';
export { Slider } from './components/primitives/slider';
export type { NumericInputProps } from './components/primitives/numeric-input';
export { NumericInput } from './components/primitives/numeric-input';
export { PropertyRow } from './components/primitives/property-row';
export type { StatusBadgeProps, StatusType } from './components/primitives/status-badge';
export { StatusBadge } from './components/primitives/status-badge';
export type { StatusBarProps } from './components/primitives/status-bar';
export { StatusBar } from './components/primitives/status-bar';
export type { ThemeToggleProps } from './components/primitives/theme-toggle';
export { ThemeToggle } from './components/primitives/theme-toggle';
export type { TimelineScrubberProps } from './components/primitives/timeline-scrubber';
export { TimelineScrubber } from './components/primitives/timeline-scrubber';
export type { TimelineTransportProps } from './components/primitives/timeline-transport';
export { TimelineTransport } from './components/primitives/timeline-transport';
export type { ToolbarButtonProps } from './components/primitives/toolbar-button';
export { ToolbarButton } from './components/primitives/toolbar-button';
export type { ToolbarGroupProps } from './components/primitives/toolbar-group';
export { ToolbarGroup } from './components/primitives/toolbar-group';
// Primitives
export { GroupHeaderRow, TreeRow } from './components/primitives/tree-row';
export type { TreeRowRenderProps } from './components/primitives/tree-view';
export { type TreeNode, TreeView } from './components/primitives/tree-view';
export type { ViewCubeProps } from './components/primitives/view-cube';
export { ViewCube } from './components/primitives/view-cube';
export type { ViewportToolbarProps } from './components/primitives/viewport-toolbar';
export { ViewportToolbar } from './components/primitives/viewport-toolbar';
// Layout engine
export { LayoutProvider, useLayoutManager } from './layout';
export { useLayoutRoot, useLayoutSlot, useViewportInsets } from './layout';
export type { PanelSide, PanelSlot, ViewportInsets } from './layout';
export type { AppShellProps } from './components/shell/app-shell';
// Shell
export { AppShell } from './components/shell/app-shell';
export type { FloatingPanelProps, FloatingPanelHeaderProps } from './components/shell/floating-panel';
export { FloatingPanel, FloatingPanelHeader } from './components/shell/floating-panel';
export type { BottomPanelProps, DockTab } from './components/shell/bottom-panel';
export { BottomPanel } from './components/shell/bottom-panel';
export type { LeftPanelProps } from './components/shell/left-panel';
export { LeftPanel } from './components/shell/left-panel';
export type { RightPanelProps } from './components/shell/right-panel';
export { RightPanel } from './components/shell/right-panel';
export type { TopBarProps } from './components/shell/top-bar';
export { TopBar } from './components/shell/top-bar';
export type { ViewportHUDProps } from './components/shell/viewport-hud';
export { ViewportHUD } from './components/shell/viewport-hud';
export type { WorkspaceTab, WorkspaceTabBarProps } from './components/shell/workspace-tab-bar';
export { WorkspaceTabBar } from './components/shell/workspace-tab-bar';
// Components
export { Badge, badgeVariants } from './components/ui/badge';
// Sonner toast
export { Toaster } from './components/ui/sonner';
export { Button, buttonVariants } from './components/ui/button';
export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from './components/ui/command';
export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from './components/ui/context-menu';
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from './components/ui/dialog';
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu';
export { Input } from './components/ui/input';
export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from './components/ui/input-group';
export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from './components/ui/popover';
export { ScrollArea, ScrollBar } from './components/ui/scroll-area';
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
export { Separator } from './components/ui/separator';
export { Switch } from './components/ui/switch';
export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants } from './components/ui/tabs';
export { Textarea } from './components/ui/textarea';
export { Toggle, toggleVariants } from './components/ui/toggle';
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip';
export type { Density } from './hooks/use-density';
export { useDensity } from './hooks/use-density';
export { HotkeysProvider, useHotkey } from './hooks/use-keyboard-shortcuts';
export type { Theme } from './hooks/use-theme';
// Hooks
export { useTheme } from './hooks/use-theme';
export { cn } from './lib/utils';
