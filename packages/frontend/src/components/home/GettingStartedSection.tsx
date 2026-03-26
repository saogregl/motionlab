import type { LucideIcon } from 'lucide-react';
import { Compass, Import, Play, Plus } from 'lucide-react';

import { CollapsibleSection } from './CollapsibleSection.js';

interface GettingStartedCard {
  title: string;
  description: string;
  icon: LucideIcon;
  action: () => void;
}

interface GettingStartedSectionProps {
  onNewProject: () => void;
  onOpenProject: () => void;
  onNavigateExamples: () => void;
}

function GettingStartedSection({
  onNewProject,
  onOpenProject,
  onNavigateExamples,
}: GettingStartedSectionProps) {
  const cards: GettingStartedCard[] = [
    {
      title: 'Create a mechanism',
      description: 'Start from scratch with a blank project',
      icon: Plus,
      action: onNewProject,
    },
    {
      title: 'Import a CAD model',
      description: 'Open an existing project file from disk',
      icon: Import,
      action: onOpenProject,
    },
    {
      title: 'Explore examples',
      description: 'Learn from pre-built mechanism examples',
      icon: Compass,
      action: onNavigateExamples,
    },
    {
      title: 'Watch a tutorial',
      description: 'Step-by-step guides to get started',
      icon: Play,
      action: () => {},
    },
  ];

  return (
    <CollapsibleSection title="Getting started with MotionLab" defaultOpen={false}>
      <div className="flex flex-wrap gap-3 ps-4 pe-4 pb-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.title}
              type="button"
              className="flex min-w-[180px] flex-1 items-start gap-3 rounded-[var(--radius-md)] border border-border-default bg-layer-base p-4 text-left transition-all hover:border-border-strong hover:shadow-[var(--shadow-low)]"
              onClick={card.action}
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-layer-raised">
                <Icon className="size-5 text-text-secondary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[length:var(--text-sm)] font-medium text-text-primary">
                  {card.title}
                </div>
                <div className="mt-1 text-[length:var(--text-xs)] text-text-tertiary leading-[var(--leading-normal)] line-clamp-2">
                  {card.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}

export { GettingStartedSection };
