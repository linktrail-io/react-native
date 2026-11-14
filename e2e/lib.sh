# shellcheck shell=bash
# shellcheck disable=SC2034  # the variables here are read by the scripts that source this file
#
# Shared runner for e2e/android.sh and e2e/ios.sh. Sourced, not run. The caller sets ROOT and
# PLATFORM and defines the platform steps:
#   install_fresh                 uninstall + install the app (clean state)
#   stage_click <url> <token|no-token>
#                                 make a real click on <url>; with "token" stage its lt_click for
#                                 the install and set TOKEN (no-token: the probabilistic rows)
#   open_url_for <url>            the URL a re-engagement flow opens (prints it)
#   run_maestro <label> <args…>   Maestro on this platform's device
#   reset_driver                  after a failed attempt
#
# Targets come from e2e/e2e-env.json and the rows from e2e/e2e-flows.json (e2e/targets.py). Secrets
# come from the environment only and are never printed:
#   LINKTRAIL_KEY       SDK key of the prod workspace (LINKTRAIL_TEST_KEY for dev: the environment's
#                       key_secret). Written into the gitignored example/e2e.config.local.json for
#                       the build (removed on exit), so Metro bundles it into the test build.
#   E2E_TOKEN           X-E2E-Token for the private backend check GET /v1/e2e/clicks/<token>.
# Without BOTH, every row that talks to the backend is skipped with a notice; the offline rows run.
#
# Env (optional): LINKTRAIL_ENV (prod | dev), E2E_LINK_TYPES (all | none | a,b), RETRIES (3),
# CLICK_WAIT (60), VERIFY_WAIT (20), MIN_CTIT_WAIT (15), E2E_RESULTS (results JSON lines).

targets="$(python3 -I "$ROOT/e2e/targets.py" resolve --format shell)" || exit 2
eval "$targets"
RETRIES="${RETRIES:-3}"
CLICK_WAIT="${CLICK_WAIT:-60}"
VERIFY_WAIT="${VERIFY_WAIT:-20}"
# The backend flags an install under 10 s after its click as click injection (ctit_too_short), and a
# flagged install earns nothing: no app launch until this long after the click.
MIN_CTIT_WAIT="${MIN_CTIT_WAIT:-15}"
E2E_CONFIG="$ROOT/example/e2e.config.local.json"
WORK="$(mktemp -d)"
RESULTS="${E2E_RESULTS:-$ROOT/e2e/results-$PLATFORM.jsonl}"
VERIFY_LAST="$WORK/verify-last.json"
ROW_CHECKS="$WORK/checks.tsv"

SDK_KEY="${!KEY_SECRET:-}"
HAVE_SECRETS=0
if [ -n "$SDK_KEY" ] && [ -n "${E2E_TOKEN:-}" ]; then HAVE_SECRETS=1; fi

# notice <text>: a GitHub Actions notice in CI, a plain line locally.
notice() {
  if [ "${GITHUB_ACTIONS:-}" = true ]; then echo "::notice title=e2e::$*"; else echo "NOTICE: $*"; fi
}

# write_config: the per-run e2e settings Metro bundles (see example/metro.config.js): the key and
# the environment's link hosts. The key goes through stdin so it never shows in `ps` or the log.
write_config() {
  printf '%s' "$SDK_KEY" | python3 -I -c '
import json, sys
json.dump({"enabled": True, "apiKey": sys.stdin.read(), "linkDomains": sys.argv[2:]}, open(sys.argv[1], "w"))
' "$E2E_CONFIG" "$CUSTOM_HOST" "$SUBDOMAIN_HOST"
  chmod 600 "$E2E_CONFIG"
}

remove_config() { rm -f "$E2E_CONFIG"; }
cleanup_lib() { remove_config; rm -rf "$WORK"; }

# add_check <name> <pass|fail|skipped> <detail>: one backend sub-check for the row's note.
add_check() { printf '%s\t%s\t%s\n' "$1" "$2" "$(printf '%s' "$3" | tr '\t\n' '  ')" >> "$ROW_CHECKS"; }

# secret_get <url>: GET with the X-E2E-Token header (through a stdin curl config, never argv) into
# $WORK/body.json; prints the HTTP status.
secret_get() {
  printf 'header = "X-E2E-Token: %s"\n' "$E2E_TOKEN" \
    | curl -sS -o "$WORK/body.json" -w '%{http_code}' --max-time 10 --config - "$1" 2>/dev/null || true
}

# wait_click <token>: until GET /v1/events/click/<token> answers 200 for this workspace's key.
wait_click() {
  local code="" waited=0
  while [ "$waited" -lt "$CLICK_WAIT" ]; do
    code="$(printf 'header = "X-API-Key: %s"\n' "$SDK_KEY" \
      | curl -sS -o /dev/null -w '%{http_code}' --max-time 10 --config - "$BACKEND_URL/v1/events/click/$1" 2>/dev/null || true)"
    [ "$code" = 200 ] && return 0
    sleep 2; waited=$((waited + 2))
  done
  FAIL_STEP="click registration"; FAIL_ERROR="click not visible to this key after ${CLICK_WAIT}s (last status: ${code:-none})"
  return 1
}

# wait_ctit: return once MIN_CTIT_WAIT has passed since the row's click (no click: at once).
wait_ctit() {
  [ -n "${CLICK_AT:-}" ] || return 0
  local left=$((MIN_CTIT_WAIT - (SECONDS - CLICK_AT)))
  if [ "$left" -gt 0 ]; then sleep "$left"; fi
}

# verify_backend <mode> [baseline file]: poll GET /v1/e2e/clicks/$TOKEN and check it with
# e2e/verify.py (the rules per mode are there). Allow modes poll until it matches; deny modes hold
# the whole window, so a late install shows. Sets BACKEND_DETAIL, FAIL_STEP / FAIL_ERROR; keeps the
# last 200 body in $VERIFY_LAST (the baseline of the next step).
verify_backend() {
  local mode="$1" baseline="${2:-}" code out status="" step="" detail="" checks="" deadline model="" lt="$LINK_TYPE"
  # A reward row's install is checked as a plain install; its link type is checked with the events.
  if [ "$KIND" = reward ]; then model="$REWARD"; [[ "$mode" == events_* ]] || lt=""; fi
  [ -n "$TOKEN" ] || { FAIL_STEP="backend install check"; FAIL_ERROR="no lt_click token"; return 1; }
  rm -f "$VERIFY_LAST"
  deadline=$(( SECONDS + VERIFY_WAIT ))
  while :; do
    code="$(secret_get "$BACKEND_URL/v1/e2e/clicks/$TOKEN")"
    if [ "$code" = 404 ]; then
      FAIL_STEP="backend install check"
      FAIL_ERROR="404: the e2e endpoint is off, the X-E2E-Token is wrong, or the app id is not in the backend's E2E_APP_IDENTIFIERS"
      return 1
    fi
    if [ "$code" = 200 ]; then
      out="$(python3 -I "$ROOT/e2e/verify.py" check --mode "$mode" --body "$WORK/body.json" \
        --link-type "$lt" \
        --rewarded "$REWARDED_LINK_TYPES" --baseline "$baseline" --model "$model" \
        --revenue-minor "$REVENUE_MINOR" --other-event "$OTHER_EVENT" --env "$LINKTRAIL_ENV" \
        --earning "$( [ "$CHECK_EARNING" = 1 ] && echo on || echo off)" \
        --open-count "$( [ "$CHECK_OPEN_COUNT" = 1 ] && echo on || echo off)" \
        --events "$( [ "$CHECK_EVENTS" = 1 ] && echo on || echo off)")" \
        || out=$'bad\nbackend install check\ne2e/verify.py failed'
      { read -r status; read -r step; IFS= read -r detail; } <<< "$out" || true
      checks="$(grep '^CHECK' <<< "$out" | cut -f2- || true)"
      cp "$WORK/body.json" "$VERIFY_LAST"
      if [ "$status" = missing ] || [ "$status" = fail ]; then break; fi
      if [[ "$mode" == *allow ]] && [ "$status" = ok ]; then break; fi
      if [[ "$mode" == *deny ]] && [ "$status" != ok ]; then break; fi
    fi
    [ "$SECONDS" -ge "$deadline" ] && break
    sleep 3
  done
  [ -n "$checks" ] && printf '%s\n' "$checks" >> "$ROW_CHECKS"
  BACKEND_DETAIL="$mode: ${detail:-no 200 within ${VERIFY_WAIT}s (last status: ${code:-none})}"
  if [ "$status" = ok ]; then echo "   backend ok ($mode): $detail"; return 0; fi
  FAIL_STEP="${step:-backend install check}"; FAIL_ERROR="${detail%%;*}"
  [ -n "$FAIL_ERROR" ] || FAIL_ERROR="no 200 within ${VERIFY_WAIT}s (last status: ${code:-none})"
  echo "   backend check failed ($mode): ${BACKEND_DETAIL#*: }" >&2
  return 1
}

# flow <label> <yaml> [extra -e args…]: the row's Maestro flow with the row's values (link, open
# URL, expected path + customData, consent allow|deny, its panel state and e2e consent button).
flow() {
  local label="$1" yaml="$2" state=granted button=e2e-grant-consent; shift 2
  if [ "$CONSENT" = deny ]; then state=denied; button=e2e-deny-consent; fi
  run_maestro "$label" -e LINK_URL="$URL" -e E2E_OPEN_URL="$(open_url_for "$URL")" \
    -e E2E_PATH_RE="$PATH_RE" -e E2E_CUSTOM_DATA_RE="$DATA_RE" -e E2E_CONSENT="$CONSENT" \
    -e E2E_CONSENT_STATE="$state" -e E2E_CONSENT_BUTTON="$button" "$@" "$FLOW_DIR/$yaml.yaml" \
    || { FAIL_STEP="maestro: $yaml"; FAIL_ERROR="flow failed (see the job log)"; return 1; }
}

# send_events <label>: the reward's events (planned from the install's response) through the
# example app's kickflip://e2e/events hook; every one must come back, attributed only on allow.
send_events() {
  local out status detail url n attributed=0
  out="$(python3 -I "$ROOT/e2e/verify.py" plan-events --model "$REWARD" --body "$VERIFY_LAST" \
    --revenue-minor "$REVENUE_MINOR" --other-event "$OTHER_EVENT")" || out=$'bad\ne2e/verify.py failed'
  { read -r status; IFS= read -r detail; IFS= read -r url; read -r n; } <<< "$out" || true
  if [ "$status" != ok ] || [ -z "$url" ]; then
    FAIL_STEP="backend event earning check"; FAIL_ERROR="events not planned: $detail"; return 1
  fi
  echo "   sending $detail"
  [ "$CONSENT" = allow ] && attributed="$n"
  flow "$1-events" send_events -e E2E_EVENTS_URL="$url" -e E2E_EVENTS_N="$n" -e E2E_EVENTS_ATTRIBUTED="$attributed"
}

# run_row <label>: one attempt of the current row (ROW, YAML, KIND, CONSENT, URL, LINK_TYPE, REWARD,
# PATH_RE, DATA_RE). Sets FAIL_STEP / FAIL_ERROR / BACKEND_DETAIL.
run_row() {
  local label="$1"
  FAIL_STEP=""; FAIL_ERROR=""; BACKEND_DETAIL=""; TOKEN=""; CLICK_AT=""; : > "$ROW_CHECKS"
  case "$KIND" in
    click|reward|reopen|problistic)
      CLICK_AT=$SECONDS
      if [ "$KIND" = problistic ]; then stage_click "$URL" no-token || return 1
      else stage_click "$URL" token || return 1; fi
      install_fresh || { FAIL_STEP="install"; return 1; }
      wait_ctit ;;
    *) install_fresh || { FAIL_STEP="install"; return 1; } ;;
  esac
  case "$KIND" in
    offline|event|open)
      flow "$label" "$YAML" ;;
    problistic)
      flow "$label" "$YAML" || return 1
      add_check "device lookup" skipped "not checkable through the wrapper (it exposes no SDK device id)"
      BACKEND_DETAIL="screens only: device lookup not checkable through the wrapper" ;;
    click)
      flow "$label" "$YAML" || return 1
      verify_backend "$CONSENT" ;;
    reward)
      flow "$label" "$YAML" || return 1
      verify_backend "$CONSENT" || { BACKEND_DETAIL="install: $BACKEND_DETAIL"; return 1; }
      local install_detail="install: $BACKEND_DETAIL"
      cp "$VERIFY_LAST" "$WORK/baseline.json"
      send_events "$label" || { BACKEND_DETAIL="$install_detail"; return 1; }
      verify_backend "events_$CONSENT" "$WORK/baseline.json"
      local rc=$?
      BACKEND_DETAIL="$install_detail; $BACKEND_DETAIL"
      return $rc ;;
    reopen)
      # Step 1: install through the type's link (the deferred flow of the same consent) and read the
      # backend's baseline for the click; step 2: the re-engagement open on the installed app.
      flow "$label-install" "deferred_$CONSENT" || return 1
      verify_backend "$CONSENT" || { BACKEND_DETAIL="install: $BACKEND_DETAIL"; return 1; }
      local install_detail="install: $BACKEND_DETAIL"
      cp "$VERIFY_LAST" "$WORK/baseline.json"
      flow "$label" "$YAML" || return 1
      verify_backend "reopen_$CONSENT" "$WORK/baseline.json"
      local rc=$?
      BACKEND_DETAIL="$install_detail; re-engagement: $BACKEND_DETAIL"
      return $rc ;;
  esac
}

# checks_note: the row's sub-checks as one line ("fraud pass; reward pass; events skipped (…)").
checks_note() {
  awk -F'\t' '{ printf "%s%s %s%s", (NR > 1 ? "; " : ""), $1, $2, ($2 == "skipped" ? " (" $3 ")" : "") }' "$ROW_CHECKS"
}

record() { python3 -I "$ROOT/e2e/targets.py" record --results "$RESULTS" --platform "$PLATFORM" "$@" \
  || echo "   (could not record the result)" >&2; }

# run_all [row…]: every row e2e/targets.py lists for this platform (or the named ones), with retries.
run_all() {
  local jobs fail=0 attempt ok started note
  jobs="$(python3 -I "$ROOT/e2e/targets.py" jobs --platform "$PLATFORM" "$@")" || exit 2
  : > "$RESULTS"
  echo "==> $PLATFORM e2e on $LINKTRAIL_ENV ($BACKEND_URL)"
  [ -n "$LINK_TYPES_SKIPPED" ] && notice "$PLATFORM: link types without a $LINKTRAIL_ENV link, skipped: $LINK_TYPES_SKIPPED"
  while IFS=$'\x1f' read -r ROW YAML KIND CONSENT URL LINK_TYPE REWARD PATH_RE DATA_RE SKIP; do
    [ -n "$ROW" ] || continue
    if [ -n "$SKIP" ]; then
      notice "$PLATFORM/$ROW skipped: $SKIP"
      record --flow "$ROW" --result skipped --link-type "$LINK_TYPE" --error "$SKIP"; continue
    fi
    if [ "$KIND" != offline ] && [ "$HAVE_SECRETS" != 1 ]; then
      notice "$PLATFORM/$ROW skipped: $KEY_SECRET and E2E_TOKEN are not set"
      record --flow "$ROW" --result skipped --link "$URL" --link-type "$LINK_TYPE" --error "$KEY_SECRET / E2E_TOKEN not set"
      continue
    fi
    if [ "$KIND" != offline ] && [ -n "${REAL_SKIP:-}" ]; then
      notice "$PLATFORM/$ROW skipped: $REAL_SKIP"
      record --flow "$ROW" --result skipped --link "$URL" --link-type "$LINK_TYPE" --error "$REAL_SKIP"
      continue
    fi
    ok=0; started=$SECONDS
    for attempt in $(seq 1 "$RETRIES"); do
      echo "==> $PLATFORM/$ROW (attempt $attempt/$RETRIES)${URL:+ on $URL}"
      if run_row "$ROW-attempt$attempt" < /dev/null; then ok=1; break; fi
      echo "   attempt failed: ${FAIL_STEP:-?}${FAIL_ERROR:+ — $FAIL_ERROR}"
      reset_driver
    done
    note="$(checks_note)"
    if [ "$ok" = 1 ]; then
      echo "OK: $PLATFORM/$ROW${note:+ ($note)}"
      record --flow "$ROW" --result pass --attempts "$attempt" --duration $((SECONDS - started)) \
        --link "$URL" --link-type "$LINK_TYPE" --backend "${BACKEND_DETAIL}${note:+ | $note}"
    else
      echo "FAILED: $PLATFORM/$ROW"; fail=1
      record --flow "$ROW" --result fail --attempts "$RETRIES" --duration $((SECONDS - started)) \
        --link "$URL" --link-type "$LINK_TYPE" --backend "${BACKEND_DETAIL}${note:+ | $note}" \
        --step "$FAIL_STEP" --error "$FAIL_ERROR"
    fi
  done <<< "$jobs"
  python3 -I "$ROOT/e2e/targets.py" summary --results "$RESULTS" > "$WORK/summary.md" || true
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    { echo "### $PLATFORM e2e ($LINKTRAIL_ENV)"; cat "$WORK/summary.md"; } >> "$GITHUB_STEP_SUMMARY"
  else
    cat "$WORK/summary.md"
  fi
  [ "$fail" = 0 ] || { echo "==> Some $PLATFORM e2e flows failed"; return 1; }
  echo "==> All $PLATFORM e2e flows passed (or were skipped with a notice)"
}
