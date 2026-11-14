#!/usr/bin/env bash
#
# Android e2e for the React Native wrapper: builds the example app (wrapper from source, native
# io.linktrail:sdk from Maven) with the JS bundled in, then runs the rows of e2e/e2e-flows.json from
# e2e/flows/android on a booted emulator, against the links of e2e/e2e-env.json (see TESTING.md).
#
# Click rows make a real click with an Android Chrome UA, take lt_click from the Play Store redirect
# and stage it through the SDK's debug-only fake referrer (setprop debug.linktrail.referrer, a
# debuggable app); the probabilistic rows stage nothing. An environment with override_backend points
# the debug app at its backend (setprop debug.linktrail.base). Re-engagement opens the https App Link
# when the app's manifest claims the host (approved for the app first), else kickflip://e2e/open.
#
# Usage: bash e2e/android.sh [row|flow|kind…]
# Env:   see e2e/lib.sh; SKIP_BUILD=1 reuses the last APK, BUILD_ONLY=1 only builds it (CI builds
#        before booting the emulator).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLATFORM=android
# shellcheck source=e2e/lib.sh
source "$ROOT/e2e/lib.sh"

APP_ID="io.linktrail.demo.store"
FLOW_DIR="$ROOT/e2e/flows/android"
APK="$ROOT/example/android/app/build/outputs/apk/debug/app-debug.apk"
MANIFEST="$ROOT/example/android/app/src/main/AndroidManifest.xml"
# Android Chrome UA: the redirect sends Android clicks to the Play Store with &referrer=lt_click=<token>.
ANDROID_UA="Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"

reset_props() {
  adb shell setprop debug.linktrail.referrer "''" >/dev/null 2>&1 || true
  adb shell setprop debug.linktrail.base "''" >/dev/null 2>&1 || true
}
cleanup() { cleanup_lib; [ "${BUILD_ONLY:-0}" = 1 ] || reset_props; }
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

MAESTRO=(maestro)
[ -n "${ANDROID_SERIAL:-}" ] && MAESTRO+=(--device "$ANDROID_SERIAL")
run_maestro() { local label="$1"; shift; echo "   maestro: $label"; "${MAESTRO[@]}" test "$@"; }

reset_driver() {
  adb forward --remove-all >/dev/null 2>&1 || true
  adb uninstall dev.mobile.maestro >/dev/null 2>&1 || true
  adb uninstall dev.mobile.maestro.test >/dev/null 2>&1 || true
  sleep 3
}

install_fresh() {
  adb uninstall "$APP_ID" >/dev/null 2>&1 || true
  [ -n "$TOKEN" ] || adb shell setprop debug.linktrail.referrer "''" >/dev/null 2>&1 || true
  if [ -n "$BASE_OVERRIDE" ]; then adb shell setprop debug.linktrail.base "$BASE_OVERRIDE"
  else adb shell setprop debug.linktrail.base "''" >/dev/null 2>&1 || true; fi
  adb install -t "$APK" >/dev/null || return 1
  # Approve the link hosts for the app so an https App Link opens it, not the browser (Android 12+).
  adb shell pm set-app-links-user-selection --user 0 --package "$APP_ID" true "$SUBDOMAIN_HOST" "$CUSTOM_HOST" >/dev/null 2>&1 || true
  # Slow CI emulators raise "System UI isn't responding" over the app; hide ANR dialogs.
  adb shell settings put global hide_error_dialogs 1 >/dev/null 2>&1 || true
  adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1 || true
}

# stage_click <url> <token|no-token>: a real click with an Android UA; token: wait until the backend
# knows it and stage it as the fake Play referrer.
stage_click() {
  local redirect token
  adb shell setprop debug.linktrail.referrer "''" >/dev/null 2>&1 || true
  redirect="$(curl -sS -o /dev/null -A "$ANDROID_UA" -w '%{redirect_url}' "$1" 2>/dev/null || true)"
  token="$(printf '%s' "$redirect" | grep -oE 'lt_click(%3D|=)[0-9a-f]{32}' | head -1 | grep -oE '[0-9a-f]{32}$' || true)"
  if [ -z "$token" ]; then
    FAIL_STEP="real click"; FAIL_ERROR="no lt_click in the Play Store redirect for $1"
    [ "$(curl -sS -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || true)" = 404 ] && FAIL_ERROR="$LINKTRAIL_ENV link ${1##*/} not created"
    return 1
  fi
  echo "   click ${token:0:8}… made"
  wait_click "$token" || return 1
  [ "$2" = token ] || return 0
  TOKEN="$token"
  adb shell setprop debug.linktrail.referrer "lt_click=$token"
}

# open_url_for <url>: the https App Link when the manifest claims its host, else the e2e hook.
open_url_for() {
  local host="${1#https://}"; host="${host%%/*}"
  if [ -n "$host" ] && grep -q "android:host=\"$host\"" "$MANIFEST"; then printf '%s' "$1"
  else printf 'kickflip://e2e/open?url=%s' "$(python3 -I -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1")"; fi
}

run_all "$@"
