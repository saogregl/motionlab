import { BottomPanel } from '@motionlab/ui';

import { useUILayoutStore } from '../stores/ui-layout.js';
import { AssetBrowser } from './AssetBrowser.js';
import { DiagnosticsPanel } from './DiagnosticsPanel.js';
import { TimelineContent } from './TimelinePanel.js';

export function BuildBottomPanel() {
  const activeTab = useUILayoutStore((s) => s.bottomPanelActiveTab);
  const expanded = useUILayoutStore((s) => s.bottomPanelExpanded);
  const setActiveTab = useUILayoutStore((s) => s.setBottomPanelActiveTab);
  const setExpanded = useUILayoutStore((s) => s.setBottomPanelExpanded);

  return (
    <BottomPanel
      tabs={[
        { id: 'assets', label: 'Assets' },
        { id: 'timeline', label: 'Timeline' },
        { id: 'diagnostics', label: 'Diagnostics' },
      ]}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      expanded={expanded}
      onExpandedChange={setExpanded}
    >
      {activeTab === 'assets' && <AssetBrowser />}
      {activeTab === 'timeline' && <TimelineContent />}
      {activeTab === 'diagnostics' && <DiagnosticsPanel />}
    </BottomPanel>
  );
}
