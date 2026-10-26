#!/usr/bin/env bash
#
# Android smoke e2e for the React Native wrapper: builds the example app (wrapper from source,
# native io.linktrail:sdk from Maven) with the JS bundled in, then runs the Maestro flows in
# e2e/flows/android on a booted emulator.
#
#   consent_prompt   offline: the consent gate shows, Deny persists across a relaunch.
#   deferred_allow   real click → fake Play referrer → Allow → onLink once (path + customData),
#                    then the backend recorded 1 attributed click_token install.
#   deferred_deny    the same with Deny → the backend recorded nothing.
#   reengagement     https App Link while installed → onLink (source reengagement).
#   track_event      trackEvent with a value → resolved by the backend.
#
# The deferred flows stage the click through the SDK's debug-only fake referrer
# (adb shell setprop debug.linktrail.referrer "lt_click=<token>"), which needs a debuggable app
# and an io.linktrail:sdk release that has it (after 0.0.5). Until the wrapper pins such a release,
# set E2E_ANDROID_DEFERRED=0 to skip them with a notice.
#
# Usage: bash e2e/android.sh [flow…]
# Env:   LINKTRAIL_KEY, E2E_TOKEN (see e2e/lib.sh), RETRIES (3), CLICK_WAIT (60),
#        E2E_ANDROID_DEFERRED (1), SKIP_BUILD=1 to reuse the last APK, BUILD_ONLY=1 to only
#        build it (CI builds before booting the emulator).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=e2e/lib.sh
source "$ROOT/e2e/lib.sh"

APP_ID="io.linktrail.example"
FLOW_DIR="$ROOT/e2e/flows/android"
APK="$ROOT/example/android/app/build/outputs/apk/debug/app-debug.apk"
CLICK_WAIT="${CLICK_WAIT:-60}"
E2E_ANDROID_DEFERRED="${E2E_ANDROID_DEFERRED:-1}"
# Android Chrome UA: the redirect sends Android clicks to the Play Store with &referrer=lt_click=<token>.
ANDROID_UA="Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"

reset_props() { adb shell setprop debug.linktrail.referrer "''" >/dev/null 2>&1 || true; }
cleanup() { remove_config; [ "${BUILD_ONLY:-0}" = 1 ] || reset_props; }
trap cleanup EXIT

if [ "${SKIP_BUILD:-0}" != 1 ]; then
  echo "==> Building the example (JS bundled into the debug APK)"
  write_config
  (cd "$ROOT/example/android" && ./gradlew :app:assembleDebug -PbundleDebugJs -q)
  remove_config
fi
[ -f "$APK" ] || { echo "ERROR: $APK not found"; exit 1; }
[ "${BUILD_ONLY:-0}" = 1 ] && { echo "==> Built $APK"; exit 0; }

command -v maestro >/dev/null 2>&1 || { echo "ERROR: maestro not found (curl -Ls https://get.maestro.mobile.dev | bash)"; exit 1; }
command -v adb >/dev/null 2>&1 || { echo "ERROR: adb not found (Android platform-tools)"; exit 1; }
adb get-state >/dev/null 2>&1 || { echo "ERROR: no booted emulator/device (adb devices)"; exit 1; }

if [ "$#" -gt 0 ]; then
  FLOWS=(); for f in "$@"; do FLOWS+=("$(basename "${f%.yaml}")"); done
else
  FLOWS=(consent_prompt deferred_allow deferred_deny reengagement track_event)
fi

reset_maestro() {
  adb forward --remove-all >/dev/null 2>&1 || true
  adb uninstall dev.mobile.maestro >/dev/null 2>&1 || true
  adb uninstall dev.mobile.maestro.test >/dev/null 2>&1 || true
}

# Slow CI emulators raise "System UI isn't responding" over the app; hide ANR dialogs.
settle_device() {
  adb shell settings put global hide_error_dialogs 1 >/dev/null 2>&1 || true
  adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1 || true
}

# real_click: a real click with an Android UA; prints the lt_click token from the Play redirect.
real_click() {
  local redirect token
  redirect="$(curl -sS -o /dev/null -A "$ANDROID_UA" -w '%{redirect_url}' "$LINK_URL")" || return 1
  token="$(printf '%s' "$redirect" | grep -oE 'lt_click(%3D|=)[0-9a-f]{32}' | head -1 | grep -oE '[0-9a-f]{32}$' || true)"
  [ -n "$token" ] || { echo "   no lt_click token in the redirect for $LINK_URL" >&2; return 1; }
  printf '%s' "$token"
}

# wait_click <token>: until GET /v1/events/click/<token> answers 200 for this workspace's key.
wait_click() {
  local code="" waited=0
  while [ "$waited" -lt "$CLICK_WAIT" ]; do
    code="$(printf 'header = "X-API-Key: %s"\n' "$LINKTRAIL_KEY" \
      | curl -sS -o /dev/null -w '%{http_code}' --max-time 10 --config - "$BACKEND_URL/v1/events/click/$1" 2>/dev/null || true)"
    [ "$code" = 200 ] && return 0
    sleep 2; waited=$((waited + 2))
  done
  echo "   click not visible to this key after ${CLICK_WAIT}s (last status: ${code:-none})" >&2
  return 1
}

# run_once <flow name>: fresh install, stage what the flow needs, run it, check the backend.
run_once() {
  local name="$1" token=""
  adb uninstall "$APP_ID" >/dev/null 2>&1 || true
  reset_props
  if [[ "$name" == deferred_* ]]; then
    token="$(real_click)" || return 1
    echo "   click ${token:0:8}… made; waiting for the backend"
    wait_click "$token" || return 1
    adb shell setprop debug.linktrail.referrer "lt_click=$token"
  fi
  adb install -t "$APK" >/dev/null
  if [ "$name" = reengagement ]; then
    # Approve the link host for the app so the https link opens it, not the browser (Android 12+).
    adb shell pm set-app-links-user-selection --user 0 --package "$APP_ID" true "$LINK_HOST" >/dev/null 2>&1 || true
  fi
  settle_device
  maestro test -e LINK_URL="$LINK_URL" "$FLOW_DIR/$name.yaml" || return 1
  verify_click "$name" "$token"
}

fail=0
for name in "${FLOWS[@]}"; do
  [ -f "$FLOW_DIR/$name.yaml" ] || { echo "ERROR: no flow $FLOW_DIR/$name.yaml"; fail=1; continue; }
  if flow_needs_backend "$name" && [ "$HAVE_SECRETS" != 1 ]; then
    notice "android/$name skipped: LINKTRAIL_KEY and E2E_TOKEN are not set"; continue
  fi
  if [[ "$name" == deferred_* ]] && [ "$E2E_ANDROID_DEFERRED" != 1 ]; then
    notice "android/$name skipped: E2E_ANDROID_DEFERRED=0 (the pinned io.linktrail:sdk has no debug referrer yet)"; continue
  fi
  ok=0
  for attempt in $(seq 1 "$RETRIES"); do
    echo "==> android/$name (attempt $attempt/$RETRIES)"
    if run_once "$name"; then ok=1; break; fi
    echo "   attempt failed; resetting the Maestro driver"
    reset_maestro; sleep 3
  done
  if [ "$ok" = 1 ]; then echo "OK: android/$name"; else echo "FAILED: android/$name"; fail=1; fi
done

[ "$fail" = 0 ] || { echo "==> Some Android e2e flows failed"; exit 1; }
echo "==> All Android e2e flows passed"
