#!/usr/bin/env bash
#
# iOS smoke e2e for the React Native wrapper: builds the example app (wrapper from source,
# native LinkTrailSDK from CocoaPods trunk) in Release for the simulator, so the JS is bundled and
# no Metro server is needed, then runs the Maestro flows in e2e/flows/ios on a booted simulator.
#
#   consent_prompt   offline: the consent gate shows, Skip stays undecided, a grant persists.
#   deferred_allow   Safari stages a real click token on the clipboard → Allow + Paste → onLink once
#                    (path + customData), then the backend recorded 1 attributed click_token install.
#   deferred_deny    the same with Deny → the backend recorded nothing.
#   reengagement     kickflip://e2e/open?url=<link> → handleDeepLink → onLink (source reengagement).
#   track_event      trackEvent with a value → resolved by the backend.
#
# Usage: bash e2e/ios.sh [flow…]
# Env:   LINKTRAIL_KEY, E2E_TOKEN (see e2e/lib.sh), RETRIES (3), DEVICE (udid; default: first
#        booted simulator), SKIP_BUILD=1 to reuse the last build, BUILD_ONLY=1 to only build,
#        SKIP_PODS=1 to skip pod install.
set -euo pipefail
export PATH="$HOME/.maestro/bin:$PATH:/opt/homebrew/bin:/usr/local/bin"   # CI non-login shell; appended so a pinned Ruby (setup-ruby) wins

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=e2e/lib.sh
source "$ROOT/e2e/lib.sh"

APP_ID="io.linktrail.kickflipdemo"
FLOW_DIR="$ROOT/e2e/flows/ios"
DERIVED="$ROOT/example/ios/build-e2e"
APP="$DERIVED/Build/Products/Release-iphonesimulator/KickFlip.app"
export MAESTRO_DRIVER_STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-120000}"

trap remove_config EXIT

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


if [ "$#" -gt 0 ]; then
  FLOWS=(); for f in "$@"; do FLOWS+=("$(basename "${f%.yaml}")"); done
else
  FLOWS=(consent_prompt deferred_allow deferred_deny reengagement track_event)
fi

# capture_token: the 32-hex lt_click token the interstitial staged on the clipboard, or nothing.
capture_token() {
  { xcrun simctl pbpaste "$DEVICE" 2>/dev/null || true; } | grep -oE 'lt_click=[0-9a-fA-F]{32}' | head -1 | cut -d= -f2 || true
}

# run_once <flow name> <driver flag>: fresh install, stage what the flow needs, run, check backend.
run_once() {
  local name="$1" reinstall="$2" token="" open_url
  xcrun simctl uninstall "$DEVICE" "$APP_ID" >/dev/null 2>&1 || true
  xcrun simctl install "$DEVICE" "$APP" >/dev/null || return 1
  printf '' | xcrun simctl pbcopy "$DEVICE"
  if [[ "$name" == deferred_* ]]; then
    # shellcheck disable=SC2086  # $reinstall is empty or one flag
    maestro $reinstall --device "$DEVICE" test -e LINK_URL="$LINK_URL" "$FLOW_DIR/_stage_click.yaml" || return 1
    token="$(capture_token)"
    [ -n "$token" ] || { echo "   no lt_click token on the clipboard after the Safari step" >&2; return 1; }
    echo "   click ${token:0:8}… staged"
    reinstall=""
  fi
  open_url="kickflip://e2e/open?url=$(python3 -I -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$LINK_URL")"
  # shellcheck disable=SC2086
  maestro $reinstall --device "$DEVICE" test -e LINK_URL="$LINK_URL" -e E2E_OPEN_URL="$open_url" "$FLOW_DIR/$name.yaml" || return 1
  verify_click "$name" "$token"
}

fail=0
for name in "${FLOWS[@]}"; do
  [ -f "$FLOW_DIR/$name.yaml" ] || { echo "ERROR: no flow $FLOW_DIR/$name.yaml"; fail=1; continue; }
  if flow_needs_backend "$name" && [ "$HAVE_SECRETS" != 1 ]; then
    notice "ios/$name skipped: LINKTRAIL_KEY and E2E_TOKEN are not set"; continue
  fi
  ok=0; reinstall=""
  for attempt in $(seq 1 "$RETRIES"); do
    echo "==> ios/$name (attempt $attempt/$RETRIES)"
    if run_once "$name" "$reinstall"; then ok=1; break; fi
    # The XCUITest driver on iOS sims can die mid-run and stays dead; restart it before a retry.
    echo "   attempt failed; restarting the Maestro driver"
    pkill -f 'XCTestRunner|WebDriverAgent' >/dev/null 2>&1 || true
    reinstall="--reinstall-driver"; sleep 10
  done
  if [ "$ok" = 1 ]; then echo "OK: ios/$name"; else echo "FAILED: ios/$name"; fail=1; fi
done

[ "$fail" = 0 ] || { echo "==> Some iOS e2e flows failed"; exit 1; }
echo "==> All iOS e2e flows passed"
