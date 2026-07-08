const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const root = path.resolve(__dirname, '..');

/**
 * Metro configuration for the example app.
 *
 * `linktrail-react-native` is installed as a symlink to the repo root, so Metro
 * must watch the root and resolve react/react-native from the example's own
 * node_modules — otherwise the library's devDependency copies get bundled twice.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [root],
  resolver: {
    blockList: [
      new RegExp(`${path.join(root, 'node_modules', 'react-native').replace(/[/\\]/g, '[/\\\\]')}[/\\\\].*`),
      new RegExp(`${path.join(root, 'node_modules', 'react').replace(/[/\\]/g, '[/\\\\]')}[/\\\\].*`),
    ],
    extraNodeModules: {
      react: path.join(__dirname, 'node_modules', 'react'),
      'react-native': path.join(__dirname, 'node_modules', 'react-native'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
