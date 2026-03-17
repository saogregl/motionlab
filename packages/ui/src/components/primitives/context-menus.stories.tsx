import type { Meta, StoryObj } from '@storybook/react-vite';

import { BodyContextMenu, JointContextMenu, DatumContextMenu } from './context-menus';

const meta = {
  title: 'Primitives/ContextMenus',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const regionCls =
  'flex h-32 w-48 cursor-context-menu items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-muted)] text-[length:var(--text-sm)] text-[var(--text-secondary)] select-none';

export const AllMenus: Story = {
  render: () => (
    <div className="flex gap-4">
      <BodyContextMenu
        onSelectInViewport={() => console.log('Body: Select in Viewport')}
        onIsolate={() => console.log('Body: Isolate')}
        onToggleVisibility={() => console.log('Body: Toggle Visibility')}
        onCreateDatum={() => console.log('Body: Create Datum')}
        onCreateJoint={() => console.log('Body: Create Joint')}
        onRename={() => console.log('Body: Rename')}
        onProperties={() => console.log('Body: Properties')}
        onDelete={() => console.log('Body: Delete')}
      >
        <div className={regionCls}>Right-click: Body</div>
      </BodyContextMenu>

      <JointContextMenu
        onSelectInViewport={() => console.log('Joint: Select in Viewport')}
        onFocusViewport={() => console.log('Joint: Focus Viewport')}
        onEditJoint={() => console.log('Joint: Edit')}
        onChangeType={(type) => console.log('Joint: Change Type →', type)}
        onSwapBodies={() => console.log('Joint: Swap Bodies')}
        onReverseDirection={() => console.log('Joint: Reverse Direction')}
        onRename={() => console.log('Joint: Rename')}
        onProperties={() => console.log('Joint: Properties')}
        onDelete={() => console.log('Joint: Delete')}
      >
        <div className={regionCls}>Right-click: Joint</div>
      </JointContextMenu>

      <DatumContextMenu
        onSelectInViewport={() => console.log('Datum: Select in Viewport')}
        onFocusViewport={() => console.log('Datum: Focus Viewport')}
        onCreateJoint={() => console.log('Datum: Create Joint')}
        onRename={() => console.log('Datum: Rename')}
        onProperties={() => console.log('Datum: Properties')}
        onDelete={() => console.log('Datum: Delete')}
      >
        <div className={regionCls}>Right-click: Datum</div>
      </DatumContextMenu>
    </div>
  ),
};
