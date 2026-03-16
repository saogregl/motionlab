import type { Preview } from '@storybook/react-vite';

import '../src/globals.css';

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Color theme',
      toolbar: {
        title: 'Theme',
        icon: 'sun',
        items: ['light', 'dark'],
        dynamicTitle: true,
      },
    },
    density: {
      description: 'UI density',
      toolbar: {
        title: 'Density',
        icon: 'component',
        items: ['comfortable', 'compact'],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'light',
    density: 'comfortable',
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme ?? 'light';
      const density = context.globals.density ?? 'comfortable';

      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      if (density === 'compact') {
        document.documentElement.classList.add('compact');
      } else {
        document.documentElement.classList.remove('compact');
      }

      return Story();
    },
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /date$/i,
      },
    },
  },
};

export default preview;
