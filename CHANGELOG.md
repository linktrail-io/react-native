# Changelog

## 0.0.1

Initial release. React Native New Architecture TurboModule wrapping the native LinkTrail
iOS and Android SDKs.

- Mobile attribution and **deferred deep linking** with a single `onLink` handler for both
  first-launch (deferred) and re-engagement links.
- `configure`, `trackInstall`, `trackEvent`, `handleDeepLink`, `getLastAttribution`,
  `getLastDeepLink`; iOS ATT / SKAdNetwork helpers (no-ops on Android).
- Automatic link forwarding via React Native's `Linking` API.
- Native SDKs resolve from their public registries — CocoaPods trunk (iOS) and Maven Central
  (Android) — so no extra pod or repository setup.
