"""Run your freshness service over the development snapshot and print what it produces.

    python3 work/dev_check.py

Nothing here is the grader. It runs a different, held-out snapshot and its own
question set, so a number printed by this file is an estimate and not the mark.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import freshness  # noqa: E402

TOPIC = Path(__file__).resolve().parents[3]
SNAPSHOTS = TOPIC / "corpus" / "c06-snapshots.json"

COST_PER_PAGE = 4.0
BUDGET = 10.0


def main():
    data = json.loads(SNAPSHOTS.read_text())
    before = data["before"]
    after = data["after"]
    questions = data["questions"]

    changes = freshness.detect_changes(before, after)
    print("changes:")
    for key in ("added", "changed", "removed", "unchanged"):
        print(f"  {key}: {changes[key]}")

    plan = freshness.plan_reconversion(changes, COST_PER_PAGE, BUDGET)
    print(f"\nreconversion plan at {COST_PER_PAGE}/page, budget {BUDGET}:")
    print(f"  convert: {plan['convert']}")
    print(f"  skipped: {plan['skipped']}")
    print(f"  spent {plan['spent']}, remaining {plan['remaining']}")

    before_scores = freshness.replay_scores(questions, before)
    after_scores = freshness.replay_scores(questions, after)
    report = freshness.staleness_report(before_scores, after_scores)

    print("\nstaleness report:")
    for qid, row in report["questions"].items():
        print(
            f"  {qid}: {row['category']}  "
            f"before={row['before_score']:.2f}  after={row['after_score']:.2f}"
        )
    print(f"  summary: {report['summary']}")


main()
