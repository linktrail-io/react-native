"""Unit tests for e2e/targets.py and e2e/verify.py (stdlib only).

  python3 -m unittest discover -s e2e/tests
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.parse import unquote

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import targets  # noqa: E402
import verify  # noqa: E402

FIELDS = ("row", "yaml", "kind", "consent", "url", "link_type", "reward", "path_re", "data_re", "skip")


def rows(platform="android", only=(), **env):
    return [dict(zip(FIELDS, j)) for j in targets.jobs(platform, only, environ=env)]


def by_row(platform="android", **env):
    return {r["row"]: r for r in rows(platform, **env)}


class TargetsTest(unittest.TestCase):
    def test_committed_config_validates(self):
        self.assertEqual(targets.validate(), [])

    def test_prod_is_the_default_and_dev_has_its_own_key(self):
        self.assertEqual(targets.resolve({})["LINKTRAIL_ENV"], "prod")
        self.assertEqual(targets.resolve({})["BASE_OVERRIDE"], "")
        dev = targets.resolve({"LINKTRAIL_ENV": "test"})
        self.assertEqual((dev["LINKTRAIL_ENV"], dev["KEY_SECRET"]), ("dev", "LINKTRAIL_TEST_KEY"))
        self.assertTrue(dev["BASE_OVERRIDE"].startswith("https://"))

    def test_unknown_environment_or_link_type_fails(self):
        with self.assertRaises(targets.TargetError):
            targets.resolve({"LINKTRAIL_ENV": "staging"})
        with self.assertRaises(targets.TargetError):
            targets.resolve({"E2E_LINK_TYPES": "general,vip"})

    def test_prod_rows(self):
        r = by_row()
        self.assertEqual(r["deferred_custom_allow"]["url"], "https://link.kynxlabs.com/summer-sale")
        self.assertEqual(r["deferred_subdomain_deny"]["url"], "https://kick.linktrail.io/discounted-product")
        self.assertEqual(r["deferred_subdomain_allow_problistic"]["url"], "https://kick.linktrail.io/ios-problistic")
        self.assertEqual(r["deferred_custom_allow__influencer"]["url"], "https://link.kynxlabs.com/e2e-influencer")
        self.assertEqual(r["deferred_revshare_allow"]["url"], "https://link.kynxlabs.com/e2e-revshare")
        self.assertEqual(r["deferred_revshare_allow"]["link_type"], "partner")
        # e2e-event does not exist on prod: listed, skipped with the reason, never failed.
        self.assertEqual(r["deferred_event_allow"]["url"], "")
        self.assertIn("no prod link for per_event", r["deferred_event_allow"]["skip"])
        # Re-engagement link-type rows only: no plain row.
        self.assertNotIn("reengagement_type_allow", r)
        self.assertIn("reengagement_type_deny__partner", r)
        self.assertEqual(len(r), 32)

    def test_dev_runs_the_event_row(self):
        r = by_row(LINKTRAIL_ENV="dev")
        self.assertEqual(r["deferred_event_allow"]["url"], "https://dev-test.kynxlabs.com/e2e-event")
        self.assertEqual(r["deferred_event_allow"]["skip"], "")

    def test_link_type_selection(self):
        names = [r["row"] for r in rows(E2E_LINK_TYPES="none")]
        self.assertFalse(any("__" in n for n in names))
        names = [r["row"] for r in rows(E2E_LINK_TYPES="partner")]
        self.assertEqual([n for n in names if "__" in n], [
            "deferred_custom_allow__partner", "deferred_custom_deny__partner",
            "reengagement_type_allow__partner", "reengagement_type_deny__partner"])

    def test_a_type_without_a_link_is_skipped_not_failed(self):
        cfg = json.loads(targets.CONFIG.read_text())
        del cfg["link_types"]["campaign"]["prod"]
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "env.json"
            path.write_text(json.dumps(cfg))
            r = {j[0]: j for j in targets.jobs("ios", environ={}, config=path)}
            self.assertEqual(targets.resolve({}, config=path)["LINK_TYPES_SKIPPED"], "campaign")
        self.assertIn("no prod link for type campaign", r["deferred_custom_allow__campaign"][9])
        self.assertEqual(r["deferred_custom_allow__general"][9], "")

    def test_only_filters_by_flow_row_or_kind(self):
        self.assertEqual([r["row"] for r in rows(only=["consent_prompt.yaml"])], ["consent_prompt"])
        self.assertEqual([r["row"] for r in rows(only=["deferred_custom_deny__general"])], ["deferred_custom_deny__general"])
        self.assertEqual(len(rows(only=["deferred_custom_allow"])), 5)
        self.assertEqual({r["kind"] for r in rows(only=["problistic"])}, {"problistic"})
        with self.assertRaises(targets.TargetError):
            rows(only=["deferred_custom_allow__vip"])
        with self.assertRaises(targets.TargetError):
            rows(only=["play_voucher_allow"])

    def test_link_type_rows_match_link_meta(self):
        r = by_row()
        self.assertEqual(r["deferred_custom_allow"]["data_re"], '.*"voucher":"SUMMER25".*')
        self.assertEqual(r["deferred_custom_allow__partner"]["data_re"],
                         '.*"linkType":"partner".*"source":"e2e".*"voucher":"SUMMER25".*')
        self.assertEqual(r["deferred_custom_allow__partner"]["path_re"], "/products/aj1")

    def test_summary(self):
        with tempfile.TemporaryDirectory() as d:
            res = Path(d) / "r.jsonl"
            targets.record(str(res), {"platform": "ios", "flow": "deferred_custom_allow__partner", "result": "pass"})
            targets.record(str(res), {"platform": "ios", "flow": "track_event", "result": "fail",
                                      "step": "maestro: track_event", "error": "a|b"})
            out = targets.summary(str(res))
        self.assertIn("1 passed, 1 failed, 0 skipped", out)
        self.assertIn("maestro: track_event: a\\|b", out)


def click(**kw):
    d = {"installRecorded": True, "attributed": True, "matchType": "click_token", "installCount": 1,
         "openCount": 0, "linkType": "general", "fraudReasons": [], "reward": None,
         "earning": {"counted": False, "amountMinor": 0, "currency": "GBP", "excludedAsFraud": False}}
    d.update(kw)
    return d


DENIED = {"installRecorded": False, "attributed": False, "matchType": None, "installCount": 0}
PER_INSTALL = {"model": "per_install", "amountMinor": 50, "currency": "GBP"}


def earned(amount, counted=True):
    return {"counted": counted, "amountMinor": amount, "currency": "GBP", "excludedAsFraud": False}


class VerifyTest(unittest.TestCase):
    def test_allow_install(self):
        self.assertEqual(verify.check("allow", click())[0], "ok")
        self.assertEqual(verify.check("allow", click(installCount=0))[0], "bad")
        status, step, detail, _ = verify.check("allow", click(fraudReasons=["ip_velocity"]))
        self.assertEqual((status, step), ("fail", verify.FRAUD_STEP))
        self.assertIn("more than 20 installs", detail)

    def test_deny_install(self):
        self.assertEqual(verify.check("deny", click(**DENIED))[0], "ok")
        self.assertEqual(verify.check("deny", click())[0], "bad")

    def test_rewarded_type_earns_per_install_on_allow_only(self):
        rewarded = ("influencer", "partner")
        ok = click(linkType="partner", reward=PER_INSTALL, earning=earned(50))
        self.assertEqual(verify.check("allow", ok, "partner", rewarded)[0], "ok")
        self.assertEqual(verify.check("allow", click(linkType="partner", reward=PER_INSTALL), "partner", rewarded)[0], "bad")
        deny = click(**DENIED, linkType="influencer", reward=PER_INSTALL)
        self.assertEqual(verify.check("deny", deny, "influencer", rewarded)[0], "ok")
        self.assertEqual(verify.check("deny", dict(deny, earning=earned(50)), "influencer", rewarded)[0], "bad")
        # Unrewarded types: no reward at all.
        self.assertEqual(verify.check("allow", click(linkType="general"), "general", rewarded)[0], "ok")
        self.assertEqual(verify.check("allow", click(linkType="general", reward=PER_INSTALL), "general", rewarded)[0], "bad")
        self.assertEqual(verify.check("allow", click(linkType="campaign"), "general", rewarded)[0], "bad")

    def test_reward_check_off_or_missing(self):
        status, _, _, checks = verify.check("allow", click(), "partner", ("partner",), earning=False)
        self.assertEqual(status, "ok")
        self.assertIn(("reward", "skipped"), [(n, r) for n, r, _ in checks])
        bare = {k: v for k, v in click().items() if k != "earning"}
        self.assertEqual(verify.check("allow", bare, "general")[0], "missing")

    def test_reopen(self):
        base = click(openCount=2)
        self.assertEqual(verify.check("reopen_allow", click(openCount=3), baseline=base)[0], "ok")
        self.assertEqual(verify.check("reopen_allow", click(openCount=2), baseline=base)[0], "bad")
        self.assertEqual(verify.check("reopen_deny", click(openCount=2), baseline=base)[0], "ok")
        self.assertEqual(verify.check("reopen_allow", click(openCount=3, installCount=2), baseline=base)[0], "bad")
        self.assertEqual(verify.check("reopen_allow", click(openCount=3, earning=earned(50)), baseline=base)[0], "bad")
        status, _, _, checks = verify.check("reopen_allow", click(openCount=2), baseline=base, open_count=False)
        self.assertEqual(status, "ok")
        self.assertIn(("open count", "skipped"), [(n, r) for n, r, _ in checks])

    def test_per_event_earning(self):
        reward = {"model": "per_event", "amountMinor": 25, "currency": "GBP", "eventName": "signup"}
        base = click(linkType="influencer", reward=reward)
        after = click(linkType="influencer", reward=reward, earning=earned(50))
        kw = dict(link_type="influencer", baseline=base, model="per_event")
        self.assertEqual(verify.check("events_allow", after, **kw)[0], "ok")
        self.assertEqual(verify.check("events_allow", click(linkType="influencer", reward=reward, earning=earned(25)), **kw)[0], "bad")
        self.assertEqual(verify.check("events_allow", dict(after, linkType="partner"), **kw)[0], "fail")
        denied = click(**DENIED, linkType="influencer", reward=reward)
        self.assertEqual(verify.check("events_deny", denied, **kw)[0], "ok")

    def test_rev_share_earning_and_events(self):
        reward = {"model": "rev_share", "rateBps": 1000, "currency": "GBP"}
        base = click(linkType="partner", reward=reward)
        events = {"count": 2, "byName": {"e2e_revenue": 2},
                  "revenue": [{"currency": "GBP", "amountMinor": 1999}, {"currency": "USD", "amountMinor": 1999}]}
        after = click(linkType="partner", reward=reward, earning=earned(199), events=events)
        kw = dict(link_type="partner", baseline=base, model="rev_share", revenue_minor=1999)
        self.assertEqual(verify.check("events_allow", after, **kw)[0], "ok")
        self.assertEqual(verify.check("events_allow", after, events=True, **kw)[0], "ok")
        wrong = dict(after, events=dict(events, count=1))
        self.assertEqual(verify.check("events_allow", wrong, **kw)[0], "ok")   # events check off
        self.assertEqual(verify.check("events_allow", wrong, events=True, **kw)[0], "bad")

    def test_plan_events(self):
        per_event = click(reward={"model": "per_event", "amountMinor": 25, "eventName": "signup"})
        status, _, events = verify.plan_events("per_event", per_event, 1999, "e2e_other")
        self.assertEqual((status, [e["name"] for e in events]), ("ok", ["signup", "signup", "e2e_other"]))
        rev = click(reward={"model": "rev_share", "rateBps": 1000, "currency": "JPY"})
        _, _, events = verify.plan_events("rev_share", rev, 1999, "e2e_other")
        self.assertEqual(events, [{"name": "e2e_revenue", "value": "1999", "currency": "JPY"},
                                  {"name": "e2e_revenue", "value": "19.99", "currency": "USD"}])
        url = verify.events_url(events)
        self.assertTrue(url.startswith("kickflip://e2e/events?list="))
        self.assertEqual(json.loads(unquote(url.split("=", 1)[1])), events)
        self.assertEqual(verify.plan_events("rev_share", click(), 1999, "e2e_other")[0], "bad")


if __name__ == "__main__":
    unittest.main()
