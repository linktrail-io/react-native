# shellcheck shell=bash
# shellcheck disable=SC2034  # the variables here are read by the scripts that source this file
#
# Shared helpers for e2e/android.sh and e2e/ios.sh. Sourced, not run.
# Expects ROOT (the repo root) from the caller.
#
# Secrets come from the environment only and are never printed:
#   LINKTRAIL_KEY   workspace SDK key. Written into the gitignored example/e2e.config.local.json
#                   for the run (removed on exit), so Metro bundles it into the test build.
#   E2E_TOKEN       X-E2E-Token for the private backend check GET /v1/e2e/clicks/<token>.
# Without BOTH, the real flows (anything that talks to the backend) are skipped with a notice and
# only the offline flows run.

BACKEND_URL="https://backend.linktrail.io"
# The campaign link the real flows use. Same slug as the native SDK e2e suites (backend seed):
# it deep links to /products/aj1 with customData voucher=SUMMER25.
LINK_URL="${LINK_URL:-https://kick.linktrail.io/discounted-product}"
LINK_HOST="$(printf '%s' "$LINK_URL" | sed -E 's#^https?://([^/]+).*#\1#')"
RETRIES="${RETRIES:-3}"
VERIFY_TIMEOUT="${VERIFY_TIMEOUT:-15}"
E2E_CONFIG="$ROOT/example/e2e.config.local.json"

HAVE_SECRETS=0
if [ -n "${LINKTRAIL_KEY:-}" ] && [ -n "${E2E_TOKEN:-}" ]; then HAVE_SECRETS=1; fi

# notice <text>: a GitHub Actions notice in CI, a plain line locally.
notice() {
  if [ "${GITHUB_ACTIONS:-}" = true ]; then echo "::notice title=e2e::$*"; else echo "NOTICE: $*"; fi
}

# write_config: the per-run e2e settings Metro bundles (see example/metro.config.js).
# The key goes through python's argv-free stdin path so it never shows in `ps` or the log.
write_config() {
  printf '%s' "${LINKTRAIL_KEY:-}" | python3 -I -c '
import json, sys
json.dump({"enabled": True, "apiKey": sys.stdin.read()}, open(sys.argv[1], "w"))
' "$E2E_CONFIG"
  chmod 600 "$E2E_CONFIG"
}

remove_config() { rm -f "$E2E_CONFIG"; }

# flow_needs_backend <flow name>: every flow except the offline consent one.
flow_needs_backend() { [ "$1" != "consent_prompt" ]; }

# expect_for <flow name>: what the backend must have recorded for the flow's click.
expect_for() {
  case "$1" in
    deferred_allow) echo allow ;;
    deferred_deny)  echo deny ;;
    *)              echo none ;;
  esac
}

# judge <response.json> <allow|deny>: prints "PASS <fields>" or "WAIT <fields>".
judge() {
  python3 -I -c '
import json, sys
d = json.load(open(sys.argv[1])); mode = sys.argv[2]
got = "installRecorded=%s attributed=%s matchType=%s installCount=%s" % (
    d.get("installRecorded"), d.get("attributed"), d.get("matchType"), d.get("installCount"))
if mode == "deny":
    ok = d.get("installRecorded") is False and d.get("installCount") == 0
else:
    ok = (d.get("installRecorded") is True and d.get("attributed") is True
          and d.get("matchType") == "click_token" and d.get("installCount") == 1)
print(("PASS " if ok else "WAIT ") + got)
' "$1" "$2" 2>/dev/null || echo "WAIT unparseable response"
}

# verify_click <flow name> <token>: poll GET /v1/e2e/clicks/<token> (contracts/e2e-verify-endpoint.md).
#   allow: installRecorded, attributed, matchType=click_token, installCount=1 (first PASS wins)
#   deny:  installRecorded=false, installCount=0, held for the whole window so a late install shows
# Neither the secret nor the full click token is printed.
verify_click() {
  local name="$1" token="$2" mode body code verdict="WAIT no response" deadline
  mode="$(expect_for "$name")"
  [ "$mode" = none ] && return 0
  [ -n "$token" ] || { echo "VERIFY FAIL: $name — no lt_click token"; return 1; }
  body="$(mktemp)"
  deadline=$(( $(date +%s) + VERIFY_TIMEOUT ))
  while :; do
    # The secret reaches curl through a stdin config, never argv.
    code="$(printf 'header = "X-E2E-Token: %s"\n' "$E2E_TOKEN" \
      | curl -sS -o "$body" -w '%{http_code}' --max-time 10 --config - "$BACKEND_URL/v1/e2e/clicks/$token" 2>/dev/null || true)"
    case "$code" in
      404)
        rm -f "$body"
        echo "VERIFY FAIL: $name — 404: the endpoint is off, the X-E2E-Token is wrong, or the click's app is not in the backend's E2E_APP_IDENTIFIERS"
        return 1 ;;
      200)
        verdict="$(judge "$body" "$mode")"
        if [ "$mode" = allow ] && [[ "$verdict" == PASS* ]]; then break; fi
        if [ "$mode" = deny ] && [[ "$verdict" == WAIT* ]]; then break; fi ;;
      *) verdict="WAIT HTTP ${code:-000}" ;;
    esac
    [ "$(date +%s)" -ge "$deadline" ] && break
    sleep 2
  done
  rm -f "$body"
  if [[ "$verdict" == PASS* ]]; then
    echo "VERIFY OK: $name [$mode] click ${token:0:8}… ${verdict#PASS }"; return 0
  fi
  echo "VERIFY FAIL: $name [$mode] click ${token:0:8}… — got ${verdict#WAIT }"
  return 1
}
