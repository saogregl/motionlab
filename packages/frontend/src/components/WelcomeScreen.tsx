import { Button } from '@motionlab/ui';
import type { LucideIcon } from 'lucide-react';
import {
  Box,
  Clock,
  FilePlus,
  FolderOpen,
  GitBranch,
  MoveHorizontal,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { guardDirtyState } from '../commands/dirty-guard.js';
import { sendLoadProject, sendNewProject } from '../engine/connection.js';
import { useEngineConnection } from '../stores/engine-connection.js';
import { useMechanismStore } from '../stores/mechanism.js';
import type { RecentProject, TemplateInfo } from '../types/motionlab.js';

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function truncatePath(filePath: string, maxLen = 50): string {
  if (filePath.length <= maxLen) return filePath;
  const parts = filePath.split('/');
  if (parts.length <= 3) return `…${filePath.slice(-maxLen)}`;
  return `…/${parts.slice(-3).join('/')}`;
}

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  'file-plus': FilePlus,
  'rotate-ccw': RotateCcw,
  box: Box,
  'move-horizontal': MoveHorizontal,
  'git-branch': GitBranch,
};

export function WelcomeScreen() {
  const engineStatus = useEngineConnection((s) => s.status);
  const bodies = useMechanismStore((s) => s.bodies);
  const importing = useMechanismStore((s) => s.importing);

  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [showNameInput, setShowNameInput] = useState(false);

  const visible = bodies.size === 0 && !importing;
  const isReady = engineStatus === 'ready';

  const loadRecentProjects = useCallback(async () => {
    if (!window.motionlab?.getRecentProjects) return;
    const list = await window.motionlab.getRecentProjects();
    setRecentProjects(list);
  }, []);

  const loadTemplates = useCallback(async () => {
    if (!window.motionlab?.getTemplates) return;
    const list = await window.motionlab.getTemplates();
    setTemplates(list);
  }, []);

  useEffect(() => {
    if (visible) {
      loadRecentProjects();
      loadTemplates();
    }
  }, [visible, loadRecentProjects, loadTemplates]);

  if (!visible) return null;

  const handleNewProject = () => {
    if (showNameInput) {
      const name = newProjectName.trim() || 'Untitled';
      sendNewProject(name);
      useMechanismStore.getState().setProjectMeta(name, null);
      setShowNameInput(false);
      setNewProjectName('');
    } else {
      setShowNameInput(true);
    }
  };

  const handleNewProjectKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleNewProject();
    if (e.key === 'Escape') {
      setShowNameInput(false);
      setNewProjectName('');
    }
  };

  const handleOpenProject = async () => {
    if (!window.motionlab) return;
    const result = await window.motionlab.openProjectFile();
    if (!result) return;
    sendLoadProject(result.data);
  };

  const handleOpenRecent = async (project: RecentProject) => {
    if (!window.motionlab?.readFileByPath) return;
    const result = await window.motionlab.readFileByPath(project.filePath);
    if (!result) {
      // File doesn't exist — remove from recent list
      await window.motionlab.removeRecentProject?.(project.filePath);
      loadRecentProjects();
      return;
    }
    sendLoadProject(result.data);
  };

  const handleRemoveRecent = async (filePath: string) => {
    await window.motionlab?.removeRecentProject?.(filePath);
    loadRecentProjects();
  };

  const handleOpenTemplate = async (template: TemplateInfo) => {
    if (!window.motionlab?.openTemplate) return;

    // Dirty guard only when a project is loaded
    if (bodies.size > 0) {
      const result = await guardDirtyState();
      if (result === 'cancel') return;
    }

    // Empty template: use sendNewProject to avoid welcome screen re-showing
    // (empty mechanism keeps bodies.size === 0 which would re-display this screen)
    if (template.id === 'empty') {
      sendNewProject(template.name);
      useMechanismStore.getState().setProjectMeta(template.name, null);
      return;
    }

    try {
      const data = await window.motionlab.openTemplate(template.filename);
      sendLoadProject(data);
    } catch {
      console.error('Failed to open template:', template.name);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-layer-base/95 backdrop-blur-sm">
      <div className="flex w-full max-w-2xl flex-col items-center gap-8 px-8">
        {/* Logo & title */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-sm bg-[var(--accent-soft)] border border-[var(--accent-primary)]/20" />
            <h1 className="text-2xl font-bold text-text-primary">MotionLab</h1>
          </div>
          <p className="text-[length:var(--text-sm)] text-text-tertiary">
            Mechanism authoring & simulation workbench
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          {showNameInput ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="h-9 rounded-[var(--radius-sm)] border border-border-default bg-field-base px-3 text-[length:var(--text-sm)] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
                placeholder="Project name…"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={handleNewProjectKeyDown}
                autoFocus
              />
              <Button size="sm" onClick={handleNewProject} disabled={!isReady}>
                Create
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowNameInput(false);
                  setNewProjectName('');
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <Button
                variant="outline"
                size="default"
                onClick={handleNewProject}
                disabled={!isReady}
              >
                <FilePlus className="size-4 mr-2" />
                New Project
              </Button>
              <Button
                variant="outline"
                size="default"
                onClick={handleOpenProject}
              >
                <FolderOpen className="size-4 mr-2" />
                Open Project
              </Button>
            </>
          )}
        </div>

        {/* Recent projects */}
        {recentProjects.length > 0 && (
          <div className="w-full max-w-md">
            <h2 className="mb-3 text-[length:var(--text-sm)] font-medium text-text-secondary">
              Recent Projects
            </h2>
            <div className="flex flex-col rounded-[var(--radius-md)] border border-border-default bg-layer-overlay">
              {recentProjects.map((project, i) => (
                <button
                  key={project.filePath}
                  type="button"
                  className={`group flex items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-layer-hover ${i > 0 ? 'border-t border-border-default' : ''}`}
                  onClick={() => handleOpenRecent(project)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[length:var(--text-sm)] font-medium text-text-primary">
                      {project.name}
                    </div>
                    <div className="truncate text-[length:var(--text-2xs)] text-text-tertiary">
                      {truncatePath(project.filePath)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 ps-4">
                    <span className="flex items-center gap-1 text-[length:var(--text-2xs)] text-text-tertiary">
                      <Clock className="size-3" />
                      {formatRelativeTime(project.lastOpened)}
                    </span>
                    <button
                      type="button"
                      className="invisible rounded p-1 text-text-tertiary hover:bg-layer-hover hover:text-text-secondary group-hover:visible"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveRecent(project.filePath);
                      }}
                      title="Remove from recent"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Templates */}
        {templates.length > 0 && (
          <div className="w-full max-w-md">
            <h2 className="mb-3 text-[length:var(--text-sm)] font-medium text-text-secondary">
              Templates
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {templates.map((template) => {
                const Icon = TEMPLATE_ICONS[template.icon] ?? FilePlus;
                return (
                  <button
                    key={template.id}
                    type="button"
                    className="flex items-start gap-3 rounded-[var(--radius-md)] border border-border-default bg-layer-overlay px-4 py-3 text-left transition-colors hover:bg-layer-hover"
                    onClick={() => handleOpenTemplate(template)}
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-text-secondary" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[length:var(--text-sm)] font-medium text-text-primary">
                        {template.name}
                      </div>
                      <div className="text-[length:var(--text-2xs)] text-text-tertiary line-clamp-2">
                        {template.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
