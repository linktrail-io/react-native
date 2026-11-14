#!/usr/bin/env python3
"""Checks one response of the private e2e verify endpoint GET /v1/e2e/clicks/<token>
(header X-E2E-Token), with the same rules as the native SDKs' scripts/e2e-verify.py. Stdlib only.
Called by e2e/lib.sh while it polls the endpoint for a row's own click token.

  check --mode M --body F [--link-type T] [--rewarded a,b] [--baseline F] [--model M]
        [--revenue-minor N] [--other-event E] [--earning on|off] [--open-count on|off]
        [--events on|off] [--env NAME]

prints the status, the failed step and a one-line detail, then one CHECK<TAB>name<TAB>pass|fail|skipped
<TAB>detail line per sub-check it reached (fraud, reward, link type, open count, events):

  ok        the response matches the mode
  bad       not (yet): allow modes keep polling, deny modes stop
  fail      not, and it won't change (fraud, a wrong link type): stop at once
  missing   the backend lacks a field the check needs: stop at once, never skipped

Modes:
  allow         installRecorded, attributed, matchType click_token, installCount 1, not fraud; with
                --link-type (and --earning on) also the reward: per_install on --rewarded types
                (earning.counted, amountMinor == reward.amountMinor), reward null on the others
  deny          installRecorded false, installCount 0; link-type rows earn nothing
  reopen_allow  after the re-engagement open (--baseline: the response read after the install):
                openCount +1 (--open-count on), installCount and earning unchanged
  reopen_deny   the same open without consent: openCount, installCount and earning unchanged
  events_allow  the reward rows after their events (--model, --baseline = the install's response,
                earning 0): per_event 2 x reward.amountMinor, rev_share floor(N x rateBps / 10000)
  events_deny   no install counted, earning 0

  plan-events --model M --body F --revenue-minor N --other-event E

prints the status, the detail, the kickflip://e2e/events URL the example app's e2e hook sends
(per_event: the reward's eventName twice + E once; rev_share: one revenue event of N minor units in
the reward's currency + the same in another currency, which earns nothing) and the event count.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import quote

MODES = ("allow", "deny", "reopen_allow", "reopen_deny", "events_allow", "events_deny")
REWARD_EVENTS = 2
REVENUE_EVENT = "e2e_revenue"
_EXPONENT = {"BHD": 3, "CLP": 0, "IQD": 3, "ISK": 0, "JOD": 3, "JPY": 0, "KRW": 0, "KWD": 3, "LYD": 3,
             "OMR": 3, "PYG": 0, "TND": 3, "UGX": 0, "VND": 0, "XAF": 0, "XOF": 0}
INSTALL_STEP = "backend install check"
REWARD_STEP = "backend reward check"
REOPEN_STEP = "backend re-engagement check"
EVENTS_STEP = "backend event earning check"
FRAUD_STEP = "backend fraud check"
LINK_TYPE_STEP = "backend link type check"
EVENT_COUNT_STEP = "backend events check"
FRAUD_RULES = {
    "ip_velocity": "more than 20 installs from one IP in an hour: too many e2e runs from this runner's IP",
    "device_repeat": "the same device installed again: a device id from an earlier run",
    "ctit_too_short": "the install came under 10 s after its click (MIN_CTIT_WAIT)",
}


def _j(value) -> str:
    return json.dumps(value, ensure_ascii=False)


def _amount(obj):
    if not isinstance(obj, dict):
        return None
    v = obj.get("amountMinor")
    return v if isinstance(v, int) and not isinstance(v, bool) else None


def _money(obj) -> str:
    if not isinstance(obj, dict):
        return _j(obj)
    return f"{_j(obj.get('amountMinor'))}{' ' + str(obj['currency']) if obj.get('currency') else ''}"


def describe(d: dict) -> str:
    parts = [f"{k}={_j(d.get(k))}" for k in ("installRecorded", "attributed", "matchType", "installCount", "openCount")]
    if "linkType" in d:
        parts.append(f"linkType={d.get('linkType')}")
    if "reward" in d:
        r = d.get("reward")
        parts.append("reward=" + (f"{r.get('model')} {_money(r)}" if isinstance(r, dict) else _j(r)))
    if isinstance(d.get("earning"), dict):
        e = d["earning"]
        parts.append(f"earning={'counted' if e.get('counted') is True else 'not counted'} {_money(e)}"
                     + (" (excluded as fraud)" if e.get("excludedAsFraud") is True else ""))
    return " ".join(parts)


def _missing(field: str) -> str:
    return f"backend has no {field} field in GET /v1/e2e/clicks/:token (deploy the backend that adds it)"


def install_problems(consent: str, d: dict) -> list[str]:
    want = ({"installRecorded": True, "attributed": True, "matchType": "click_token", "installCount": 1}
            if consent == "allow" else {"installRecorded": False, "installCount": 0})
    return [f"{k} {_j(d.get(k))} (want {_j(v)})" for k, v in want.items()
            if d.get(k) != v or type(d.get(k)) is not type(v)]


def fraud_check(d: dict) -> tuple[str, str]:
    e = d.get("earning")
    excluded = e.get("excludedAsFraud") if isinstance(e, dict) else None
    reasons = d.get("fraudReasons") if isinstance(d.get("fraudReasons"), list) else []
    why = ", ".join(f"{r} ({FRAUD_RULES[r]})" if r in FRAUD_RULES else str(r) for r in reasons) or "no reason recorded"
    if excluded is True or reasons:
        return "fail", f"install excluded as fraud: {why}"
    if "fraudReasons" not in d:
        return "skipped", "not checkable: backend reports no fraudReasons field"
    return "ok", "excludedAsFraud false, fraudReasons []"


def reward_check(consent: str, d: dict, link_type: str, rewarded) -> tuple[str, list[str]]:
    for field in ("earning", "reward", "linkType"):
        if field not in d:
            return "missing", [_missing(field)]
    problems = []
    if d.get("linkType") != link_type:
        problems.append(f"linkType {_j(d.get('linkType'))} (want {_j(link_type)})")
    reward, earning = d.get("reward"), d.get("earning")
    if not isinstance(earning, dict):
        return "bad", problems + [f"earning {_j(earning)} (want an object)"]
    counted, amount = earning.get("counted"), _amount(earning)
    if link_type in rewarded:
        if not isinstance(reward, dict) or _amount(reward) is None:
            problems.append(f"reward {_j(reward)} (want the {link_type} link's reward with amountMinor)")
        elif consent == "allow":
            if reward.get("model") != "per_install":
                problems.append(f"reward.model {_j(reward.get('model'))} (want per_install on a link-type row)")
            else:
                if counted is not True:
                    problems.append(f"earning.counted {_j(counted)} (want true)")
                if amount != _amount(reward):
                    problems.append(f"earning.amountMinor {_j(amount)} (want {_amount(reward)}: reward.amountMinor)")
        if consent == "deny" and (counted is not False or amount != 0):
            problems.append(f"earning {_money(earning)} counted={_j(counted)} (want not counted, 0: a denied install earns nothing)")
    else:
        if reward is not None:
            problems.append(f"reward {_j(reward)} (want null: {link_type} links carry no reward)")
        if counted is not False or amount != 0:
            problems.append(f"earning {_money(earning)} counted={_j(counted)} (want not counted, 0: no reward)")
    return ("bad" if problems else "ok"), problems


def reopen_check(consent: str, d: dict, base: dict, open_count: bool) -> tuple[str, list[str], list]:
    checks, problems = [], []
    if "installCount" not in d:
        return "missing", [_missing("installCount")], checks
    if d.get("installCount") != base.get("installCount"):
        problems.append(f"installCount {_j(d.get('installCount'))} (want {_j(base.get('installCount'))}: "
                        "re-engagement must not record a second install)")
    if "earning" in d and "earning" in base and d.get("earning") != base.get("earning"):
        problems.append(f"earning {_j(d.get('earning'))} (want {_j(base.get('earning'))} as after the install: no second reward)")
    if not open_count:
        checks.append(("open count", "skipped", "not on this backend yet (backend_checks.open_count is false)"))
    elif "openCount" not in d or "openCount" not in base:
        return "missing", [_missing("openCount")], checks
    else:
        want = base["openCount"] + (1 if consent == "allow" else 0) if isinstance(base["openCount"], int) else None
        if d.get("openCount") != want:
            problems.append(f"openCount {_j(d.get('openCount'))} (want {_j(want)}: "
                            f"{'the open is recorded once' if consent == 'allow' else 'an open without consent records nothing'})")
        else:
            checks.append(("open count", "pass", f"openCount {base['openCount']} -> {d['openCount']}"))
    return ("bad" if problems else "ok"), problems, checks


def event_reward(d: dict, model: str):
    if "reward" not in d:
        return "missing", _missing("reward"), None
    r = d.get("reward")
    if not isinstance(r, dict) or r.get("model") != model:
        return "bad", f"reward {_j(r)} (want the link's {model} reward)", None
    if model == "per_event" and (_amount(r) is None or not r.get("eventName")):
        return "bad", f"reward {_j(r)} (want amountMinor and eventName for per_event)", None
    if model == "rev_share" and (not isinstance(r.get("rateBps"), int) or not r.get("currency")):
        return "bad", f"reward {_j(r)} (want rateBps and currency for rev_share)", None
    return "ok", "", r


def major_units(minor: int, currency: str) -> str:
    exp = _EXPONENT.get(currency.upper(), 2)
    if exp == 0:
        return str(minor)
    return f"{minor // 10 ** exp}.{minor % 10 ** exp:0{exp}d}"


def other_currency(currency: str) -> str:
    return "EUR" if currency.upper() == "USD" else "USD"


def plan_events(model: str, d, revenue_minor: int, other_event: str) -> tuple[str, str, list[dict]]:
    if not isinstance(d, dict):
        return "bad", "response is not a JSON object", []
    status, problem, r = event_reward(d, model)
    if status != "ok":
        return status, problem, []
    if model == "per_event":
        if r["eventName"] == other_event:
            return "bad", f"reward.eventName {_j(other_event)} is the other event's name", []
        events = [{"name": r["eventName"]}] * REWARD_EVENTS + [{"name": other_event}]
        detail = f"per_event: {REWARD_EVENTS} x {r['eventName']} + 1 x {other_event}"
    else:
        cur, other = r["currency"], other_currency(r["currency"])
        events = [{"name": REVENUE_EVENT, "value": major_units(revenue_minor, cur), "currency": cur},
                  {"name": REVENUE_EVENT, "value": major_units(revenue_minor, other), "currency": other}]
        detail = f"rev_share: {revenue_minor} minor {cur} at {r['rateBps']} bps + the same in {other} (earns nothing)"
    return "ok", detail, events


def events_url(events: list[dict]) -> str:
    return "kickflip://e2e/events?list=" + quote(json.dumps(events, separators=(",", ":")), safe="")


def events_check(d: dict, model: str, reward: dict, consent: str, other_event: str, revenue_minor: int):
    name = "revenue" if model == "rev_share" and consent == "allow" else "events"
    ev = d.get("events")
    if "events" not in d:
        return "missing", name, _missing("events")
    if not isinstance(ev, dict) or not isinstance(ev.get("count"), int) or not isinstance(ev.get("byName"), dict) \
            or not isinstance(ev.get("revenue"), list):
        return "fail", name, f"events {_j(ev)} (want count, byName and revenue)"
    amounts = {str(x.get("currency", "")).upper(): x.get("amountMinor") for x in ev["revenue"] if isinstance(x, dict)}
    if consent == "deny":
        want = (0, {}, {})
    elif model == "per_event":
        names = {reward["eventName"]: REWARD_EVENTS, other_event: 1}
        want = (sum(names.values()), names, {})
    else:
        cur = str(reward["currency"]).upper()
        want = (2, {REVENUE_EVENT: 2}, {cur: revenue_minor, other_currency(cur): revenue_minor})
    got = f"events.count {ev['count']} byName {_j(ev['byName'])} revenue {_j(amounts)}"
    if (ev["count"], ev["byName"], amounts) != want:
        return "bad", name, f"{got} (want count {want[0]} byName {_j(want[1])} revenue {_j(want[2])})"
    return "ok", name, got


def check(mode: str, d, link_type="", rewarded=(), baseline=None, model="", revenue_minor=0,
          other_event="e2e_other", earning=True, open_count=True, events=False, env=""):
    """→ (status, step, detail, checks): checks are (name, pass|fail|skipped, detail) rows."""
    if mode not in MODES:
        raise ValueError(f"mode must be one of {', '.join(MODES)}")
    checks = []
    if not isinstance(d, dict):
        return "bad", INSTALL_STEP, "response is not a JSON object", checks
    state = describe(d)
    off = f"not on the {env or 'this'} backend yet (backend_checks.%s is false in e2e/e2e-env.json)"
    if mode.startswith("reopen_"):
        if not isinstance(baseline, dict):
            return "bad", REOPEN_STEP, f"no baseline response from the install step; {state}", checks
        status, problems, sub = reopen_check(mode.split("_", 1)[1], d, baseline, open_count)
        checks += sub
        return status, REOPEN_STEP, "; ".join(problems + [state]), checks
    consent = mode.split("_", 1)[1] if mode.startswith("events_") else mode
    problems = install_problems(consent, d)
    if problems:
        return "bad", INSTALL_STEP, "; ".join(problems + [state]), checks
    if mode == "allow":   # the events modes run after this install check passed
        status, detail = fraud_check(d)
        checks.append(("fraud", {"ok": "pass"}.get(status, status), detail))
        if status == "fail":
            return "fail", FRAUD_STEP, f"{detail}; {state}", checks
    if mode.startswith("events_"):
        if not earning:
            checks.append(("earning", "skipped", off % "earning"))
            return "ok", EVENTS_STEP, state, checks
        status, problem, r = event_reward(d, model)
        if status != "ok":
            return status, EVENTS_STEP, f"{problem}; {state}", checks
        if link_type:
            if d.get("linkType") != link_type:
                msg = f"linkType {_j(d.get('linkType'))} (want {_j(link_type)}: reward_links.{model} link_type)"
                checks.append(("link type", "fail", msg))
                return ("missing" if "linkType" not in d else "fail"), LINK_TYPE_STEP, f"{msg}; {state}", checks
            checks.append(("link type", "pass", f"linkType {link_type}"))
        if "earning" not in d:
            return "missing", EVENTS_STEP, _missing("earning"), checks
        be = (baseline or {}).get("earning")
        if not isinstance(be, dict) or _amount(be) != 0:
            return "bad", EVENTS_STEP, f"install earning {_j(be)} before any event (want amountMinor 0); {state}", checks
        e = d["earning"] if isinstance(d["earning"], dict) else {}
        if consent == "allow":
            want = REWARD_EVENTS * _amount(r) if model == "per_event" else (revenue_minor * r["rateBps"]) // 10000
            if e.get("counted") is not True or _amount(e) != want:
                return "bad", EVENTS_STEP, f"earning {_j(e)} (want counted, amountMinor {want}); {state}", checks
        elif e.get("counted") is not False or _amount(e) != 0:
            return "bad", EVENTS_STEP, f"earning {_j(e)} (want not counted, 0: deny sends no event); {state}", checks
        checks.append(("earning", "pass", _money(e)))
        if not events:
            checks.append(("events", "skipped", off % "events"))
            return "ok", EVENTS_STEP, state, checks
        status, name, detail = events_check(d, model, r, consent, other_event, revenue_minor)
        checks.append((name, {"ok": "pass", "bad": "fail", "missing": "fail"}.get(status, status), detail))
        return status, (EVENTS_STEP if status == "ok" else EVENT_COUNT_STEP), f"{detail}; {state}", checks
    if link_type:
        if not earning:
            checks.append(("reward", "skipped", off % "earning"))
        else:
            status, problems = reward_check(consent, d, link_type, tuple(rewarded))
            checks.append(("reward", {"ok": "pass", "bad": "fail", "missing": "fail"}[status],
                           "; ".join(problems) or "as the link type's reward"))
            if status != "ok":
                return status, REWARD_STEP, "; ".join(problems + [state]), checks
    return "ok", INSTALL_STEP, state, checks


def _load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check")
    c.add_argument("--mode", required=True, choices=MODES)
    c.add_argument("--body", required=True)
    c.add_argument("--link-type", default="")
    c.add_argument("--rewarded", default="")
    c.add_argument("--baseline", default="")
    c.add_argument("--model", default="", choices=["", "per_event", "rev_share"])
    c.add_argument("--revenue-minor", type=int, default=0)
    c.add_argument("--other-event", default="e2e_other")
    for flag in ("earning", "open-count", "events"):
        c.add_argument(f"--{flag}", default="on", choices=["on", "off"])
    c.add_argument("--env", default="")
    pe = sub.add_parser("plan-events")
    pe.add_argument("--model", required=True, choices=["per_event", "rev_share"])
    pe.add_argument("--body", required=True)
    pe.add_argument("--revenue-minor", type=int, required=True)
    pe.add_argument("--other-event", required=True)
    a = p.parse_args(argv)
    try:
        data = _load(a.body)
    except (OSError, ValueError) as exc:
        print(f"bad\n{INSTALL_STEP}\nunreadable response: {exc}")
        return 0
    if a.cmd == "plan-events":
        status, detail, events = plan_events(a.model, data, a.revenue_minor, a.other_event)
        print("\n".join([status, detail, events_url(events) if events else "", str(len(events))]))
        return 0
    baseline = None
    if a.baseline:
        try:
            baseline = _load(a.baseline)
        except (OSError, ValueError):
            baseline = None
    status, step, detail, checks = check(
        a.mode, data, a.link_type, [t for t in a.rewarded.split(",") if t], baseline, a.model,
        a.revenue_minor, a.other_event, a.earning == "on", a.open_count == "on", a.events == "on", a.env)
    lines = [status, step, " ".join(detail.split())]
    lines += ["CHECK\t" + "\t".join((n, r, " ".join(str(t).split()))) for n, r, t in checks]
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
