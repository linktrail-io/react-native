#!/usr/bin/env bash
#
# iOS e2e for the React Native wrapper: builds the example app (wrapper from source, native
# LinkTrailSDK from CocoaPods trunk) in Release for the simulator, so the JS is bundled and no Metro
# server is needed, then runs the rows of e2e/e2e-flows.json from e2e/flows/ios on a booted
# simulator, against the links of e2e/e2e-env.json (see TESTING.md).
#
# Click rows open the link in Safari (_stage_click.yaml): the interstitial makes a real click and
# stages lt_click on the clipboard, which the app's Paste control reads. The probabilistic rows
# clear the clipboard after the click, so only the backend's IP match can attribute. Re-engagement
# opens kickflip://e2e/open?url=<link> (an unsigned simulator build has no Associated Domains).
# The wrapper ships the binary LinkTrailSDK, which has no backend override, so an environment with
# override_backend (dev) skips the real rows with a notice.
#
# Usage: bash e2e/ios.sh [row|flow|kind…]
# Env:   see e2e/lib.sh; DEVICE (udid; default: first booted simulator), SKIP_BUILD=1 to reuse
#        the last build, BUILD_ONLY=1 to only build, SKIP_PODS=1 to skip pod install.
set -euo pipefail
export PATH="$HOME/.maestro/bin:$PATH:/opt/homebrew/bin:/usr/local/bin"   # CI non-login shell; appended so a pinned Ruby (setup-ruby) wins

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLATFORM=ios
# shellcheck source=e2e/lib.sh
source "$ROOT/e2e/lib.sh"

APP_ID="io.linktrail.kickflipdemo"
FLOW_DIR="$ROOT/e2e/flows/ios"
DERIVED="$ROOT/example/ios/build-e2e"
APP="$DERIVED/Build/Products/Release-iphonesimulator/KickFlip.app"
export MAESTRO_DRIVER_STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-120000}"

trap cleanup_lib EXIT

if [ "${SKIP_BUILD:-0}" != 1 ]; then
  if [ "${SKIP_PODS:-0}" != 1 ]; then
    echo "==> pod install"
    (cd "$ROOT/example/ios" && for i in 1 2 3; do bundle exec pod install && exit 0; echo "pod install attempt $i failed; retrying"; sleep 5; done; exit 1)
  fi
  echo "==> Building the example (Release, simulator; JS bundled)"
  write_config
  mkdir -p "$DERIVED"
  # The key is only in the gitignored config Metro reads; never an xcodebuild argument (those are
  # echoed into the build log).
  if ! (cd "$ROOT/example/ios" && xcodebuild -workspace KickFlip.xcworkspace -scheme KickFlip \
      -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
      -derivedDataPath "$DERIVED" CODE_SIGNING_ALLOWED=NO build > "$DERIVED/build.log" 2>&1); then
    echo "ERROR: build failed:"; tail -40 "$DERIVED/build.log"; exit 1
  fi
  remove_config
fi
[ -d "$APP" ] || { echo "ERROR: $APP not found"; exit 1; }
[ "${BUILD_ONLY:-0}" = 1 ] && { echo "==> Built $APP"; exit 0; }

command -v maestro >/dev/null 2>&1 || { echo "ERROR: maestro not found (curl -Ls https://get.maestro.mobile.dev | bash)"; exit 1; }
DEVICE="${DEVICE:-$(xcrun simctl list devices booted | grep -oiE '[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}' | head -1 || true)}"
[ -n "$DEVICE" ] || { echo "ERROR: no booted simulator (boot one, or set DEVICE)"; exit 1; }
echo "-- device: $DEVICE"

if [ -n "$BASE_OVERRIDE" ]; then
  REAL_SKIP="the iOS wrapper's binary SDK cannot point at the $LINKTRAIL_ENV backend (no LINKTRAIL_BASE in Release)"
fi

# The XCUITest driver on iOS sims can die mid-run and stays dead; a retry reinstalls it.
REINSTALL=""
run_maestro() {
  local label="$1"; shift
  echo "   maestro: $label"
  # shellcheck disable=SC2086  # $REINSTALL is empty or one flag
  maestro $REINSTALL --device "$DEVICE" test "$@"
  local rc=$?
  REINSTALL=""
  return $rc
}

reset_driver() {
  pkill -f 'XCTestRunner|WebDriverAgent' >/dev/null 2>&1 || true
  REINSTALL="--reinstall-driver"; sleep 10
}

install_fresh() {
  xcrun simctl uninstall "$DEVICE" "$APP_ID" >/dev/null 2>&1 || true
  xcrun simctl install "$DEVICE" "$APP" >/dev/null || return 1
  # Probabilistic rows (and rows without a click) start from an empty clipboard.
  [ -n "$TOKEN" ] || printf '' | xcrun simctl pbcopy "$DEVICE"
}

# stage_click <url> <token|no-token>: Safari opens <url>; the interstitial makes a real click and
# stages lt_click=<token> on the clipboard. token: keep it there for the Paste control (TOKEN set).
stage_click() {
  local token
  printf '' | xcrun simctl pbcopy "$DEVICE"
  run_maestro "stage-click" -e LINK_URL="$1" "$FLOW_DIR/_stage_click.yaml" \
    || { FAIL_STEP="maestro: _stage_click"; FAIL_ERROR="Safari step failed"; return 1; }
  token="$({ xcrun simctl pbpaste "$DEVICE" 2>/dev/null || true; } | grep -oE 'lt_click=[0-9a-fA-F]{32}' | head -1 | cut -d= -f2 || true)"
  if [ "$2" != token ]; then
    # Probabilistic: the click is the page load; whatever was staged is cleared, never pasted.
    printf '' | xcrun simctl pbcopy "$DEVICE"
    echo "   click made${token:+ (${token:0:8}…, cleared)}"
    [ -z "$token" ] || wait_click "$token"
    return
  fi
  if [ -z "$token" ]; then
    FAIL_STEP="real click"; FAIL_ERROR="no lt_click token on the clipboard after the Safari step"
    [ "$(curl -sS -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || true)" = 404 ] && FAIL_ERROR="$LINKTRAIL_ENV link ${1##*/} not created"
    return 1
  fi
  echo "   click ${token:0:8}… staged"
  wait_click "$token" || return 1
  TOKEN="$token"
}

open_url_for() {
  printf 'kickflip://e2e/open?url=%s' "$(python3 -I -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1")"
}

run_all "$@"
