# Changelog

## 0.0.4

- Bump the iOS native SDK to **`LinkTrailSDK ~> 0.0.11`** (from `0.0.10`).
- New `clickTokenSource: 'none'` mode (iOS) — the SDK never touches the clipboard (no paste
  button, no "Allow Paste" alert); deferred matching falls back to probabilistic IP matching.

## 0.0.3

- Bump the Android native SDK to **`io.linktrail:sdk:0.0.5`** (from `0.0.4`).

## 0.0.2

Consent gating, a native paste button, and the latest native SDKs.

- Native SDK bumps: iOS `LinkTrailSDK ~> 0.0.10`, Android `io.linktrail:sdk:0.0.4`.
- **Consent gating** (GDPR / ePrivacy): `requireConsent` option (deny-by-default) +
  `setConsent(granted)`. Deep links still route without consent; only tracking is gated.
- iOS deferred click token: `clickTokenSource` option + `<LinkTrailPasteButton/>` component
  (Apple `UIPasteControl`, themeable) + `trackInstallWithClickToken`.

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
