import { cn, CollapsibleSection } from '@motionlab/ui';
import { ChevronDown, Clock, Folder, FolderOpen, Trash2 } from 'lucide-react';
import type { RecentProject } from '../../types/motionlab.js';
import { MechanismThumbnail } from './MechanismThumbnail.js';
import { formatRelativeTime, truncatePath } from '../../utils/format.js';

interface HomeProjectGridProps {
  projects: RecentProject[];
  onOpenProject: (project: RecentProject) => void;
  onRemoveProject: (filePath: string) => void;
}

export function HomeProjectGrid({ projects, onOpenProject, onRemoveProject }: HomeProjectGridProps) {
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-layer-base">
          <FolderOpen className="size-6 text-text-tertiary" />
        </div>
        <h3 className="mb-1 text-[length:var(--text-sm)] font-medium text-text-primary">
          No recent projects
        </h3>
        <p className="max-w-xs text-[length:var(--text-xs)] text-text-tertiary">
          Create a new project or open an existing one to get started.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Collapsible: Last opened cards */}
      <CollapsibleSection
        title="Last opened"
        icon={<Clock className="size-3.5" strokeWidth={1.5} />}
        defaultOpen={true}
      >
        <div className="flex flex-wrap gap-3 ps-4 pe-4 pb-3">
          {projects.slice(0, 6).map((project) => (
            <button
              key={project.filePath}
              type="button"
              className="group flex w-[210px] items-center gap-2 rounded-[var(--radius-md)] border border-border-default bg-layer-base p-2 text-left transition-all hover:border-border-strong hover:shadow-[var(--shadow-low)]"
              onClick={() => onOpenProject(project)}
            >
              {/* Thumbnail */}
              <div className="h-10 w-14 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-border-default text-text-tertiary">
                <MechanismThumbnail />
              </div>
              <span className="min-w-0 flex-1 truncate text-[length:var(--text-xs)] text-text-primary group-hover:text-text-secondary">
                {project.name}
              </span>
            </button>
          ))}
        </div>
      </CollapsibleSection>

      {/* Collapsible: Folders placeholder */}
      <CollapsibleSection
        title="Folders"
        icon={<Folder className="size-3.5" strokeWidth={1.5} />}
        defaultOpen={false}
      />

      {/* Collapse-all divider */}
      <div className="flex justify-center border-b border-border-default py-1">
        <ChevronDown className="size-4 text-text-tertiary" />
      </div>

      {/* Table view — all projects */}
      <div className="bg-layer-base">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_160px_160px_160px] border-b border-border-default">
          <div className="border-e border-border-default ps-4 pe-4 py-2 text-[length:var(--text-xs)] font-medium text-text-primary">
            Name
          </div>
          <div className="border-e border-border-default ps-4 pe-4 py-2 text-[length:var(--text-xs)] font-medium text-text-primary">
            Last Opened
          </div>
          <div className="border-e border-border-default ps-4 pe-4 py-2 text-[length:var(--text-xs)] font-medium text-text-primary">
            Modified by
          </div>
          <div className="ps-4 pe-4 py-2 text-[length:var(--text-xs)] font-medium text-text-primary">
            Location
          </div>
        </div>

        {/* Rows */}
        {projects.map((project) => (
          <div
            key={project.filePath}
            className="group grid cursor-pointer grid-cols-[1fr_160px_160px_160px] border-b border-border-default transition-colors hover:bg-layer-base-hover"
            onClick={() => onOpenProject(project)}
            onKeyDown={(e) => e.key === 'Enter' && onOpenProject(project)}
            tabIndex={0}
            role="button"
          >
            <div className="flex items-center gap-2 border-e border-border-default ps-4 pe-4 py-2.5 min-w-0">
              <div className="h-7 w-10 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-border-default text-text-tertiary">
                <MechanismThumbnail />
              </div>
              <span className="truncate text-[length:var(--text-xs)] text-text-primary group-hover:text-text-secondary">
                {project.name}
              </span>
              <button
                type="button"
                className="invisible ms-auto shrink-0 rounded p-1 text-text-tertiary hover:bg-layer-base-hover hover:text-danger group-hover:visible"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveProject(project.filePath);
                }}
                title="Remove from recent"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
            <div className="flex items-center border-e border-border-default ps-4 pe-4 py-2.5">
              <span className="text-[length:var(--text-xs)] text-text-primary">
                {formatRelativeTime(project.lastOpened)}
              </span>
            </div>
            <div className="flex items-center border-e border-border-default ps-4 pe-4 py-2.5">
              <span className="text-[length:var(--text-xs)] text-text-primary">
                You
              </span>
            </div>
            <div className="flex items-center ps-4 pe-4 py-2.5 min-w-0">
              <span className="truncate text-[length:var(--text-xs)] text-text-tertiary">
                {truncatePath(project.filePath)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
