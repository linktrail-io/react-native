const fs = require('fs');
const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const root = path.resolve(__dirname, '..');

// e2e settings: the gitignored file the e2e scripts write (it holds the SDK key
// for that run), or the committed defaults (e2e off, placeholder key).
const E2E_LOCAL_CONFIG = path.join(__dirname, 'e2e.config.local.json');
const E2E_DEFAULT_CONFIG = path.join(__dirname, 'src', 'e2e', 'config.default.json');

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
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'kickflip-e2e-config') {
        return {
          type: 'sourceFile',
          filePath: fs.existsSync(E2E_LOCAL_CONFIG) ? E2E_LOCAL_CONFIG : E2E_DEFAULT_CONFIG,
        };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
    extraNodeModules: {
      react: path.join(__dirname, 'node_modules', 'react'),
      'react-native': path.join(__dirname, 'node_modules', 'react-native'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
