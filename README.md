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

// Revenue — see "Tracking revenue" below:
await LinkTrail.trackRevenue({ transactionId: '2000000123456', value: 9.99, currency: 'USD' });

// Cached results:
const attribution = await LinkTrail.getLastAttribution();
const lastLink = await LinkTrail.getLastDeepLink();
 
// iOS ATT / SKAdNetwork (no-ops on Android):
await LinkTrail.requestTrackingAuthorization();
LinkTrail.registerForSKAdAttribution();
LinkTrail.updateConversionValue(42, 'medium');
```

`configure` also takes `{ logEnabled, logLevel, requestTimeoutMillis, retryPolicy, linkDomains,
autoTrackInstall, requireConsent, clickTokenSource, autoHandleLinks }`. Set `autoHandleLinks: false`
to forward URLs yourself via `LinkTrail.handleDeepLink(url)`.

### Tracking revenue

`trackRevenue` reports an in-app purchase or subscription payment (revenue / ROAS). JS purchase
libraries don't expose StoreKit/Play Billing objects, so you pass the store's values yourself:

| Field | Value |
| --- | --- |
| `transactionId` | The store's unique id for the payment — the **dedupe key**. iOS: StoreKit `transactionId` (use the *transaction* id, not `originalTransactionId`, so each renewal counts). Android: Google Play `orderId` (e.g. `GPA.1234-5678-9012-34567`). 1–255 characters. |
| `value` | Amount charged, `>= 0` (rounded to 2 decimals). |
| `currency` | 3-letter ISO 4217 code, case-insensitive (`'usd'` becomes `'USD'`). |
| `productId` | Optional store product id. |

```ts
import LinkTrail, { LinkTrailRevenueError } from 'linktrail-react-native';

// react-native-iap — in the purchase listener, for a verified purchase:
purchaseUpdatedListener(async (purchase) => {
  await LinkTrail.trackRevenue({
    transactionId: purchase.transactionId!, // iOS: StoreKit transaction id; Android: Play orderId
    value: Number(product.price),   // numeric price from your product object
    currency: product.currency,
    productId: purchase.productId,
  }).catch(() => {}); // failures are queued natively and retried
  await finishTransaction({ purchase, isConsumable: false });
});

// expo-iap: same shape in its purchase callback (transactionId / orderId, price, currency).

// RevenueCat — in Purchases.addCustomerInfoUpdateListener / after purchasePackage():
const { transaction, productIdentifier } = await Purchases.purchasePackage(pkg);
await LinkTrail.trackRevenue({
  transactionId: transaction.transactionIdentifier, // StoreKit transaction id / Play orderId
  value: pkg.product.price,
  currency: pkg.product.currencyCode,
  productId: productIdentifier,
});
```

The snippets are illustrative: check which field your library exposes for the StoreKit transaction id
and the Play `orderId`, and always send the same id for the same payment.

**Retries are safe.** The server dedupes on `transactionId`, and the native SDK also remembers ids it
has delivered. Calling `trackRevenue` twice for the same purchase (a retried callback, restored
purchases, several listeners) never double-counts — the repeat resolves with `duplicate: true`.
Failed deliveries are queued and retried natively; the returned promise rejects so you can observe the
first failure. Like `trackEvent`, it honors `requireConsent`.

The promise resolves with `{ id?, attributed, duplicate }`. Invalid input (blank or over-long
`transactionId`, negative/non-finite `value`, non-3-letter `currency`) rejects with a
`LinkTrailRevenueError` whose `code` is `invalid_transaction_id`, `invalid_value` or `invalid_currency`;
nothing is sent. Requires native SDKs that include the revenue API (see the CHANGELOG).

### Consent gating

`requireConsent` (default `true`) gates attribution/tracking behind the user's decision —
**deny-by-default** for GDPR / ePrivacy. While consent is unset or denied the SDK holds the install
and drops events, but **deep links still route** (`onLink` fires) so the user reaches their
destination. The SDK exposes **no consent getter** — your app is the source of truth: persist the
choice and replay it with `setConsent` on every launch after `configure`.

```ts
await LinkTrail.configure('lt_live_…', { requireConsent: true });

// After your consent UI resolves (persist the choice yourself, e.g. AsyncStorage):
LinkTrail.setConsent(true);   // releases the held install + flushes queued events
LinkTrail.setConsent(false);  // stops sending + drops the queue

// On the next launch, replay the stored decision right after configure:
LinkTrail.setConsent(storedGranted);
```

Set `requireConsent: false` to attribute at init without a consent step. See the example app's
[`src/consent.ts`](example/src/consent.ts) for the persist-and-replay pattern.

### Deferred attribution & the paste button (iOS)

On iOS, deferred attribution recovers a **click token** the tapped link left on the clipboard.
`clickTokenSource` (in `configure`) picks how it's read:

- **`'automatic'`** — the SDK reads the clipboard itself at install. Needs no UI, but iOS shows the
  system **"Allow Paste"** alert on first launch.
- **`'pasteButton'`** (default) — the token is read **only** when the user taps
  `<LinkTrailPasteButton/>` (Apple's `UIPasteControl`), with **no "Allow Paste" alert**. You render
  the button and set **`autoTrackInstall: false`** so the install waits for the tap.
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
    // The SDK already fired the install with this token; onLink routes the
    // recovered destination. Use this only for UI side effects.
  }}
/>
```

**`<LinkTrailPasteButton/>` props** (all optional; plus any `ViewProps` such as `style`):

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
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
