"""Held-out evaluation set for c06. The Judge runs this; nobody else reads it.

Four metrics.

  digest_cases_passed   the properties content_digest has to hold
  change_cases_passed   detect_changes across all four buckets, and their ordering
  budget_cases_passed   plan_reconversion's priority order, its boundary, its stopping rule
  replay_cases_passed   replay_scores and staleness_report, including the five categories

The first three carry no slack: each case has one right answer. The last one is where
staleness_report earns its keep, so it gets the largest and most varied case set and
the only threshold with room in it.

None of the snapshots, questions, or scenarios below come from
corpus/c06-snapshots.json. That file is for development. This is a second, separate
world, so a submission tuned to the development snapshot has been tuned to the wrong
one.
"""

import sys
import traceback
from importlib import util
from pathlib import Path

HERE = Path(__file__).resolve()
CHALLENGE = HERE.parents[2]
ENTRYPOINT = CHALLENGE / "work" / "freshness.py"

EXPORTS = ("content_digest", "detect_changes", "plan_reconversion", "replay_scores", "staleness_report")
TOLERANCE = 1e-9

METRIC_NAMES = ("digest_cases_passed", "change_cases_passed", "budget_cases_passed", "replay_cases_passed")


def report(name, value):
    print(f"metric {name} {value:.6f}")


def bail(message):
    """An interface problem is not a low score, so it is reported as itself."""
    print("INTERFACE PROBLEM")
    print(message)
    print("The brief pins the entrypoint at work/freshness.py and the five names it exports.")
    for name in METRIC_NAMES:
        report(name, 0.0)
    sys.exit(1)


def load_submission():
    if not ENTRYPOINT.exists():
        bail(f"nothing at work/freshness.py (looked in {ENTRYPOINT.parent}).")
    spec = util.spec_from_file_location("submission_freshness", ENTRYPOINT)
    module = util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception:
        bail("work/freshness.py raised while it was being imported:\n" + traceback.format_exc())
    missing = [name for name in EXPORTS if not callable(getattr(module, name, None))]
    if missing:
        bail("work/freshness.py does not export every function the brief pins: " + ", ".join(missing))
    return module


MOD = load_submission()
content_digest = MOD.content_digest
detect_changes = MOD.detect_changes
plan_reconversion = MOD.plan_reconversion
replay_scores = MOD.replay_scores
staleness_report = MOD.staleness_report


# ------------------------------------------------------------------------- content_digest

def _run_digest_cases(failures):
    total = 0
    passed = 0

    def check(name, ok, detail=""):
        nonlocal total, passed
        total += 1
        if ok:
            passed += 1
        else:
            failures.append(f"digest: {name}" + (f": {detail}" if detail else ""))

    a = content_digest("The nightly job runs at 02:00 UTC.")
    b = content_digest("The nightly job runs at 02:00 UTC.")
    check("determinism", a == b, f"same text produced {a!r} then {b!r}")
    check("returns a string", isinstance(a, str), f"got {type(a).__name__}")
    check("returns something non-empty", bool(a), "got an empty digest")

    c = content_digest("The nightly job runs at 03:30 UTC.")
    check("different text, different digest", a != c)

    same_length_1 = content_digest("aaaaaaaaaa")
    same_length_2 = content_digest("bbbbbbbbbb")
    check("same length, different content, different digest", same_length_1 != same_length_2)

    prefix_1 = content_digest("report")
    prefix_2 = content_digest("report v2")
    check("a suffix appended changes the digest", prefix_1 != prefix_2)

    empty = content_digest("")
    check("empty text does not raise and returns a string", isinstance(empty, str))
    check("empty text differs from non-empty text", empty != a)

    unicode_1 = content_digest("Couté seulement 176 € par million de pages.")
    unicode_2 = content_digest("Couté seulement 177 € par million de pages.")
    check("unicode text does not raise", isinstance(unicode_1, str))
    check("unicode text is sensitive to a one-character edit", unicode_1 != unicode_2)

    return passed / total


# ------------------------------------------------------------------------- detect_changes

def _doc(text, pages):
    return {"text": text, "pages": pages}


def _run_change_cases(failures):
    total = 0
    passed = 0

    def check_case(name, previous, current, expected):
        nonlocal total, passed
        total += 1
        try:
            got = detect_changes(previous, current)
        except Exception:
            failures.append(f"change: {name}: raised\n{traceback.format_exc()}")
            return

        ok = True
        for key in ("added", "changed", "removed", "unchanged"):
            if key not in got:
                failures.append(f"change: {name}: missing key {key!r} in the result")
                ok = False
        if not ok:
            return

        for key in ("added", "changed"):
            got_ids = [item.get("id") for item in got[key]]
            got_pages = {item.get("id"): item.get("pages") for item in got[key]}
            expected_ids = [item[0] for item in expected[key]]
            expected_pages = {item[0]: item[1] for item in expected[key]}
            if got_ids != expected_ids:
                failures.append(f"change: {name}: {key} ids expected {expected_ids}, got {got_ids}")
                ok = False
            elif got_pages != expected_pages:
                failures.append(f"change: {name}: {key} pages expected {expected_pages}, got {got_pages}")
                ok = False

        for key in ("removed", "unchanged"):
            if got[key] != expected[key]:
                failures.append(f"change: {name}: {key} expected {expected[key]}, got {got[key]}")
                ok = False

        if ok:
            passed += 1

    check_case(
        "an ordinary mix of all four buckets",
        {
            "r1": _doc("Quota resets every Monday.", 1),
            "r2": _doc("The retention window is ninety days.", 2),
            "r3": _doc("Backups run nightly.", 1),
        },
        {
            "r1": _doc("Quota resets every Monday.", 1),
            "r2": _doc("The retention window is sixty days.", 2),
            "r4": _doc("Failover pages the on-duty engineer.", 3),
        },
        {
            "added": [("r4", 3)],
            "changed": [("r2", 2)],
            "removed": ["r3"],
            "unchanged": ["r1"],
        },
    )

    check_case(
        "a page-count edit with the text left alone is not a change",
        {"d1": _doc("Nothing here changed.", 5)},
        {"d1": _doc("Nothing here changed.", 9)},
        {"added": [], "changed": [], "removed": [], "unchanged": ["d1"]},
    )

    check_case(
        "everything added",
        {},
        {"n1": _doc("first", 1), "n2": _doc("second", 2)},
        {"added": [("n1", 1), ("n2", 2)], "changed": [], "removed": [], "unchanged": []},
    )

    check_case(
        "everything removed",
        {"o1": _doc("first", 1), "o2": _doc("second", 2)},
        {},
        {"added": [], "changed": [], "removed": ["o1", "o2"], "unchanged": []},
    )

    check_case(
        "identical snapshots",
        {"s1": _doc("stays put", 1), "s2": _doc("also stays put", 4)},
        {"s1": _doc("stays put", 1), "s2": _doc("also stays put", 4)},
        {"added": [], "changed": [], "removed": [], "unchanged": ["s1", "s2"]},
    )

    check_case(
        "additions come back sorted by id regardless of insertion order",
        {},
        {"zed": _doc("last alphabetically", 1), "alpha": _doc("first alphabetically", 2)},
        {"added": [("alpha", 2), ("zed", 1)], "changed": [], "removed": [], "unchanged": []},
    )

    check_case(
        "both snapshots empty",
        {},
        {},
        {"added": [], "changed": [], "removed": [], "unchanged": []},
    )

    return passed / total


# ---------------------------------------------------------------------- plan_reconversion

def _run_budget_cases(failures):
    total = 0
    passed = 0

    def added(*pairs):
        return [{"id": doc_id, "pages": pages} for doc_id, pages in pairs]

    def changed(*pairs):
        return [{"id": doc_id, "pages": pages} for doc_id, pages in pairs]

    def check_case(name, changes, cost_per_page, budget, expected_convert_ids, expected_skipped_ids, expected_spent):
        nonlocal total, passed
        total += 1
        try:
            got = plan_reconversion(changes, cost_per_page, budget)
        except Exception:
            failures.append(f"budget: {name}: raised\n{traceback.format_exc()}")
            return

        ok = True
        for key in ("convert", "skipped", "spent", "budget", "remaining"):
            if key not in got:
                failures.append(f"budget: {name}: missing key {key!r} in the result")
                ok = False
        if not ok:
            return

        got_convert_ids = [item.get("id") for item in got["convert"]]
        got_skipped_ids = [item.get("id") for item in got["skipped"]]

        if got_convert_ids != expected_convert_ids:
            failures.append(f"budget: {name}: convert expected {expected_convert_ids}, got {got_convert_ids}")
            ok = False
        if got_skipped_ids != expected_skipped_ids:
            failures.append(f"budget: {name}: skipped expected {expected_skipped_ids}, got {got_skipped_ids}")
            ok = False
        if abs(got["spent"] - expected_spent) > 1e-6:
            failures.append(f"budget: {name}: spent expected {expected_spent}, got {got['spent']}")
            ok = False
        if abs(got["remaining"] - (budget - expected_spent)) > 1e-6:
            failures.append(
                f"budget: {name}: remaining expected {budget - expected_spent}, got {got['remaining']}"
            )
            ok = False
        for item in got["skipped"]:
            if item.get("reason") != "insufficient budget":
                failures.append(
                    f"budget: {name}: skipped entry {item.get('id')!r} carries reason "
                    f"{item.get('reason')!r}, expected 'insufficient budget'"
                )
                ok = False

        if ok:
            passed += 1

    check_case(
        "everything fits",
        {"added": added(("d1", 2), ("d2", 3)), "changed": changed(("d3", 1)), "removed": [], "unchanged": []},
        2.0,
        100.0,
        ["d1", "d2", "d3"],
        [],
        12.0,
    )

    check_case(
        "nothing fits, the very first candidate is already too big",
        {"added": added(("d1", 50)), "changed": [], "removed": [], "unchanged": []},
        10.0,
        5.0,
        [],
        ["d1"],
        0.0,
    )

    check_case(
        "a candidate that lands exactly on the budget is kept",
        {"added": added(("d1", 5)), "changed": [], "removed": [], "unchanged": []},
        2.0,
        10.0,
        ["d1"],
        [],
        10.0,
    )

    check_case(
        "stop rather than reach past a candidate that does not fit",
        {"added": added(("d1", 10), ("d2", 1)), "changed": [], "removed": [], "unchanged": []},
        1.0,
        5.0,
        [],
        ["d1", "d2"],
        0.0,
    )

    check_case(
        "added outranks changed even when changed sorts first alphabetically",
        {"added": added(("b-doc", 1)), "changed": changed(("a-doc", 1)), "removed": [], "unchanged": []},
        1.0,
        1.0,
        ["b-doc"],
        ["a-doc"],
        1.0,
    )

    check_case(
        "a zero-page candidate costs nothing and always fits",
        {"added": added(("d1", 0)), "changed": [], "removed": [], "unchanged": []},
        5.0,
        0.0,
        ["d1"],
        [],
        0.0,
    )

    check_case(
        "no candidates at all",
        {"added": [], "changed": [], "removed": [], "unchanged": []},
        1.0,
        10.0,
        [],
        [],
        0.0,
    )

    check_case(
        "cost_per_page of zero converts everything however large",
        {"added": added(("d1", 1000)), "changed": [], "removed": [], "unchanged": []},
        0.0,
        0.0,
        ["d1"],
        [],
        0.0,
    )

    return passed / total


# --------------------------------------------------------------- replay_scores + staleness

def _run_replay_cases(failures):
    total = 0
    passed = 0

    def check(name, ok, detail=""):
        nonlocal total, passed
        total += 1
        if ok:
            passed += 1
        else:
            failures.append(f"replay: {name}" + (f": {detail}" if detail else ""))

    # -- direct replay_scores mechanics -----------------------------------------------

    corpus = {
        "doc-a": _doc("The nightly job emails ops on failure.", 1),
        "doc-b": _doc("Quota RESETS every    Monday at 09:00.", 1),
    }

    q_all_pass = replay_scores([{"id": "q1", "doc_id": "doc-a", "checks": ["emails ops on failure"]}], corpus)
    check(
        "a matching check scores 1.0 and marks the document present",
        q_all_pass["q1"]["score"] == 1.0 and q_all_pass["q1"]["doc_present"] is True,
        f"got {q_all_pass['q1']}",
    )

    q_missing_doc = replay_scores([{"id": "q2", "doc_id": "doc-z", "checks": ["anything"]}], corpus)
    check(
        "a question naming a document not in the snapshot scores 0.0 and marks it absent",
        q_missing_doc["q2"]["score"] == 0.0 and q_missing_doc["q2"]["doc_present"] is False,
        f"got {q_missing_doc['q2']}",
    )

    q_partial = replay_scores(
        [{"id": "q3", "doc_id": "doc-a", "checks": ["emails ops on failure", "pages an engineer"]}], corpus
    )
    check(
        "one of two checks passing scores 0.5",
        abs(q_partial["q3"]["score"] - 0.5) < TOLERANCE and q_partial["q3"]["checks_passed"] == 1,
        f"got {q_partial['q3']}",
    )

    q_case = replay_scores([{"id": "q4", "doc_id": "doc-b", "checks": ["resets every monday"]}], corpus)
    check(
        "a check is matched case-insensitively",
        q_case["q4"]["score"] == 1.0,
        f"got {q_case['q4']}",
    )

    q_ws = replay_scores([{"id": "q5", "doc_id": "doc-b", "checks": ["Quota resets every Monday"]}], corpus)
    check(
        "a check is matched with whitespace runs collapsed",
        q_ws["q5"]["score"] == 1.0,
        f"got {q_ws['q5']}",
    )

    q_none = replay_scores([{"id": "q6", "doc_id": "doc-a", "checks": []}], corpus)
    check(
        "a question with no checks and a present document scores 1.0",
        q_none["q6"]["score"] == 1.0 and q_none["q6"]["doc_present"] is True,
        f"got {q_none['q6']}",
    )

    q_none_missing = replay_scores([{"id": "q7", "doc_id": "doc-z", "checks": []}], corpus)
    check(
        "a question with no checks but an absent document still scores 0.0",
        q_none_missing["q7"]["score"] == 0.0 and q_none_missing["q7"]["doc_present"] is False,
        f"got {q_none_missing['q7']}",
    )

    # -- direct staleness_report category logic ----------------------------------------

    def row(score, present):
        return {"score": score, "doc_present": present, "checks_passed": 0, "checks_total": 0}

    direct = staleness_report(
        {
            "stable-q": row(1.0, True),
            "improved-q": row(0.5, True),
            "regressed-q": row(1.0, True),
            "appeared-q": row(0.0, False),
            "disappeared-q": row(1.0, True),
        },
        {
            "stable-q": row(1.0, True),
            "improved-q": row(1.0, True),
            "regressed-q": row(0.0, True),
            "appeared-q": row(1.0, True),
            "disappeared-q": row(0.0, False),
        },
    )
    expected_categories = {
        "stable-q": "stable",
        "improved-q": "improved",
        "regressed-q": "regressed",
        "appeared-q": "doc-appeared",
        "disappeared-q": "doc-disappeared",
    }
    for qid, expected in expected_categories.items():
        got_row = direct.get("questions", {}).get(qid, {})
        check(
            f"category for {qid} is {expected}",
            got_row.get("category") == expected,
            f"got {got_row.get('category')!r}",
        )

    for category, expected_count in {
        "stable": 1,
        "improved": 1,
        "regressed": 1,
        "doc-appeared": 1,
        "doc-disappeared": 1,
    }.items():
        got_count = direct.get("summary", {}).get(category)
        check(
            f"summary count for {category} is {expected_count}",
            got_count == expected_count,
            f"got {got_count!r}",
        )

    try:
        staleness_report({"only-here": row(1.0, True)}, {"different-id": row(1.0, True)})
        check("mismatched question ids raise ValueError", False, "no exception was raised")
    except ValueError:
        check("mismatched question ids raise ValueError", True)
    except Exception:
        check("mismatched question ids raise ValueError", False, "raised the wrong exception type")

    # -- an end-to-end scenario run through replay_scores on both sides ---------------

    before_corpus = {
        "sched": _doc("The nightly job runs at 02:00 UTC and emails ops on failure.", 1),
        "quota": _doc("Quota resets every Monday at 09:00 local time.", 1),
        "audit": _doc("The retention window for audit logs is ninety days.", 2),
        "fail": _doc("The failover process pages the on-duty engineer.", 1),
    }
    after_corpus = {
        "sched": _doc("The nightly job runs at 03:30 UTC and emails ops on failure.", 1),
        "audit": _doc("The retention window for audit logs is ninety days.", 2),
        "fail": _doc("The failover process pages the on-duty engineer and updates the status page.", 1),
        "backup": _doc("Backups are copied to cold storage weekly.", 1),
    }
    scenario_questions = [
        {"id": "still-emails", "doc_id": "sched", "checks": ["emails ops on failure"]},
        {"id": "old-time", "doc_id": "sched", "checks": ["02:00 UTC"]},
        {"id": "quota-gone", "doc_id": "quota", "checks": ["resets every Monday"]},
        {"id": "audit-window", "doc_id": "audit", "checks": ["retention window", "ninety days"]},
        {"id": "failover-detail", "doc_id": "fail", "checks": ["pages the on-duty engineer", "updates the status page"]},
        {"id": "backup-new", "doc_id": "backup", "checks": ["cold storage"]},
    ]

    scenario_before = replay_scores(scenario_questions, before_corpus)
    scenario_after = replay_scores(scenario_questions, after_corpus)
    scenario_report = staleness_report(scenario_before, scenario_after)
    scenario_categories = {
        qid: row["category"] for qid, row in scenario_report.get("questions", {}).items()
    }

    expected_scenario = {
        "still-emails": "stable",
        "old-time": "regressed",
        "quota-gone": "doc-disappeared",
        "audit-window": "stable",
        "failover-detail": "improved",
        "backup-new": "doc-appeared",
    }
    for qid, expected in expected_scenario.items():
        check(
            f"end-to-end scenario: {qid} is {expected}",
            scenario_categories.get(qid) == expected,
            f"got {scenario_categories.get(qid)!r}",
        )

    return passed / total


def main():
    failures = []

    digest_score = _run_digest_cases(failures)
    change_score = _run_change_cases(failures)
    budget_score = _run_budget_cases(failures)
    replay_score = _run_replay_cases(failures)

    report("digest_cases_passed", digest_score)
    report("change_cases_passed", change_score)
    report("budget_cases_passed", budget_score)
    report("replay_cases_passed", replay_score)

    if failures:
        print("\nwhat went wrong:", file=sys.stderr)
        for line in failures:
            print(f"  {line}", file=sys.stderr)


main()
