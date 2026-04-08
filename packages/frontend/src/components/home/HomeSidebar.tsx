import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@motionlab/ui';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  FilePlus,
  FolderOpen,
  Layout,
  Plus,
  Share2,
  Tag,
  Trash2,
} from 'lucide-react';

export type HomeNavItem = 'recent' | 'templates' | 'examples' | 'shared' | 'labels' | 'trash';

interface NavEntry {
  id: HomeNavItem;
  label: string;
  icon: LucideIcon;
  trailing?: LucideIcon;
  separator?: boolean;
}

const NAV_ITEMS: NavEntry[] = [
  { id: 'recent', label: 'Recently Opened', icon: Clock },
  { id: 'templates', label: 'Templates', icon: Layout },
  { id: 'examples', label: 'Examples', icon: Compass },
  { id: 'shared', label: 'Shared with me', icon: Share2, separator: true },
  { id: 'labels', label: 'Labels', icon: Tag, trailing: ChevronRight },
  { id: 'trash', label: 'Trash', icon: Trash2 },
];

interface HomeSidebarProps {
  activeItem: HomeNavItem;
  onNavigate: (id: HomeNavItem) => void;
  onNewProject: () => void;
  onOpenProject: () => void;
  engineReady: boolean;
  appVersion: string | null;
}

export function HomeSidebar({
  activeItem,
  onNavigate,
  onNewProject,
  onOpenProject,
  engineReady,
  appVersion,
}: HomeSidebarProps) {
  return (
    <aside className="flex h-full w-[170px] shrink-0 flex-col border-e border-border-default bg-layer-base [-webkit-app-region:no-drag]">
      {/* Create / Open buttons */}
      <div className="flex flex-col gap-1.5 p-3 pb-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="default"
                disabled={!engineReady}
                className="w-full gap-1.5"
              />
            }
          >
            Create
            <ChevronDown className="size-3 ms-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={4}>
            <DropdownMenuItem onClick={onNewProject}>
              <FilePlus className="size-3.5" />
              New blank project
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNavigate('templates')}>
              <Layout className="size-3.5" />
              New from template…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenProject}>
              <FolderOpen className="size-3.5" />
              Open existing…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto">
        <ul className="py-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const Trailing = item.trailing;
            const isActive = activeItem === item.id;
            return (
              <li key={item.id}>
                {item.separator && <div className="mx-3 my-1 h-px bg-border-default" />}
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 ps-3 pe-3 py-1.5 text-[length:var(--text-sm)] text-left transition-colors hover:bg-layer-base-hover',
                    isActive && 'border-s-2 border-border-strong bg-layer-base-active text-text-primary font-medium',
                  )}
                  onClick={() => onNavigate(item.id)}
                >
                  <Icon
                    className={cn('size-4 shrink-0', isActive ? 'text-text-secondary' : 'text-text-tertiary')}
                    strokeWidth={1.5}
                  />
                  <span className="truncate">{item.label}</span>
                  {Trailing && (
                    <Trailing className="ms-auto size-3 shrink-0 text-text-tertiary" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className="border-t border-border-default p-3">
        <p className="text-[length:var(--text-2xs)] font-medium text-text-secondary">
          {appVersion ? `MotionLab v${appVersion}` : 'MotionLab'}
        </p>
        <p className="text-[length:var(--text-2xs)] text-text-tertiary">
          Mechanism Workbench
        </p>
      </div>
    </aside>
  );
}
