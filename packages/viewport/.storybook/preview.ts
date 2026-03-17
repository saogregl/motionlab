import type { Preview } from '@storybook/react-vite';
import { Agentation } from 'agentation';
import { Fragment, createElement } from 'react';

const preview: Preview = {
  decorators: [
    (Story) => {
      const agentationEndpoint = import.meta.env.VITE_AGENTATION_ENDPOINT ?? 'http://localhost:4747';

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
