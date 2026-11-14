# Testing

## Library checks

`npm run lint`, `npm run typecheck` and `npm run prepare` (the build). CI runs them in
`.github/workflows/ci.yml`, plus a JS bundle and an Android build of the example app;
`.github/workflows/ios.yml` builds the example for the iOS simulator.

## E2E (Maestro)

`.github/workflows/e2e.yml` runs Maestro on the example app (`example/`), which uses the wrapper
from source (`"linktrail-react-native": "file:.."`) and the native SDKs it pins (`LinkTrailSDK`
from CocoaPods, `io.linktrail:sdk` from Maven Central). It runs the same flows as the native SDK
suites, through the wrapper, on GitHub-hosted runners, on pull requests and on manual dispatch.

App ids: Android `io.linktrail.demo.store` (the `applicationId`; the Kotlin namespace stays
`com.kickflip`), iOS `io.linktrail.kickflipdemo`. Both must be in the backend's
`E2E_APP_IDENTIFIERS` for the verify check.

### Data-driven, like the native suites

- `e2e/e2e-env.json`: the one place for backend URLs, hosts and slugs per environment (`prod`, the
  default, and `dev`), the link-type links, the reward links and which newer backend checks each
  environment has deployed (`backend_checks`). A link type or reward link with no entry for the
  run's environment is **skipped with a notice**, never failed (prod has no `e2e-event` link yet).
- `e2e/e2e-flows.json`: the one table of rows (run order, kind, link slot, consent, link-type
  matrix, what each asserts). Each row runs on both platforms from `e2e/flows/<platform>/<yaml>.yaml`.
- `e2e/targets.py` resolves both for the runners (`resolve`, `jobs`) and checks they agree with the
  flow files (`validate`); `e2e/verify.py` holds the backend rules (same as the native
  `scripts/e2e-verify.py`). The `config` job runs `validate`, `e2e/tests`, shellcheck and `maestro check-syntax` on every flow.

### Rows

| Row | Kind | Link (prod) | Asserts |
| --- | --- | --- | --- |
| `consent_prompt` | offline | none | consent gate; the decision persists across a relaunch |
| `reengagement_allow` / `_deny` | open | subdomain | onLink once (reengagement) with path + voucher; deny is route-only |
| `track_event` | event | none | `trackEvent("e2e_purchase", { value: 9.99, currency: "USD" })` is acknowledged |
| `deferred_custom_allow` / `_deny` | click | custom domain (`summer-sale`) | allow: onLink once (deferred), path + voucher, 1 counted `click_token` install, not fraud; deny: nothing recorded |
| `deferred_subdomain_allow` / `_deny` | click | subdomain (`discounted-product`) | the same |
| `deferred_{custom,subdomain}_{allow,deny}_problistic` | problistic | `custom-problistic`, `ios-problistic` | a real click but no token: the install is answered (allow: attributed or organic; deny: never attributed) |
| `deferred_custom_{allow,deny}__<type>` | click | `e2e-general`, `e2e-campaign`, `e2e-influencer`, `e2e-partner` | as `deferred_custom_*`, plus `linkType` / `source` in customData; the backend's `linkType`, and the reward: per_install earned on `influencer` / `partner` allow, nothing on deny, `reward: null` on the others |
| `reengagement_type_{allow,deny}__<type>` | reopen | the type's link | installed through the link, then opened again: `openCount` +1 (allow) / unchanged (deny), `installCount` and earning unchanged |
| `deferred_event_allow` / `_deny` | reward | `e2e-event` (dev only; skipped on prod) | per_event: the reward's event x2 + one other event; earning 2 x `reward.amountMinor`; deny earns 0 |
| `deferred_revshare_allow` / `_deny` | reward | `e2e-revshare` | rev_share: one revenue event (+ the same in another currency); earning `floor(revenue x rateBps / 10000)`; deny earns 0 |

Left out on purpose: the Android Play Store install-referrer flows (they stay in the private Android
SDK repo) and the native suites' simulated / custom-scheme flows (they test the native example app's
own simulator, not the SDK). The wrapper exposes no SDK device id, so the probabilistic rows can't
run the native device lookup: they assert the install's answer only (the report says so).

How the rows stage their click:

- Android: a real click with an Android Chrome UA; its `lt_click` (from the Play Store redirect) is
  staged through the SDK's debug-only fake referrer (`setprop debug.linktrail.referrer`, a
  debuggable app). Probabilistic rows stage nothing. Re-engagement opens the https App Link when the
  manifest claims the host, else `kickflip://e2e/open?url=<link>`.
- iOS: Safari opens the link (`_stage_click.yaml`) and the interstitial stages the token on the
  clipboard, which the consent prompt's Paste control reads. Probabilistic rows clear the clipboard
  and call `trackInstall()` from the e2e panel. Re-engagement uses `kickflip://e2e/open?url=<link>`
  (an unsigned simulator build has no Associated Domains).
- Reward rows send their events through `kickflip://e2e/events?list=<JSON>`, which the example app
  sends with `trackEvent` and counts on the panel (`e2e-events`).

All values are read off an on-screen diagnostics panel that only e2e builds show (testIDs
`e2e-link-count`, `e2e-link-path`, `e2e-link-source`, `e2e-link-custom-data`, `e2e-consent`,
`e2e-attribution`, `e2e-event`, `e2e-install`, `e2e-events`; buttons `e2e-grant-consent`,
`e2e-deny-consent`, `e2e-track-event`, `e2e-track-install`).

After a click row the runner asks the backend what it recorded for that row's own click token
(`GET /v1/e2e/clicks/<token>`, header `X-E2E-Token`): allow polls until it matches; deny holds the
whole window, so a late install shows. A check an environment hasn't deployed
(`backend_checks: false`) is noted as skipped on the row, never passed or failed. Each run writes
`e2e/results-<platform>.jsonl` and a table in the job summary.

### Environments, secrets and variables

| Name | Kind | Purpose |
| --- | --- | --- |
| `LINKTRAIL_KEY` | secret | SDK key of the prod workspace, bundled into the e2e build only |
| `LINKTRAIL_TEST_KEY` | secret | SDK key of the dev workspace (dev runs only) |
| `E2E_TOKEN` | secret | `X-E2E-Token` for the backend check |
| `E2E_ENV` | variable | environment of pull request runs (default `prod`) |
| `NATIVE_VERSION_STRICT` | variable | `false` to only warn on native SDK drift (the CI check fails on drift by default) |

A manual run picks the environment (`prod` | `dev`) and the link types (`all`, `none` or a comma
list). Without the environment's key and `E2E_TOKEN` (for example on a pull request from a fork)
only `consent_prompt` runs and the other rows are skipped with a notice. `dev` points the Android
debug app at the dev backend (`setprop debug.linktrail.base`); the iOS wrapper ships the binary SDK,
which has no backend override, so iOS skips the real rows on `dev` with a notice.

### How the key reaches the build

The runners write the key and the environment's link hosts to `example/e2e.config.local.json`
(gitignored, removed when the run ends). `example/metro.config.js` resolves the
`kickflip-e2e-config` module to that file when it exists and to
`example/src/e2e/config.default.json` (e2e off, placeholder key) otherwise. The key is never passed
on a command line or printed; curl reads the secret headers from stdin.

The Android build bundles the JS into the **debug** APK (`-PbundleDebugJs`) so it runs without
Metro and stays debuggable, which the SDK's fake referrer requires. iOS builds **Release** for the
simulator, which bundles the JS.

### Run locally

```sh
npm ci && (cd example && npm install && bundle install)
python3 -I e2e/targets.py validate                  # config + flow table + flow files
python3 -I -m unittest discover -s e2e/tests        # the runners' rules
python3 -I e2e/targets.py jobs --platform ios       # what a run would do

# Android: a booted emulator (e.g. LinkTrail_API35)
bash e2e/android.sh                                 # all rows; real ones only with the secrets set
bash e2e/android.sh consent_prompt                  # one row
bash e2e/android.sh deferred_custom_allow__partner  # one link-type row
bash e2e/android.sh reward                          # one kind

# iOS: a booted simulator
bash e2e/ios.sh
DEVICE=<udid> bash e2e/ios.sh consent_prompt
```

`LINKTRAIL_KEY=… E2E_TOKEN=… bash e2e/android.sh` runs the real rows (`LINKTRAIL_ENV=dev` with
`LINKTRAIL_TEST_KEY` for dev). They make real clicks on real links, so prefer CI for them.
`SKIP_BUILD=1` reuses the last build; `E2E_LINK_TYPES=none` skips the link-type rows.

On a Mac shared with other simulator jobs, take the lock first:
`pid="$(bash e2e/sim-lock.sh acquire)"; …; bash e2e/sim-lock.sh release "$pid"`.

### Native SDK versions

`e2e/check-native-versions.sh` compares the versions the wrapper pins
(`LinktrailReactNative.podspec`, `android/build.gradle`) with the latest on CocoaPods trunk and
Maven Central. Locally it only warns unless `STRICT=1`; in CI it fails on drift (set the
`NATIVE_VERSION_STRICT` variable to `false` to only warn).
