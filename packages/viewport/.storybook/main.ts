import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  staticDirs: [
    '../../../data',
    '../../../apps/desktop/src/public',
    { from: '../node_modules/occt-import-js/dist', to: '/occt-wasm' },
  ],
};

export default config;
