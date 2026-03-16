import { Search, TreePine, List } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ToolbarButton } from '@/components/primitives/toolbar-button';

interface LeftPanelProps {
  children?: ReactNode;
  className?: string;
}

function LeftPanel({ children, className }: LeftPanelProps) {
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');

  return (
    <div data-slot="left-panel" className={cn('flex h-full flex-col bg-bg-panel', className)}>
      {/* Tab row */}
      <Tabs defaultValue="structure" className="gap-0">
        <TabsList
          variant="line"
          className="h-8 w-full shrink-0 gap-0 border-b border-border-subtle px-2"
        >
          <TabsTrigger
            value="structure"
            className="text-[length:var(--text-xs)] uppercase tracking-wider"
          >
            Structure
          </TabsTrigger>
          <TabsTrigger
            value="studies"
            className="text-[length:var(--text-xs)] uppercase tracking-wider"
          >
            Studies
          </TabsTrigger>
          <TabsTrigger
            value="issues"
            className="text-[length:var(--text-xs)] uppercase tracking-wider"
          >
            Issues
          </TabsTrigger>
        </TabsList>

        {/* Filter bar */}
        <div className="flex items-center gap-1 border-b border-border-subtle px-2 py-1">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-1.5 top-1/2 size-3 -translate-y-1/2 text-text-tertiary" />
            <Input
              placeholder="Filter..."
              className="h-6 rounded-[var(--radius-sm)] border-none bg-bg-subtle pl-6 text-[length:var(--text-xs)]"
            />
          </div>
          <ToolbarButton
            tooltip={viewMode === 'tree' ? 'List view' : 'Tree view'}
            onClick={() => setViewMode(viewMode === 'tree' ? 'list' : 'tree')}
            className="size-6 [&_svg]:size-3.5"
          >
            {viewMode === 'tree' ? <List /> : <TreePine />}
          </ToolbarButton>
        </div>

        {/* Content */}
        <TabsContent value="structure" className="flex-1 overflow-hidden">
          {children}
        </TabsContent>
        <TabsContent value="studies" className="flex-1 overflow-hidden">
          <div className="flex h-full items-center justify-center text-[length:var(--text-sm)] text-text-tertiary">
            No studies defined
          </div>
        </TabsContent>
        <TabsContent value="issues" className="flex-1 overflow-hidden">
          <div className="flex h-full items-center justify-center text-[length:var(--text-sm)] text-text-tertiary">
            No issues
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export { LeftPanel };
export type { LeftPanelProps };
