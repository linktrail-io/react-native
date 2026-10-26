# Testing

## Library checks

`npm run lint`, `npm run typecheck` and `npm run prepare` (the build). CI runs them in
`.github/workflows/ci.yml`, plus a JS bundle and an Android build of the example app;
`.github/workflows/ios.yml` builds the example for the iOS simulator.

## Smoke e2e (Maestro)

`.github/workflows/e2e.yml` runs a small Maestro suite on the example app (`example/`), which uses
the wrapper from source (`"linktrail-react-native": "file:.."`) and the native SDKs it pins
(`LinkTrailSDK` from CocoaPods, `io.linktrail:sdk` from Maven Central). It runs on pull requests
and on manual dispatch.

| Flow | Android | iOS | Needs secrets |
| --- | --- | --- | --- |
| `consent_prompt` | consent gate shows; Deny persists across a relaunch | gate shows; Skip stays undecided; a grant persists | no |
| `deferred_allow` | real click, fake Play referrer, Allow | Safari stages the click token on the clipboard, Allow + Paste | yes |
| `deferred_deny` | the same with Deny | the same with Deny | yes |
| `reengagement` | https App Link while installed | `kickflip://e2e/open?url=<link>` → `handleDeepLink` | yes |
| `track_event` | `trackEvent("e2e_purchase", { value: 9.99, currency: "USD" })` | the same | yes |

The deferred and re-engagement flows assert that the JS `onLink` listener fired **exactly once**,
with the linked `path` (`/products/aj1`), `source` and `customData` (`voucher=SUMMER25`). The
values are read off an on-screen diagnostics panel (testIDs `e2e-link-count`, `e2e-link-path`,
`e2e-link-source`, `e2e-link-custom-data`, `e2e-consent`, `e2e-attribution`, `e2e-event`) that
only e2e builds show.

After each deferred flow the runner asks the backend what it recorded for that flow's own click
token (`GET /v1/e2e/clicks/<token>`, header `X-E2E-Token`):

- allow: `installRecorded`, `attributed`, `matchType == "click_token"`, `installCount == 1`;
- deny: `installRecorded == false`, `installCount == 0`, held for the whole polling window.

### Secrets and variables

| Name | Kind | Purpose |
| --- | --- | --- |
| `LINKTRAIL_KEY` | secret | Workspace SDK key, bundled into the e2e build only |
| `E2E_TOKEN` | secret | `X-E2E-Token` for the backend check |
| `E2E_ANDROID_DEFERRED` | variable | `true` once the pinned `io.linktrail:sdk` has the debug fake referrer (after 0.0.5) |
| `NATIVE_VERSION_STRICT` | variable | `true` to fail the native version check on drift |

Without both secrets (for example on a pull request from a fork) only `consent_prompt` runs and the
other flows are skipped with a notice. Fork pull requests never run on the self-hosted Mac.

### How the key reaches the build

The runners write the key to `example/e2e.config.local.json` (gitignored, removed when the run
ends). `example/metro.config.js` resolves the `kickflip-e2e-config` module to that file when it
exists and to `example/src/e2e/config.default.json` (e2e off, placeholder key) otherwise. The key is
never passed on a command line or printed; curl reads the secret headers from stdin.

The Android build bundles the JS into the **debug** APK (`-PbundleDebugJs`) so it runs without
Metro and stays debuggable, which the SDK's fake referrer requires. iOS builds **Release** for the
simulator, which bundles the JS.

### Run locally

```sh
npm ci && (cd example && npm install && bundle install)

# Android: a booted emulator (e.g. LinkTrail_API35)
bash e2e/android.sh                    # all flows; real ones only with the secrets set
bash e2e/android.sh consent_prompt     # one flow

# iOS: a booted simulator
bash e2e/ios.sh
DEVICE=<udid> bash e2e/ios.sh consent_prompt
```

`LINKTRAIL_KEY=… E2E_TOKEN=… bash e2e/android.sh` runs the real flows. They make real clicks on
production links, so prefer CI for them. `SKIP_BUILD=1` reuses the last build.

On a Mac shared with other simulator jobs, take the lock first:
`pid="$(bash e2e/sim-lock.sh acquire)"; …; bash e2e/sim-lock.sh release "$pid"`.

### Native SDK versions

`e2e/check-native-versions.sh` compares the versions the wrapper pins
(`LinktrailReactNative.podspec`, `android/build.gradle`) with the latest on CocoaPods trunk and
Maven Central. It only warns for now; `STRICT=1` (or the `NATIVE_VERSION_STRICT` variable in CI)
makes a drift fail.
