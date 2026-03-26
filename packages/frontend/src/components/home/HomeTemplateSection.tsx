import type { LucideIcon } from 'lucide-react';
import {
  Box,
  FilePlus,
  GitBranch,
  Layout,
  MoveHorizontal,
  RotateCcw,
} from 'lucide-react';
import type { TemplateInfo } from '../../types/motionlab.js';

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  'file-plus': FilePlus,
  'rotate-ccw': RotateCcw,
  box: Box,
  'move-horizontal': MoveHorizontal,
  'git-branch': GitBranch,
};

interface HomeTemplateSectionProps {
  templates: TemplateInfo[];
  onOpenTemplate: (template: TemplateInfo) => void;
}

export function HomeTemplateSection({ templates, onOpenTemplate }: HomeTemplateSectionProps) {
  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-layer-recessed">
          <Layout className="size-6 text-text-tertiary" />
        </div>
        <h3 className="mb-1 text-[length:var(--text-sm)] font-medium text-text-primary">
          No templates available
        </h3>
        <p className="max-w-xs text-[length:var(--text-xs)] text-text-tertiary">
          Templates will appear here when available.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Layout className="size-3.5 text-text-tertiary" strokeWidth={1.5} />
        <h3 className="text-[length:var(--text-sm)] font-medium text-text-secondary">
          Start from a template
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {templates.map((template) => {
          const Icon = TEMPLATE_ICONS[template.icon] ?? FilePlus;
          return (
            <button
              key={template.id}
              type="button"
              className="flex flex-col rounded-[var(--radius-md)] border border-border-default bg-layer-base text-left transition-all hover:border-accent-primary/40 hover:shadow-[var(--shadow-low)]"
              onClick={() => onOpenTemplate(template)}
            >
              {/* Preview area */}
              <div className="flex h-12 w-full items-center justify-center rounded-t-[var(--radius-md)] bg-layer-recessed">
                <Icon className="size-6 text-text-tertiary" strokeWidth={1.2} />
              </div>
              {/* Info */}
              <div className="flex items-start gap-3 p-3">
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-accent-soft">
                  <Icon className="size-3.5 text-accent-text" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[length:var(--text-sm)] font-medium text-text-primary">
                    {template.name}
                  </div>
                  <div className="mt-0.5 text-[length:var(--text-xs)] text-text-tertiary line-clamp-2">
                    {template.description}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
