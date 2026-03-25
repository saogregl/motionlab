import { ChannelBrowser } from './ChannelBrowser.js';
import { SimulationMetadataSection } from './SimulationMetadataSection.js';

export function ResultsLeftPanel() {
  return (
    <div className="flex h-full flex-col bg-layer-base">
      {/* Header */}
      <div className="flex h-7 shrink-0 items-center border-b border-[var(--border-default)] ps-3 pe-3">
        <span className="text-[length:var(--text-xs)] font-medium text-text-secondary">
          Output Channels
        </span>
      </div>

      {/* Channel browser */}
      <div className="min-h-0 flex-1 overflow-auto">
        <ChannelBrowser />
      </div>

      {/* Run metadata */}
      <div className="shrink-0 border-t border-[var(--border-default)]">
        <SimulationMetadataSection />
      </div>
    </div>
  );
}
