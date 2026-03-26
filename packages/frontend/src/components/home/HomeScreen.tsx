import type { LucideIcon } from 'lucide-react';
import { Clock, Compass, FolderOpen, Layout, Share2, Tag, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { guardDirtyState } from '../../commands/dirty-guard.js';
import { sendLoadProject, sendNewProject } from '../../engine/connection.js';
import { useEngineConnection } from '../../stores/engine-connection.js';
import { useMechanismStore } from '../../stores/mechanism.js';
import { useUILayoutStore } from '../../stores/ui-layout.js';
import type { RecentProject, TemplateInfo } from '../../types/motionlab.js';
import { GettingStartedSection } from './GettingStartedSection.js';
import { HomeProjectGrid } from './HomeProjectGrid.js';
import { HomeSidebar, type HomeNavItem } from './HomeSidebar.js';
import { HomeTemplateSection } from './HomeTemplateSection.js';

const NAV_META: Record<HomeNavItem, { label: string; icon: LucideIcon }> = {
  recent: { label: 'Recently Opened', icon: Clock },
  templates: { label: 'Templates', icon: Layout },
  examples: { label: 'Examples', icon: Compass },
  shared: { label: 'Shared with me', icon: Share2 },
  labels: { label: 'Labels', icon: Tag },
  trash: { label: 'Trash', icon: Trash2 },
};

export function HomeScreen() {
  const engineStatus = useEngineConnection((s) => s.status);
  const bodies = useMechanismStore((s) => s.bodies);
  const isReady = engineStatus === 'ready';

  const [activeNav, setActiveNav] = useState<HomeNavItem>('recent');
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);

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
    loadRecentProjects();
    loadTemplates();
  }, [loadRecentProjects, loadTemplates]);

  const goToWorkbench = useCallback(() => {
    useUILayoutStore.getState().setActiveWorkspace('build');
  }, []);

  const handleNewProject = useCallback(() => {
    const name = 'Untitled';
    sendNewProject(name);
    useMechanismStore.getState().setProjectMeta(name, null);
    goToWorkbench();
  }, [goToWorkbench]);

  const handleOpenProject = useCallback(async () => {
    if (!window.motionlab) return;
    const result = await window.motionlab.openProjectFile();
    if (!result) return;
    sendLoadProject(result.data);
    goToWorkbench();
  }, [goToWorkbench]);

  const handleOpenRecent = useCallback(
    async (project: RecentProject) => {
      if (!window.motionlab?.readFileByPath) return;
      const result = await window.motionlab.readFileByPath(project.filePath);
      if (!result) {
        await window.motionlab.removeRecentProject?.(project.filePath);
        loadRecentProjects();
        return;
      }
      sendLoadProject(result.data);
      goToWorkbench();
    },
    [goToWorkbench, loadRecentProjects],
  );

  const handleRemoveRecent = useCallback(
    async (filePath: string) => {
      await window.motionlab?.removeRecentProject?.(filePath);
      loadRecentProjects();
    },
    [loadRecentProjects],
  );

  const handleOpenTemplate = useCallback(
    async (template: TemplateInfo) => {
      if (!window.motionlab?.openTemplate) return;

      if (bodies.size > 0) {
        const result = await guardDirtyState();
        if (result === 'cancel') return;
      }

      // Empty template: use sendNewProject
      if (template.id === 'empty') {
        sendNewProject(template.name);
        useMechanismStore.getState().setProjectMeta(template.name, null);
        goToWorkbench();
        return;
      }

      try {
        const data = await window.motionlab.openTemplate(template.filename);
        sendLoadProject(data);
        goToWorkbench();
      } catch {
        console.error('Failed to open template:', template.name);
      }
    },
    [bodies.size, goToWorkbench],
  );

  const meta = NAV_META[activeNav];
  const NavIcon = meta.icon;

  return (
    <div className="flex flex-1 overflow-hidden">
      <HomeSidebar
        activeItem={activeNav}
        onNavigate={setActiveNav}
        onNewProject={handleNewProject}
        onOpenProject={handleOpenProject}
        engineReady={isReady}
      />
      <main className="flex flex-1 flex-col overflow-y-auto bg-layer-recessed">
        {/* Page header */}
        <div className="flex items-center gap-2 border-b border-border-default bg-layer-base ps-4 pe-4 py-3">
          <NavIcon className="size-4 shrink-0 text-text-tertiary" strokeWidth={1.5} />
          <h1 className="text-[length:var(--text-sm)] font-medium text-text-primary">
            {meta.label}
          </h1>
        </div>

        {/* Content */}
        <div className="flex-1">
          {activeNav === 'recent' && (
            <>
              <GettingStartedSection
                onNewProject={handleNewProject}
                onOpenProject={handleOpenProject}
                onNavigateExamples={() => setActiveNav('examples')}
              />
              <HomeProjectGrid
                projects={recentProjects}
                onOpenProject={handleOpenRecent}
                onRemoveProject={handleRemoveRecent}
              />
            </>
          )}
          {activeNav === 'templates' && (
            <div className="ps-6 pe-6 py-5">
              <HomeTemplateSection
                templates={templates}
                onOpenTemplate={handleOpenTemplate}
              />
            </div>
          )}
          {activeNav === 'examples' && (
            <PlaceholderPage
              icon={Compass}
              title="Examples coming soon"
              description="Pre-built mechanism examples to learn from"
            />
          )}
          {activeNav === 'shared' && (
            <PlaceholderPage
              icon={Share2}
              title="Shared projects will appear here"
              description="Collaborate with your team on mechanisms"
            />
          )}
          {activeNav === 'labels' && (
            <PlaceholderPage
              icon={Tag}
              title="Labels"
              description="Organize your projects with custom labels"
            />
          )}
          {activeNav === 'trash' && (
            <PlaceholderPage
              icon={Trash2}
              title="Trash is empty"
              description="Deleted projects will appear here"
            />
          )}
        </div>

        {/* Footer */}
        <footer className="mt-auto flex items-center justify-between border-t border-border-default bg-layer-recessed ps-4 pe-4 py-2 text-[length:var(--text-2xs)] text-text-tertiary">
          <span>MotionLab — Mechanism Workbench</span>
          <span className="font-mono text-[length:var(--text-3xs)]">v0.0.1</span>
        </footer>
      </main>
    </div>
  );
}

function PlaceholderPage({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-layer-base">
        <Icon className="size-6 text-text-tertiary" />
      </div>
      <h3 className="mb-1 text-[length:var(--text-sm)] font-medium text-text-primary">
        {title}
      </h3>
      <p className="max-w-xs text-[length:var(--text-xs)] text-text-tertiary">
        {description}
      </p>
    </div>
  );
}
