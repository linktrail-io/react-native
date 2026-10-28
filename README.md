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
import LinkTrail, { LinkTrailError } from 'linktrail-react-native';

// At app launch. Register the listeners first (see "Deferred link delivery" below).
// One listener handles both first-launch (deferred) AND re-engagement links:
LinkTrail.onLink((link, source) => {
  router.navigate(link.path, link.customData); // e.g. "/products/aj1" + { voucher: "SUMMER25" }
});

// Observe failures:
LinkTrail.onError((error) => console.warn(`[LinkTrail] ${error.code}: ${error.message}`));

// The API key is required. If your links use your own domain, list it (required from 0.1.0):
await LinkTrail.configure('lt_live_…', { linkDomains: ['go.acme.com'] });
```

`configure` tracks the install automatically (held until the user's consent decision, see
[Consent gating](#consent-gating)). Incoming links reach the wrapper through React Native's
`Linking` API, which it forwards to the native SDK for you. On **iOS** that only works once your
`AppDelegate` passes URLs to `RCTLinkingManager`; see
[iOS: forward links to React Native](#ios-forward-links-to-react-native).

### `configure` is a singleton

Calling `configure` again with the same key and options is a no-op. A call with a different key or
different options shuts the previous native instance down (its pending work is cancelled) and
replaces it. Your JS `onLink` / `onAttribution` / `onError` subscriptions stay valid: the wrapper
re-registers its native callbacks on every `configure`.

### Deferred link delivery

When the install resolves a deferred link, the native SDK saves it and delivers it to `onLink`
(`source === 'deferred'`) **at least once**, even on a later launch if the app was killed first. A
saved link older than **7 days** is dropped. Delivery can repeat, so make your `onLink` handler
safe to run twice for the same link.

In this version the wrapper does not hold a link for a JS listener that subscribes late. The
wrapper registers its native `onLink` inside `configure`, so the native SDK counts the link as
delivered once it reaches the wrapper, and the wrapper passes it only to the JS listeners that are
subscribed at that moment. So subscribe to `onLink` **before** calling `configure`, not after a
splash or login screen. If you need to route later, keep the link in your own state until the
screen is ready.

`onLink` can be registered after a splash or login screen: links that arrive before the first
listener are kept and delivered to it once, in order (later listeners get no replays). A deferred
link stays saved natively (across launches) until a listener exists; up to 10 re-engagement links
are buffered in memory. `onAttribution` replays the latest result to its first listener.

### Errors

Every promise rejects with a `LinkTrailError`, and `onError` gets the same fields:

| Field | |
| --- | --- |
| `code` | `missingApiKey`, `invalidApiKey`, `notConfigured`, `invalidUrl`, `notALinkTrailUrl`, `transport`, `server`, `decoding`, `emptyResponse`, `invalidArgument`, `unknown` |
| `message` | The native SDK's message, unchanged |
| `statusCode`, `body` | `server` errors only (`body` when the server sent one) |
| `legacyCode` | The pre-0.1.1 snake_case code. Deprecated; removed in the next minor release |

```ts
try {
  await LinkTrail.trackEvent('purchase');
} catch (e) {
  if (e instanceof LinkTrailError && e.code === 'server') console.warn(e.statusCode, e.body);
}
```

## More

```ts
// Custom post-install events:
await LinkTrail.trackEvent('purchase', { value: 59.99, currency: 'USD' });

// Cached results:
const attribution = await LinkTrail.getLastAttribution();
const lastLink = await LinkTrail.getLastDeepLink();

// Versions: this package, and the embedded native SDK.
LinkTrail.version; // "0.1.1"
LinkTrail.nativeSdkVersion; // e.g. "0.1.0"
 
// iOS ATT / SKAdNetwork. On Android there is no ATT: requestTrackingAuthorization()
// is not applicable and resolves `true` (the OS does not restrict tracking); the
// SKAdNetwork calls are no-ops.
await LinkTrail.requestTrackingAuthorization();
LinkTrail.registerForSKAdAttribution();
LinkTrail.updateConversionValue(42, 'medium');
```

`configure` also takes `{ logEnabled, logLevel, requestTimeoutMillis, retryPolicy, linkDomains,
autoTrackInstall, requireConsent, clickTokenSource, autoHandleLinks }`. Set `autoHandleLinks: false`
to forward URLs yourself via `LinkTrail.handleDeepLink(url)`.

For tests and QA builds, `LinkTrail.resetForTesting()` clears the native SDK state (install flag,
cached attribution, saved deferred link, queued events and device id), so the next launch sends a
fresh install. Don't call it in production.

### Consent gating

`requireConsent` (default `true`) gates attribution/tracking behind the user's decision —
**deny-by-default** for GDPR / ePrivacy:

| Decision | What the SDK sends |
| --- | --- |
| not made yet | nothing: the install is **held** (persisted across launches) and events are dropped |
| granted | the install with `consent: true`, counted and attributed; events are sent |
| denied | **one** install with `consent: false` and no device id, so the deep link still resolves and the user is routed, but nothing is recorded; events are dropped |

Because the deferred link is resolved by that install, it routes **after** the user answers,
whichever answer it is. `setConsent(false)` always wins, even with `requireConsent: false`. The
SDK exposes **no consent getter** — your app is the source of truth: persist the choice and replay
it with `setConsent` on every launch after `configure`.

```ts
await LinkTrail.configure('lt_live_…', { requireConsent: true });

// After your consent UI resolves (persist the choice yourself, e.g. AsyncStorage):
LinkTrail.setConsent(true);   // sends the held install (consent: true) + flushes queued events
LinkTrail.setConsent(false);  // sends one consent: false install (routes, records nothing) + drops the queue

// On the next launch, replay the stored decision right after configure:
LinkTrail.setConsent(storedGranted);
```

Set `requireConsent: false` to attribute at init without a consent step (an explicit
`setConsent(false)` still wins). See the example app's
[`src/consent.ts`](example/src/consent.ts) for the persist-and-replay pattern.

### Deferred attribution & the paste button (iOS)

On iOS, deferred attribution recovers a **click token** the tapped link left on the clipboard.
`clickTokenSource` (in `configure`) picks how it's read:

- **`'automatic'`** — the SDK reads the clipboard itself at install. Needs no UI, but iOS shows the
  system **"Allow Paste"** alert on first launch.
- **`'pasteButton'`** (default) — the token is read **only** when the user taps
  `<LinkTrailPasteButton/>` (Apple's `UIPasteControl`), with **no "Allow Paste" alert**. You render
  the button and set **`autoTrackInstall: false`** so the install waits for the tap. The tap goes
  through the native SDK's paste button: it sends the install with the token and, by default, also
  records consent if the user hasn't decided yet (see `grantsConsent` below).
- **`'none'`** — the SDK **never touches the clipboard** (no button, no alert); deferred matching
  falls back to probabilistic IP matching only.

Android uses the Play Install Referrer instead, so `clickTokenSource` is ignored there and
`<LinkTrailPasteButton/>` renders nothing.

```tsx
import { LinkTrail, LinkTrailPasteButton } from 'linktrail-react-native';

await LinkTrail.configure('lt_live_…', {
  clickTokenSource: 'pasteButton',
  autoTrackInstall: false, // required: the install fires when the button is tapped
});

// On your first-launch screen:
<LinkTrailPasteButton
  style={{ height: 46, alignSelf: 'stretch' }} // size via standard RN style
  cornerStyle="fixed"
  fillColor="#111"
  foregroundColor="#FFFFFF"
  onTokenPasted={(token) => {
    // The SDK already sent the install with this token; onLink routes the
    // recovered destination. Use this only for UI side effects.
  }}
/>
```

Don't call `trackInstallWithClickToken` from `onTokenPasted`: the tap already sent the install.
An earlier `setConsent(false)` stands unless you pass `grantsConsent={true}`; after a denial the
pasted token is still used to route the user (the install goes out with `consent: false`).

**`<LinkTrailPasteButton/>` props** (all optional; plus any `ViewProps` such as `style`):

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `grantsConsent` | `boolean` | — (grant only while undecided) | Whether the tap records consent. Omitted: grants only if the user hasn't decided yet, so an earlier `setConsent(false)` stays. `true`: always grants (only for an explicit opt-in UI). `false`: never touches consent. |
| `onTokenPasted` | `(token: string) => void` | — | Fires after the SDK reads the token. |
| `displayMode` | `'iconAndLabel' \| 'iconOnly' \| 'labelOnly'` | `'labelOnly'` | What the control shows. |
| `cornerStyle` | `'dynamic' \| 'fixed' \| 'capsule' \| 'large' \| 'medium' \| 'small'` | `'capsule'` | Corner rounding. |
| `foregroundColor` | `ColorValue` | system | Label/icon color. |
| `fillColor` | `ColorValue` | system | Button background. |
| `style` | `ViewStyle` | — | Size/layout (width, height, margins…). |

Requires **iOS 16+**. The on-screen label is the system **"Paste"** string — Apple's
`UIPasteControl` doesn't allow custom text, fonts, or borders; `displayMode`, `cornerStyle`, the two
colors, and size are the full set of what's customizable. For manual control there's also
`LinkTrail.trackInstallWithClickToken(token)` (iOS).

## Deep-link setup

Declare each LinkTrail link host as a Universal Link (iOS Associated Domains:
`applinks:kick.linktrail.io`) and in an App Links `intent-filter` (Android). LinkTrail hosts the
`apple-app-site-association` / `assetlinks.json` files for your link domains. Custom URL schemes
are your own routing: the SDK only claims `https` LinkTrail links.

**Android** — add an `autoVerify` filter to your main activity (`launchMode="singleTask"`, as in
the React Native template). React Native's `Linking` reads the intent, and the wrapper forwards it:

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="kick.linktrail.io" />
  <data android:scheme="https" android:host="go.acme.com" />
</intent-filter>
```

### iOS: forward links to React Native

React Native's `Linking` only sees a URL if your `AppDelegate` hands it to `RCTLinkingManager`.
Universal Links arrive through `continue userActivity`, so forward **both** methods; without the
second one, tapping a LinkTrail link opens the app but `onLink` never fires.

Swift `AppDelegate` (React Native 0.77+ template):

```swift
import React

// Inside your AppDelegate class:

// Custom-scheme URLs.
func application(
  _ app: UIApplication,
  open url: URL,
  options: [UIApplication.OpenURLOptionsKey: Any] = [:]
) -> Bool {
  RCTLinkingManager.application(app, open: url, options: options)
}

// Universal Links (https://kick.linktrail.io/…).
func application(
  _ application: UIApplication,
  continue userActivity: NSUserActivity,
  restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
) -> Bool {
  RCTLinkingManager.application(
    application,
    continue: userActivity,
    restorationHandler: restorationHandler
  )
}
```

Objective-C `AppDelegate.mm` (React Native 0.76 template):

```objc
#import <React/RCTLinkingManager.h>

// Inside @implementation AppDelegate:

// Custom-scheme URLs.
- (BOOL)application:(UIApplication *)application
            openURL:(NSURL *)url
            options:(NSDictionary<UIApplicationOpenURLOptionsKey, id> *)options
{
  return [RCTLinkingManager application:application openURL:url options:options];
}

// Universal Links (https://kick.linktrail.io/…).
- (BOOL)application:(UIApplication *)application
    continueUserActivity:(nonnull NSUserActivity *)userActivity
      restorationHandler:(nonnull void (^)(NSArray<id<UIUserActivityRestoring>> *_Nullable))restorationHandler
{
  return [RCTLinkingManager application:application
                   continueUserActivity:userActivity
                     restorationHandler:restorationHandler];
}
```

**Expo:** after `npx expo prebuild`, check that the generated `AppDelegate` forwards both methods
to `RCTLinkingManager`.

### `linkDomains` (required for custom domains from 0.1.0)

**Custom link domains must be listed in `linkDomains`.** The SDK claims only `https` links on
`linktrail.io` (or a subdomain) or on a `linkDomains` entry (or a subdomain):

```ts
await LinkTrail.configure('lt_live_…', { linkDomains: ['go.acme.com'] });
```

`handleDeepLink` now ignores non-LinkTrail URLs: any other URL (`mailto:`, OAuth callbacks,
`myapp://settings`, a link on an unlisted host) resolves `null`, makes no network call and doesn't
fire `onError`, so route those yourself. Custom-scheme LinkTrail links (`myapp://slug`) are no
longer handled; use the `https` link. Links on `*.linktrail.io` need no `linkDomains` entry.

**Upgrading from 0.0.x:** an empty `linkDomains` no longer means "handle every link". If you relied
on that with your own domain, list it:

```ts
// 0.0.x: worked with no linkDomains
await LinkTrail.configure('lt_live_…');
// 0.1.0: custom domains must be listed
await LinkTrail.configure('lt_live_…', { linkDomains: ['go.acme.com'] });
```

See [CHANGELOG.md](CHANGELOG.md) for the full list of 0.1.0 changes.

### `customData` values

`customData` (and `utm`) is always a `Record<string, string>`. Nested values set on the link
(objects, arrays) arrive as compact JSON strings, e.g. `{ cart: '{"sku":"aj1","qty":2}' }`;
`JSON.parse` them if you need the structure.

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
