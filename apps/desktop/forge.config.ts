import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    extraResource: [
      `native/engine/build/release/motionlab-engine${process.platform === 'win32' ? '.exe' : ''}`,
      'resources/templates',
    ],
    // macOS file association (Epic 20.2)
    extendInfo: {
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: 'MotionLab Project',
          CFBundleTypeExtensions: ['motionlab'],
          CFBundleTypeRole: 'Editor',
          LSHandlerRank: 'Owner',
        },
      ],
    },
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      config: {},
      platforms: ['darwin', 'win32'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          mimeType: ['application/x-motionlab-project'],
          categories: ['Science', 'Engineering'],
        },
      },
      platforms: ['linux'],
    },
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
