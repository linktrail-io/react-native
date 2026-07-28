# LinkTrail React Native SDK

Mobile **attribution** and **deferred deep linking** for React Native. A New Architecture
**TurboModule** that wraps the native [LinkTrail iOS](https://github.com/linktrail-io/ios-sdk) and
[Android](https://github.com/linktrail-io/android-sdk) SDKs — the entry point is `LinkTrail`.

- **Package:** `linktrail-react-native` (npm) · **React Native:** 0.76+ (New Architecture) · **iOS:** 15.1+ · **Android:** minSdk 26

## Install

```sh
npm install linktrail-react-native
```

The native SDKs resolve automatically — `LinkTrailSDK` from the CocoaPods trunk, `io.linktrail:sdk`
from Maven Central — so there's nothing else to add.

- **iOS** — `cd ios && pod install`.
- **Android** — nothing extra; just make sure your app's `minSdkVersion` is **26** or higher.
- **Expo** — needs a [development build](https://docs.expo.dev/develop/development-builds/introduction/) (not Expo Go). Set `minSdkVersion` via [`expo-build-properties`](https://docs.expo.dev/versions/latest/sdk/build-properties/), then `npx expo prebuild`:

  ```json
  { "expo": { "plugins": [["expo-build-properties", { "android": { "minSdkVersion": 26 } }]] } }
  ```

## Quick start

```ts
import LinkTrail from 'linktrail-react-native';

// At app launch. The API key is required.
await LinkTrail.configure('lt_live_…');

// One listener handles both first-launch (deferred) AND re-engagement links:
LinkTrail.onLink((link, source) => {
  router.navigate(link.path, link.customData); // e.g. "/products/aj1" + { voucher: "SUMMER25" }
});

// Observe failures:
LinkTrail.onError((error) => console.warn(`[LinkTrail] ${error.code}: ${error.message}`));
```

The install is tracked automatically by `configure`, and incoming links (Universal Links / App
Links / custom schemes) are forwarded via React Native's `Linking` API — no extra wiring.

## More

```ts
// Custom post-install events:
await LinkTrail.trackEvent('purchase', { value: 59.99, currency: 'USD' });

// Cached results:
const attribution = await LinkTrail.getLastAttribution();
const lastLink = await LinkTrail.getLastDeepLink();

// Consent-gated install (defer configure's auto-track, then call manually):
await LinkTrail.configure('lt_live_…', { autoTrackInstall: false });
await LinkTrail.trackInstall();

// iOS ATT / SKAdNetwork (no-ops on Android):
await LinkTrail.requestTrackingAuthorization();
LinkTrail.registerForSKAdAttribution();
LinkTrail.updateConversionValue(42, 'medium');
```

`configure` also takes `{ logEnabled, logLevel, requestTimeoutMillis, retryPolicy, linkDomains,
autoTrackInstall, autoHandleLinks }`. Set `autoHandleLinks: false` to forward URLs yourself via
`LinkTrail.handleDeepLink(url)`.

## Deep-link setup

Standard app deep-link config — the wrapper handles the rest. Declare your LinkTrail host as a
Universal Link (iOS Associated Domains: `applinks:kick.linktrail.io`) and an App Links
`intent-filter` (Android), plus any custom scheme. LinkTrail infra hosts the
`apple-app-site-association` / `assetlinks.json` files for your link domains.

**List every link host in `linkDomains`.** When `linkDomains` is non-empty, the SDK routes
re-engagement opens (app already installed) *only* for those hosts — a link on an unlisted host
opens the app but never navigates. Deferred (install-time) links skip this check and route
regardless, so a missing host can look fine on a fresh install yet fail once the app is installed.
Leave `linkDomains` empty (the default) to handle every parseable link.

## Example app

[`example/`](example/) is **KickFlip**, a storefront that shows deferred deep linking end to end,
consuming this package the same way your app would. A link button fires the four scenarios
(home · category · product · product + voucher):

```sh
cd example && npm install && npm run ios   # or: npm run android
```

Set your `lt_live_…` key in [`src/attribution.ts`](example/src/attribution.ts); without one the
simulator's links route locally. See [example/README.md](example/README.md).

## License

MIT. See [LICENSE](LICENSE).
