module.exports = {
  preset: 'react-native',
  // Inline Babel config so the published build (react-native-builder-bob) is
  // unaffected by a repo-level babel.config.js.
  transform: {
    '\\.[jt]sx?$': [
      'babel-jest',
      { presets: ['module:@react-native/babel-preset'], configFile: false },
    ],
  },
  testMatch: ['<rootDir>/__tests__/**/*.test.{ts,tsx}'],
  modulePathIgnorePatterns: ['<rootDir>/lib/', '<rootDir>/example/'],
};
