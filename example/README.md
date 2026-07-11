# KickFlip — LinkTrail React Native demo

A small storefront showing how the **LinkTrail** SDK's deferred deep linking drives where a user
lands after installing. It consumes `linktrail-react-native` from the repo root (as a local
`file:..` dependency) — the same API an external app would use. This is the React Native port of
the native [iOS](https://github.com/linktrail-io/ios-sdk/tree/main/example) and
[Android](https://github.com/linktrail-io/android-sdk/tree/main/example) KickFlip examples.

## Run it

### 1. Add your API key

Open [`src/attribution.ts`](src/attribution.ts) and replace the placeholder with your workspace
SDK key (`lt_live_…`, from the LinkTrail dashboard):

```ts
const API_KEY = 'lt_live_REPLACE_WITH_YOUR_KEY'; // ← paste your key here
```

Without a valid key the backend returns 401, surfaced via `onError` (you'll see a console
warning). The deep-link **simulator still works without a key** — it fabricates links locally —
so you can explore the UI first and add the key only when you want the real install/open calls to
authenticate.

### 2. Build and run

```sh
npm install

# Android
npm run android

# iOS
cd ios && bundle install && bundle exec pod install && cd ..
npm run ios
```

## The app

Two screens, nothing more:

- **Home** — a category bar on top (All · Basketball · Running · Lifestyle · Skate) and a grid of products.
- **Product** — one product. If a voucher was delivered in the deep link, it shows the voucher badge, the discounted price, and how much you saved.

## The four deferred deep-link scenarios

Tap the **🔗 link button** (top-right) and fire any of these. Each is a real `LinkTrailDeepLink` —
the same object your `onLink` handler receives from a real install.

| Scenario | Deep link | Where you land |
|---|---|---|
| 1 · Just the store | `path: "/"` | Home |
| 2 · Category selected | `path: "/category/running"` | Home with **Running** pre-selected |
| 3 · A product | `path: "/products/aj1"` | The Air Jordan 1 product page |
| 4 · Product + voucher | `path: "/products/aj1"`, `customData: { voucher: "SUMMER25", discountPercent: "25" }` | Product page with **SUMMER25 −25%** applied |

The simulator fabricates the deferred link locally so you don't need a real click → install
round-trip. In production these arrive from the SDK — no code changes in the app.

## How it maps to the SDK

The whole integration is one file — [`src/attribution.ts`](src/attribution.ts) — wired up once:

```ts
await LinkTrail.configure(API_KEY, { linkDomains: ['kick.linktrail.io'] });
LinkTrail.onLink((link, source) => dispatch({ type: 'route-link', link, source }));
```

| SDK touchpoint | Where |
|---|---|
| `LinkTrail.configure(apiKey, options)` at launch | [`src/attribution.ts`](src/attribution.ts) |
| `onLink((link, source) => …)` — the one routing hook | [`src/attribution.ts`](src/attribution.ts) → [`src/store.ts`](src/store.ts) |
| `route-link` case that reads `link.path` / `link.customData` | [`src/store.ts`](src/store.ts) |

The simulator and real installs hit the exact same `route-link` code path.

## Test from the terminal

While the app is installed, fire the custom scheme from a terminal:

```sh
# iOS simulator
xcrun simctl openurl booted "kickflip://products/aj1?voucher=SUMMER25&discountPercent=25"

# Android
adb shell am start -a android.intent.action.VIEW \
  -d "kickflip://products/aj1?voucher=SUMMER25\&discountPercent=25"
```

Real LinkTrail links (`https://kick.linktrail.io/l/…`) go through the SDK: the wrapper forwards
them automatically and your routing runs in `onLink` with source `reengagement`.
