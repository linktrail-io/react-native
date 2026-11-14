#!/usr/bin/env python3
"""The e2e targets and flow table for e2e/android.sh and e2e/ios.sh. Stdlib only.

Reads e2e/e2e-env.json (hosts, slugs, backend URLs per environment) and e2e/e2e-flows.json (the flow
table), with the run's choices from the environment:

  LINKTRAIL_ENV    prod (default) | dev (test = dev)
  E2E_LINK_TYPES   link-type rows: all (default), none, or a comma list (general,partner)

  resolve [--format shell|env]   the environment's values (KEY='value' lines for `eval`)
  jobs --platform P [ROW…]       one line per row to run, in order, fields separated by \x1f
                                 (not a tab: `read` would merge empty fields):
                                 row, yaml, kind, consent, url, link_type, reward, path_re,
                                 custom_data_re, skip (non-empty: record as skipped with this reason)
                                 ROW: a flow name (also its link-type rows), <flow>__<type> or a
                                 kind (offline, click, problistic, open, reopen, reward, event)
  validate                       the config + flow table + yaml files agree (CI runs it)
  record --results F [--k v…]    append one result row (JSON lines)
  summary --results F            the results as a Markdown table (step summary)

A bad choice (unknown environment, link type or row) exits 2 with one "ERROR: …" line.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONFIG = HERE / "e2e-env.json"
FLOWS = HERE / "e2e-flows.json"
FLOW_DIR = HERE / "flows"
PLATFORMS = ("android", "ios")
SLOTS = ("custom_link", "subdomain_link", "custom_problistic_link", "subdomain_problistic_link")
HOST_FIELDS = ("subdomain_host", "custom_host")
KINDS = ("offline", "click", "problistic", "open", "reopen", "reward", "event")
REWARD_MODELS = ("per_event", "rev_share")
BACKEND_CHECKS = ("earning", "open_count", "events")
CONSENTS = ("allow", "deny")
SEP = "\x1f"   # the jobs field separator
_SLUG = re.compile(r"[A-Za-z0-9][A-Za-z0-9._~-]{0,127}")
_WORD = re.compile(r"[A-Za-z0-9_-]{1,64}")
_TYPE = re.compile(r"[a-z][a-z0-9_]{0,31}")
_FLOW = re.compile(r"[a-z][a-z0-9_]{0,63}")


class TargetError(ValueError):
    """A choice or config that can't be resolved; the message is shown as is."""


def _link_ok(link) -> bool:
    return isinstance(link, dict) and link.get("host") in HOST_FIELDS and bool(_SLUG.fullmatch(link.get("slug") or ""))


def load_config(path=CONFIG) -> dict:
    cfg = json.loads(Path(path).read_text(encoding="utf-8"))
    envs = cfg.get("environments")
    if not isinstance(envs, dict) or not envs:
        raise TargetError(f"{path}: 'environments' must be a non-empty object")
    for name, e in envs.items():
        for key in ("backend_url", "key_secret", *HOST_FIELDS):
            if not isinstance(e.get(key), str) or not e[key]:
                raise TargetError(f"{path}: environment '{name}' is missing '{key}'")
        if not e["backend_url"].startswith("https://"):
            raise TargetError(f"{path}: environment '{name}' backend_url must be https")
        if not isinstance(e.get("override_backend"), bool):
            raise TargetError(f"{path}: environment '{name}' needs a boolean 'override_backend'")
        checks = e.get("backend_checks")
        if not isinstance(checks, dict) or set(checks) != set(BACKEND_CHECKS) \
                or any(not isinstance(v, bool) for v in checks.values()):
            raise TargetError(f"{path}: environment '{name}' needs backend_checks with a boolean "
                              f"{', '.join(BACKEND_CHECKS)} (and nothing else)")
    if cfg.get("default_environment") not in envs:
        raise TargetError(f"{path}: default_environment must be one of {sorted(envs)}")
    for alias, target in (cfg.get("aliases") or {}).items():
        if target not in envs:
            raise TargetError(f"{path}: alias '{alias}' points at unknown environment '{target}'")
    links = cfg.get("links") or {}
    if set(links) != set(SLOTS) or not all(_link_ok(l) for l in links.values()):
        raise TargetError(f"{path}: 'links' must define exactly {list(SLOTS)}, each with a host field and a slug")
    for section in ("expect", "link_type_expect"):
        ex = cfg.get(section) or {}
        if not isinstance(ex.get("path"), str) or not ex["path"].startswith("/") or "${" in ex["path"]:
            raise TargetError(f"{path}: {section}.path must be a path regex starting with '/'")
        if not _WORD.fullmatch(ex.get("voucher") or ""):
            raise TargetError(f"{path}: {section}.voucher must be a voucher code")
    if not _WORD.fullmatch((cfg.get("link_type_expect") or {}).get("source") or ""):
        raise TargetError(f"{path}: link_type_expect.source must be letters, digits, '-' or '_'")
    lt = cfg.get("link_types")
    if not isinstance(lt, dict):
        raise TargetError(f"{path}: 'link_types' must be an object (type -> environment -> link)")
    for t, per_env in lt.items():
        if not _TYPE.fullmatch(t) or not isinstance(per_env, dict):
            raise TargetError(f"{path}: link_types.{t} needs a lower-case name and an object per environment")
        for env_name, link in per_env.items():
            if env_name not in envs or not _link_ok(link):
                raise TargetError(f"{path}: link_types.{t}.{env_name} needs a known environment, a host field and a slug")
    rewarded = cfg.get("rewarded_link_types", [])
    if not isinstance(rewarded, list) or any(t not in lt for t in rewarded) or len(set(rewarded)) != len(rewarded):
        raise TargetError(f"{path}: rewarded_link_types must be distinct link types from link_types")
    rl = cfg.get("reward_links", {})
    if not isinstance(rl, dict) or set(rl) - set(REWARD_MODELS):
        raise TargetError(f"{path}: reward_links keys must be from {list(REWARD_MODELS)}")
    for model, per_env in rl.items():
        for env_name, link in (per_env or {}).items():
            if env_name not in envs or not _link_ok(link) or link.get("link_type") not in lt:
                raise TargetError(f"{path}: reward_links.{model}.{env_name} needs a known environment, "
                                  "a host field, a slug and link_type (one of link_types)")
    rev = cfg.get("reward_events") or {}
    if not isinstance(rev.get("revenue_minor"), int) or isinstance(rev.get("revenue_minor"), bool) \
            or not 0 < rev["revenue_minor"] <= 10 ** 9 or not _WORD.fullmatch(rev.get("other_event") or ""):
        raise TargetError(f"{path}: reward_events needs revenue_minor (a positive integer) and other_event")
    return cfg


def load_flows(path=FLOWS) -> list[dict]:
    rows = json.loads(Path(path).read_text(encoding="utf-8")).get("flows")
    if not isinstance(rows, list) or not rows:
        raise TargetError(f"{path}: 'flows' must be a non-empty list")
    seen = set()
    for r in rows:
        name = r.get("flow") or ""
        where = f"{path}: flow '{name}'"
        if not _FLOW.fullmatch(name) or "__" in name or name in seen:
            raise TargetError(f"{where}: needs a unique lower-case name without '__'")
        seen.add(name)
        if not _FLOW.fullmatch(r.get("yaml") or ""):
            raise TargetError(f"{where}: needs 'yaml', the flow file's name")
        if r.get("kind") not in KINDS:
            raise TargetError(f"{where}: kind must be one of {', '.join(KINDS)}")
        if r.get("consent") not in CONSENTS:
            raise TargetError(f"{where}: consent must be allow or deny")
        needs_slot = r["kind"] in ("click", "problistic", "open", "reopen")
        if needs_slot != (r.get("slot") in SLOTS) or (not needs_slot and "slot" in r):
            raise TargetError(f"{where}: kind {r['kind']} {'needs' if needs_slot else 'takes no'} slot")
        if (r["kind"] == "reward") != (r.get("reward") in REWARD_MODELS) or (r["kind"] != "reward" and "reward" in r):
            raise TargetError(f"{where}: only (and every) reward kind takes reward, one of {list(REWARD_MODELS)}")
        if r.get("link_type_only") and not r.get("link_type_matrix"):
            raise TargetError(f"{where}: link_type_only needs link_type_matrix")
        if r.get("link_type_matrix") and r["kind"] not in ("click", "reopen"):
            raise TargetError(f"{where}: only click and reopen rows run per link type")
        if not isinstance(r.get("expected"), str) or not r["expected"]:
            raise TargetError(f"{where}: needs 'expected', what the flow asserts")
    return rows


def resolve_environment(cfg: dict, requested: str) -> str:
    name = (requested or "").strip().lower() or cfg["default_environment"]
    name = (cfg.get("aliases") or {}).get(name, name)
    if name not in cfg["environments"]:
        choices = sorted(set(cfg["environments"]) | set(cfg.get("aliases") or {}))
        raise TargetError(f"unknown e2e environment '{requested}': use one of {', '.join(choices)}")
    return name


def url_of(cfg: dict, env_name: str, link: dict) -> str:
    return f"https://{cfg['environments'][env_name][link['host']].lower()}/{link['slug']}"


def selected_link_types(cfg: dict, value: str) -> list[str]:
    known = list(cfg["link_types"])
    raw = (value or "").strip().lower()
    if raw in ("", "all"):
        return known
    if raw == "none":
        return []
    wanted = [x.strip() for x in raw.split(",") if x.strip()]
    unknown = [t for t in wanted if t not in known]
    if unknown or not wanted:
        raise TargetError(f"E2E_LINK_TYPES: unknown link type '{','.join(unknown)}' "
                          f"(use all, none or a comma list of {', '.join(known)})")
    return [t for t in known if t in wanted]


def resolve(environ=None, config=CONFIG) -> dict:
    environ = os.environ if environ is None else environ
    cfg = load_config(config)
    name = resolve_environment(cfg, environ.get("LINKTRAIL_ENV", ""))
    env = cfg["environments"][name]
    types = selected_link_types(cfg, environ.get("E2E_LINK_TYPES", ""))
    run = [t for t in types if name in cfg["link_types"][t]]
    rev = cfg["reward_events"]
    return {
        "LINKTRAIL_ENV": name,
        "BACKEND_URL": env["backend_url"],
        "BASE_OVERRIDE": env["backend_url"] if env["override_backend"] else "",
        "KEY_SECRET": env["key_secret"],
        "SUBDOMAIN_HOST": env["subdomain_host"],
        "CUSTOM_HOST": env["custom_host"],
        "CHECK_EARNING": "1" if env["backend_checks"]["earning"] else "0",
        "CHECK_OPEN_COUNT": "1" if env["backend_checks"]["open_count"] else "0",
        "CHECK_EVENTS": "1" if env["backend_checks"]["events"] else "0",
        "REWARDED_LINK_TYPES": ",".join(cfg.get("rewarded_link_types") or []),
        "REVENUE_MINOR": str(rev["revenue_minor"]),
        "OTHER_EVENT": rev["other_event"],
        "LINK_TYPES_RUN": ",".join(run),
        "LINK_TYPES_SKIPPED": ",".join(t for t in types if t not in run),
    }


def custom_data_re(voucher: str, link_type: str = "", source: str = "") -> str:
    """A Maestro (Java) regex for the panel's sorted customData JSON. Keys sort as
    linkType < source < voucher, so one pattern covers all three."""
    parts = []
    if link_type:
        parts += [f'"linkType":"{link_type}"', f'"source":"{source}"']
    parts.append(f'"voucher":"{voucher}"')
    return ".*" + ".*".join(parts) + ".*"


def jobs(platform: str, only=(), environ=None, config=CONFIG, flows=FLOWS) -> list[list[str]]:
    """The rows to run on <platform>, in table order with the link-type rows after the plain ones
    (type by type), each [row, yaml, kind, consent, url, link_type, reward, path_re, custom_data_re, skip]."""
    if platform not in PLATFORMS:
        raise TargetError(f"platform must be one of {', '.join(PLATFORMS)}")
    environ = os.environ if environ is None else environ
    cfg = load_config(config)
    table = load_flows(flows)
    name = resolve_environment(cfg, environ.get("LINKTRAIL_ENV", ""))
    types = selected_link_types(cfg, environ.get("E2E_LINK_TYPES", ""))
    ex, lte = cfg["expect"], cfg["link_type_expect"]
    by_name = {r["flow"]: r for r in table}
    want_rows, want_flows, want_kinds = set(), set(), set()
    for item in only:
        item = item.strip()
        if item.endswith(".yaml"):
            item = item[:-5]
        if item in KINDS:
            want_kinds.add(item)
        elif "__" in item:
            base, t = item.split("__", 1)
            if base not in by_name or not by_name[base].get("link_type_matrix") or t not in cfg["link_types"]:
                raise TargetError(f"unknown link-type row '{item}' (a link_type_matrix flow + '__' + a link type)")
            want_rows.add(item)
        elif item in by_name:
            want_flows.add(item)
        else:
            raise TargetError(f"unknown flow '{item}' (see e2e/e2e-flows.json)")

    def picked(row: str, r: dict) -> bool:
        if not only:
            return True
        return row in want_rows or r["flow"] in want_flows or r["kind"] in want_kinds

    plain, typed = [], []
    for r in table:
        kind, consent = r["kind"], r["consent"]
        base = [r["yaml"], kind, consent]
        if not r.get("link_type_only"):
            url, skip, path_re, data_re, link_type = "", "", ex["path"], custom_data_re(ex["voucher"]), ""
            if r.get("slot"):
                url = url_of(cfg, name, cfg["links"][r["slot"]])
            if kind == "reward":
                link = (cfg.get("reward_links") or {}).get(r["reward"], {}).get(name)
                path_re, data_re = lte["path"], custom_data_re(lte["voucher"])
                if link:
                    url, link_type = url_of(cfg, name, link), link["link_type"]
                else:
                    skip = f"no {name} link for {r['reward']} (reward_links in e2e/e2e-env.json)"
            if picked(r["flow"], r):
                plain.append([r["flow"], *base, url, link_type, r.get("reward", ""), path_re, data_re, skip])
        if r.get("link_type_matrix"):
            for t in types:
                row = f"{r['flow']}__{t}"
                if not picked(row, r):
                    continue
                link = cfg["link_types"][t].get(name)
                url = url_of(cfg, name, link) if link else ""
                skip = "" if link else f"no {name} link for type {t} (link_types in e2e/e2e-env.json)"
                typed.append((t, [row, *base, url, t, "", lte["path"],
                                  custom_data_re(lte["voucher"], t, lte["source"]), skip]))
    out = list(plain)
    for t in types:
        out += [j for tt, j in typed if tt == t]
    return out


def validate(config=CONFIG, flows=FLOWS, flow_dir=FLOW_DIR) -> list[str]:
    """→ problems (empty: all good): config + table load, every row's yaml exists per platform and
    every yaml (but _helpers) is used by a row, every jobs() line is well formed on every env."""
    problems = []
    try:
        cfg = load_config(config)
        table = load_flows(flows)
    except (TargetError, OSError, ValueError) as exc:
        return [str(exc)]
    used = {r["yaml"] for r in table}
    helpers = {"_stage_click", "send_events"}
    for platform in PLATFORMS:
        d = Path(flow_dir) / platform
        have = {p.stem for p in d.glob("*.yaml")}
        for y in sorted(used - have):
            problems.append(f"{platform}: no flow file {d.name}/{y}.yaml (used by e2e/e2e-flows.json)")
        for y in sorted(have - used - helpers):
            problems.append(f"{platform}: {d.name}/{y}.yaml is not in e2e/e2e-flows.json")
        for y in sorted(have):
            text = (d / f"{y}.yaml").read_text(encoding="utf-8")
            if "\n---\n" not in text or not text.startswith(("#", "appId:")):
                problems.append(f"{platform}: {y}.yaml is not a Maestro flow (appId header + '---')")
        for env_name in cfg["environments"]:
            try:
                rows = jobs(platform, environ={"LINKTRAIL_ENV": env_name}, config=config, flows=flows)
            except TargetError as exc:
                problems.append(f"{platform}/{env_name}: {exc}")
                continue
            for j in rows:
                if len(j) != 10 or any(SEP in v or "\n" in v for v in j):
                    problems.append(f"{platform}/{env_name}: bad job line for {j[0]}")
                elif j[2] != "offline" and j[2] != "event" and not j[4] and not j[9]:
                    problems.append(f"{platform}/{env_name}: {j[0]} has no link and no skip reason")
    return problems


def record(results: str, fields: dict) -> None:
    row = {k: v for k, v in fields.items() if v not in (None, "")}
    with open(results, "a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def _cell(text) -> str:
    return str(text or "").replace("|", "\\|").replace("\n", " ")


def summary(results: str, flows=FLOWS) -> str:
    rows = []
    if Path(results).exists():
        for line in Path(results).read_text(encoding="utf-8").splitlines():
            if line.strip():
                rows.append(json.loads(line))
    expected = {r["flow"]: r["expected"] for r in load_flows(flows)}
    icon = {"pass": "pass", "fail": "**FAIL**", "skipped": "skipped"}
    count = {k: sum(1 for r in rows if r.get("result") == k) for k in icon}
    out = [f"{count['pass']} passed, {count['fail']} failed, {count['skipped']} skipped", "",
           "| Platform | Flow | Result | Link | Expected | Backend / reason |", "| --- | --- | --- | --- | --- | --- |"]
    for r in rows:
        flow = r.get("flow", "")
        note = r.get("error") or r.get("backend") or ""
        if r.get("step") and r.get("result") == "fail":
            note = f"{r['step']}: {note}"
        out.append("| " + " | ".join(_cell(x) for x in (
            r.get("platform"), flow, icon.get(r.get("result"), r.get("result")), r.get("link"),
            expected.get(flow.split("__", 1)[0], ""), note)) + " |")
    return "\n".join(out) + "\n"


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("resolve")
    r.add_argument("--format", choices=["shell", "env"], default="shell")
    j = sub.add_parser("jobs")
    j.add_argument("--platform", required=True, choices=PLATFORMS)
    j.add_argument("only", nargs="*")
    sub.add_parser("validate")
    rec = sub.add_parser("record")
    rec.add_argument("--results", required=True)
    for k in ("platform", "flow", "result", "attempts", "duration", "link", "link-type", "backend", "step", "error"):
        rec.add_argument(f"--{k}", default="")
    s = sub.add_parser("summary")
    s.add_argument("--results", required=True)
    a = p.parse_args(argv)
    try:
        if a.cmd == "resolve":
            for k, v in resolve().items():
                print(f"{k}={shlex.quote(v)}" if a.format == "shell" else f"{k}={v}")
        elif a.cmd == "jobs":
            for row in jobs(a.platform, a.only):
                print(SEP.join(row))
        elif a.cmd == "validate":
            problems = validate()
            for prob in problems:
                print(f"ERROR: {prob}", file=sys.stderr)
            if problems:
                return 1
            print("e2e config OK: " + ", ".join(
                f"{pl} {env} {len(jobs(pl, environ={'LINKTRAIL_ENV': env}))} rows"
                for pl in PLATFORMS for env in load_config()["environments"]))
        elif a.cmd == "record":
            record(a.results, {"platform": a.platform, "flow": a.flow, "result": a.result,
                               "attempts": a.attempts, "duration": a.duration, "link": a.link,
                               "link_type": a.link_type, "backend": a.backend, "step": a.step, "error": a.error})
        elif a.cmd == "summary":
            sys.stdout.write(summary(a.results))
    except (TargetError, OSError, ValueError, KeyError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        if os.environ.get("GITHUB_ACTIONS"):
            print(f"::error title=e2e targets::{exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
