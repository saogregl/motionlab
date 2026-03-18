/**
 * @motionlab/ui — shared UI primitives
 *
 * This package will contain headless, composable UI components
 * for the MotionLab desktop-like interface.
 */

export type { VariantProps } from 'class-variance-authority';
// Components
export { Badge, badgeVariants } from './components/ui/badge';
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
export { cn } from './lib/utils';

// Primitives
export { TreeRow, GroupHeaderRow } from './components/primitives/tree-row';
export { TreeView, type TreeNode } from './components/primitives/tree-view';
export type { TreeRowRenderProps } from './components/primitives/tree-view';
export { PropertyRow } from './components/primitives/property-row';
export { InspectorSection } from './components/primitives/inspector-section';
export { InspectorPanel } from './components/primitives/inspector-panel';
export { ToolbarButton } from './components/primitives/toolbar-button';
export type { ToolbarButtonProps } from './components/primitives/toolbar-button';
export { ToolbarGroup } from './components/primitives/toolbar-group';
export type { ToolbarGroupProps } from './components/primitives/toolbar-group';
export { StatusBadge } from './components/primitives/status-badge';
export type { StatusBadgeProps, StatusType } from './components/primitives/status-badge';
export { FloatingToolCard } from './components/primitives/floating-tool-card';
export type { FloatingToolCardProps } from './components/primitives/floating-tool-card';
export { ThemeToggle } from './components/primitives/theme-toggle';
export type { ThemeToggleProps } from './components/primitives/theme-toggle';
export { DensityToggle } from './components/primitives/density-toggle';
export type { DensityToggleProps } from './components/primitives/density-toggle';
export { EmptyState } from './components/primitives/empty-state';
export type { EmptyStateProps } from './components/primitives/empty-state';
export { InlineEditableName } from './components/primitives/inline-editable-name';
export type { InlineEditableNameProps } from './components/primitives/inline-editable-name';
export { BodyContextMenu, JointContextMenu, DatumContextMenu } from './components/primitives/context-menus';
export type {
  BodyContextMenuProps,
  JointContextMenuProps,
  DatumContextMenuProps,
} from './components/primitives/context-menus';
export { TimelineTransport } from './components/primitives/timeline-transport';
export type { TimelineTransportProps } from './components/primitives/timeline-transport';
export { TimelineScrubber } from './components/primitives/timeline-scrubber';
export type { TimelineScrubberProps } from './components/primitives/timeline-scrubber';
export { ViewCube } from './components/primitives/view-cube';
export type { ViewCubeProps } from './components/primitives/view-cube';
export { NumericInput } from './components/primitives/numeric-input';
export type { NumericInputProps } from './components/primitives/numeric-input';
export { AxisColorLabel } from './components/primitives/axis-color-label';
export type { AxisColorLabelProps, Axis } from './components/primitives/axis-color-label';
export { ViewportToolbar } from './components/primitives/viewport-toolbar';
export type { ViewportToolbarProps } from './components/primitives/viewport-toolbar';

// Hooks
export { useTheme } from './hooks/use-theme';
export type { Theme } from './hooks/use-theme';
export { useDensity } from './hooks/use-density';
export type { Density } from './hooks/use-density';
export { useHotkey } from './hooks/use-keyboard-shortcuts';

// Engineering
export { SelectionChip } from './components/engineering/selection-chip';
export type { SelectionChipProps } from './components/engineering/selection-chip';

// Shell
export { AppShell } from './components/shell/app-shell';
export type { AppShellProps } from './components/shell/app-shell';
export { TopBar } from './components/shell/top-bar';
export type { TopBarProps } from './components/shell/top-bar';
export { SecondaryToolbar } from './components/shell/secondary-toolbar';
export type { SecondaryToolbarProps } from './components/shell/secondary-toolbar';
export { LeftPanel } from './components/shell/left-panel';
export type { LeftPanelProps } from './components/shell/left-panel';
export { RightPanel } from './components/shell/right-panel';
export type { RightPanelProps } from './components/shell/right-panel';
export { BottomDock } from './components/shell/bottom-dock';
export type { BottomDockProps, DockTab } from './components/shell/bottom-dock';
export { WorkspaceTabBar } from './components/shell/workspace-tab-bar';
export type { WorkspaceTabBarProps, WorkspaceTab } from './components/shell/workspace-tab-bar';
export { ViewportHUD } from './components/shell/viewport-hud';
export type { ViewportHUDProps } from './components/shell/viewport-hud';
