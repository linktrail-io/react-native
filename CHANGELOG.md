# Changelog

## Unreleased

- **Behavior change (Android):** `requestTrackingAuthorization()` now resolves `true` instead of
  `false`. Android has no App Tracking Transparency, so the platform never restricts tracking;
  this matches the Flutter SDK. It is not user consent — keep using `setConsent` /
  `requireConsent`. iOS is unchanged.
- Add a Jest test suite (`npm test`) covering the JS/TS layer with a mocked native module.

## 0.1.0

Adopts the native **0.1.0** SDKs: iOS `LinkTrailSDK ~> 0.1.0` (from `0.0.11`) and Android
`io.linktrail:sdk:0.1.0` (from `0.0.5`). This release has breaking changes.

### Upgrading from 0.0.4

1. **Custom link domains must be listed in `linkDomains`; `handleDeepLink` now ignores
   non-LinkTrail URLs.** Only `https` links on `linktrail.io` (or a subdomain) or on a
   `linkDomains` entry (or a subdomain) are claimed. Any other URL resolves `null` from
   `handleDeepLink`, with no network call and no `onError`. Custom-scheme LinkTrail links
   (`myapp://slug`) are no longer handled; use the `https` link. If your links use your own
   domain: `LinkTrail.configure(key, { linkDomains: ['go.acme.com'] })`.
2. **`<LinkTrailPasteButton/>` no longer grants consent after a denial** (iOS). New optional
   `grantsConsent` prop: omitted (default) grants only while consent is undecided, `true` always
   grants, `false` never touches consent. The tap now goes through the native SDK's paste path, so
   a token pasted after a denial is kept for routing instead of being dropped.
3. **`setConsent(false)` wins even with `requireConsent: false`**: one `consent: false` install
   with no device id is sent and events are dropped.
4. **`configure` is a singleton natively.** Calling it again with the same key and options is a
   no-op; different options shut the previous native instance down and replace it.
5. **SDK state is no longer backed up** on either platform: a restored or migrated app starts
   fresh and must ask for consent again.
6. **Rejected events are dropped, not queued** (400, 401, 403, 404, 409, 422, …); they still reach
   `onError`.
7. **Log format**: the `WARN` level is now `WARNING` and logged URLs drop their query and fragment.

### Added
- Android requests report the wrapper: `X-LinkTrail-SDK: react-native/<package version>` (read
  from `package.json` at build time). iOS still reports `ios/<native version>`: the published
  `LinkTrailSDK` 0.1.0 binary doesn't expose its wrapper hook to other modules yet.
- `grantsConsent` prop on `<LinkTrailPasteButton/>`.

### Changed
- `customData` docs: values are always strings; nested objects and arrays arrive as JSON strings
  on both platforms.

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
