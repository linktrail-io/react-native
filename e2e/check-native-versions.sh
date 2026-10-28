#!/usr/bin/env bash
#
# Compares the native SDK versions this wrapper pins with the latest published ones:
#   iOS      LinktrailReactNative.podspec  s.dependency "LinkTrailSDK", "~> X"  vs CocoaPods trunk
#   Android  android/build.gradle          io.linktrail:sdk:X                    vs Maven Central
#
# Report-only by default: a drift prints a warning (a GitHub annotation in CI) and exits 0.
# STRICT=1 makes a drift (or a lookup failure) exit 1.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STRICT="${STRICT:-0}"

warn() {
  if [ "${GITHUB_ACTIONS:-}" = true ]; then echo "::warning title=native SDK version::$*"; else echo "WARN: $*"; fi
}

ios_pin="$(sed -nE 's/.*s\.dependency[[:space:]]+"LinkTrailSDK",[[:space:]]*"[~>=[:space:]]*([0-9][0-9.]*)".*/\1/p' "$ROOT/LinktrailReactNative.podspec" | head -1)"
android_pin="$(sed -nE 's/.*"io\.linktrail:sdk:([0-9][0-9.]*)".*/\1/p' "$ROOT/android/build.gradle" | head -1)"

ios_latest="$(curl -fsS --max-time 20 https://trunk.cocoapods.org/api/v1/pods/LinkTrailSDK \
  | python3 -I -c 'import json, sys; print("\n".join(v["name"] for v in json.load(sys.stdin)["versions"]))' \
  | grep -E '^[0-9]+(\.[0-9]+)*$' | sort -V | tail -1 || true)"
android_latest="$(curl -fsS --max-time 20 https://repo1.maven.org/maven2/io/linktrail/sdk/maven-metadata.xml \
  | sed -nE 's#.*<release>([^<]+)</release>.*#\1#p' | head -1 || true)"

drift=0
check() {
  local label="$1" pin="$2" latest="$3" source="$4"
  if [ -z "$pin" ]; then warn "$label: could not read the pinned version"; drift=1; return; fi
  if [ -z "$latest" ]; then warn "$label: could not read the latest version from $source"; drift=1; return; fi
  if [ "$pin" = "$latest" ]; then
    echo "OK: $label pinned $pin = latest on $source"
  else
    warn "$label pinned $pin, latest on $source is $latest"
    drift=1
  fi
}
check "iOS LinkTrailSDK" "$ios_pin" "$ios_latest" "CocoaPods trunk"
check "Android io.linktrail:sdk" "$android_pin" "$android_latest" "Maven Central"

if [ "$drift" = 1 ] && [ "$STRICT" = 1 ]; then
  echo "ERROR: native SDK versions differ from the latest published (STRICT=1)"; exit 1
fi
[ "$drift" = 1 ] && echo "Report-only: set STRICT=1 to fail on drift."
exit 0
