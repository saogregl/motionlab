import type { Preview } from '@storybook/react-vite';
import { Agentation } from 'agentation';
import { createElement, Fragment } from 'react';

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Viewport theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'dark', title: 'Dark', icon: 'moon' },
          { value: 'light', title: 'Light', icon: 'sun' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'dark',
  },
  decorators: [
    (Story) => {
      const agentationEndpoint =
        import.meta.env.VITE_AGENTATION_ENDPOINT ?? 'http://localhost:4747';

      return createElement(
        Fragment,
        null,
        Story(),
        import.meta.env.DEV ? createElement(Agentation, { endpoint: agentationEndpoint }) : null,
      );
    },
  ],
  parameters: {
    layout: 'fullscreen',
  },
};

export default preview;
