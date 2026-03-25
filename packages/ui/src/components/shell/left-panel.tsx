import { List, Search, TreePine } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '../../lib/utils';
import { ToolbarButton } from '../primitives/toolbar-button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

interface LeftPanelProps {
  children?: ReactNode;
  className?: string;
  createAction?: ReactNode;
}

function LeftPanel({ children, className, createAction }: LeftPanelProps) {
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');

  return (
    <div data-slot="left-panel" className={cn('flex h-full flex-col bg-layer-base', className)}>
      {/* Tab row */}
      <Tabs defaultValue="structure" className="gap-0">
        <TabsList variant="contained" className="h-7 w-full shrink-0 px-0">
          <TabsTrigger
            value="structure"
            className="font-medium tracking-normal px-3 text-[length:var(--text-xs)]"
          >
            Structure
          </TabsTrigger>
          <TabsTrigger
            value="studies"
            className="font-medium tracking-normal px-3 text-[length:var(--text-xs)]"
          >
            Studies
          </TabsTrigger>
          <TabsTrigger
            value="issues"
            className="font-medium tracking-normal px-3 text-[length:var(--text-xs)]"
          >
            Issues
          </TabsTrigger>
        </TabsList>

        {/* Filter bar */}
        <div className="flex items-center gap-1.5 px-2 py-1">
          <div className="relative flex flex-1 items-center h-8 rounded-[var(--panel-radius)] bg-[var(--layer-base)] border border-transparent focus-within:border-[var(--border-field-focus)]">
            <Search className="absolute left-2 size-3 shrink-0 text-text-tertiary pointer-events-none" />
            <input
              placeholder="Search"
              className="h-full w-full bg-transparent ps-7 pe-2 text-[length:var(--text-xs)] outline-none placeholder:text-[var(--text-disabled)]"
            />
          </div>
          <ToolbarButton
            tooltip={viewMode === 'tree' ? 'List view' : 'Tree view'}
            onClick={() => setViewMode(viewMode === 'tree' ? 'list' : 'tree')}
            className="size-8 [&_svg]:size-3.5"
          >
            {viewMode === 'tree' ? <List /> : <TreePine />}
          </ToolbarButton>
          {createAction}
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
