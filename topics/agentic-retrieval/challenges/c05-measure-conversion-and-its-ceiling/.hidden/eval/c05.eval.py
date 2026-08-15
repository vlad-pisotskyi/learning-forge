"""Held-out evaluation set for c05. The Judge runs this; nobody else reads it.

Four metrics, one pool of cases each.

  iou_cases_passed       box_iou alone: geometry, no ranking involved
  map_cases_passed       match_boxes and mean_average_precision together, since the
                          second is built on the first and a mistake in either shows
                          up the same way, as a wrong number back
  agreement_cases_passed pairwise_agreement, which is mean_average_precision run
                          between annotators instead of between a model and a truth
  coverage_cases_passed  conversion_coverage alone

Every expected value below is written as the arithmetic it comes from, or is
accompanied by a comment showing the by-hand derivation, so a failing case can be
read against the rule it tests rather than trusted on faith.

Thresholds live in challenge.json and are compared by the CLI. This file prints
numbers.
"""

import sys
import traceback
from importlib import util
from pathlib import Path

HERE = Path(__file__).resolve()
CHALLENGE = HERE.parents[2]
ENTRYPOINT = CHALLENGE / "work" / "conversion.py"

EXPORTS = ("box_iou", "match_boxes", "mean_average_precision", "pairwise_agreement", "conversion_coverage")
TOLERANCE = 1e-6


def report(name, value):
    print(f"metric {name} {value:.6f}")


def bail(message):
    """An interface problem is not a low score, so it is reported as itself."""
    print("INTERFACE PROBLEM")
    print(message)
    print("The brief pins the entrypoint at work/conversion.py and the five names it exports.")
    for name in ("iou_cases_passed", "map_cases_passed", "agreement_cases_passed", "coverage_cases_passed"):
        report(name, 0.0)
    sys.exit(1)


def load_submission():
    if not ENTRYPOINT.exists():
        bail(f"nothing at work/conversion.py (looked in {ENTRYPOINT.parent}).")
    spec = util.spec_from_file_location("submission_conversion", ENTRYPOINT)
    module = util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception:
        bail("work/conversion.py raised while it was being imported:\n" + traceback.format_exc())
    missing = [name for name in EXPORTS if not hasattr(module, name)]
    if missing:
        bail(f"work/conversion.py does not export: {', '.join(missing)}.")
    not_callable = [name for name in EXPORTS if not callable(getattr(module, name))]
    if not_callable:
        bail(f"these names are exported but are not callable: {', '.join(not_callable)}.")
    return module


def smoke_test(module):
    """Check the five return shapes before scoring anything against them."""
    iou = module.box_iou((0.0, 0.0, 10.0, 10.0), (0.0, 0.0, 10.0, 10.0))
    if not isinstance(iou, (int, float)):
        bail(f"box_iou has to return a number, got {iou!r}.")

    pred = [{"box": (0.0, 0.0, 10.0, 10.0), "label": "text", "score": 1.0}]
    truth = [{"box": (0.0, 0.0, 10.0, 10.0), "label": "text"}]
    matches = module.match_boxes(pred, truth, 0.5)
    if not isinstance(matches, list):
        bail(f"match_boxes has to return a list of (predicted_index, truth_index) pairs, got {matches!r}.")

    m = module.mean_average_precision(pred, truth, [0.5])
    if not isinstance(m, (int, float)):
        bail(f"mean_average_precision has to return a number, got {m!r}.")

    a = module.pairwise_agreement([truth, truth])
    if not isinstance(a, (int, float)):
        bail(f"pairwise_agreement has to return a number, got {a!r}.")

    c = module.conversion_coverage("hello world", "hello world")
    if not isinstance(c, (int, float)):
        bail(f"conversion_coverage has to return a number, got {c!r}.")


SUBMISSION = load_submission()
smoke_test(SUBMISSION)
box_iou = SUBMISSION.box_iou
match_boxes = SUBMISSION.match_boxes
mean_average_precision = SUBMISSION.mean_average_precision
pairwise_agreement = SUBMISSION.pairwise_agreement
conversion_coverage = SUBMISSION.conversion_coverage


# ------------------------------------------------------------------------- box_iou

IOU_CASES = [
    ("identical boxes", (0.0, 0.0, 10.0, 10.0), (0.0, 0.0, 10.0, 10.0), 1.0),
    ("no overlap at all", (0.0, 0.0, 10.0, 10.0), (20.0, 20.0, 30.0, 30.0), 0.0),
    # boxes share only an edge: intersection width is zero
    ("touching along one edge", (0.0, 0.0, 10.0, 10.0), (10.0, 0.0, 20.0, 10.0), 0.0),
    # intersection (5,5)-(10,10) = 25; areas 100 and 100; union 175; 25/175 = 1/7
    ("ordinary partial overlap", (0.0, 0.0, 10.0, 10.0), (5.0, 5.0, 15.0, 15.0), 1.0 / 7.0),
    # one box fully inside the other: intersection 36, union 100; 36/100
    ("one box nested in the other", (0.0, 0.0, 10.0, 10.0), (2.0, 2.0, 8.0, 8.0), 0.36),
    # area 100 and area 200, intersection 100 (the smaller box entirely inside the
    # overlap region): 100 / (100 + 200 - 100) = 0.5 exactly
    ("intersection equals the smaller area", (0.0, 0.0, 10.0, 10.0), (0.0, 0.0, 10.0, 20.0), 0.5),
    ("a degenerate zero-width box", (5.0, 0.0, 5.0, 10.0), (0.0, 0.0, 10.0, 10.0), 0.0),
    ("identical boxes in negative coordinates", (-15.0, -15.0, -5.0, -5.0), (-15.0, -15.0, -5.0, -5.0), 1.0),
]


def score_iou(failures):
    passed = 0
    for name, a, b, expected in IOU_CASES:
        try:
            got = box_iou(a, b)
            ok = isinstance(got, (int, float)) and abs(float(got) - expected) <= TOLERANCE
        except Exception as err:
            got = f"raised {type(err).__name__}: {err}"
            ok = False
        if ok:
            passed += 1
        else:
            failures.append(f"box_iou: {name}: expected {expected}, got {got!r}")
    return passed / len(IOU_CASES)


# ------------------------------------------------------------ match_boxes fixtures

def pb(box, label="text", score=1.0):
    return {"box": box, "label": label, "score": score}


def gb(box, label="text"):
    return {"box": box, "label": label}


MATCH_CASES = [
    (
        "a perfect overlap on the same label matches",
        [pb((0.0, 0.0, 10.0, 10.0))],
        [gb((0.0, 0.0, 10.0, 10.0))],
        0.5,
        [(0, 0)],
    ),
    (
        "a perfect overlap on a different label does not match",
        [pb((0.0, 0.0, 10.0, 10.0), label="table")],
        [gb((0.0, 0.0, 10.0, 10.0), label="text")],
        0.5,
        [],
    ),
    (
        # iou is 1/7, below a threshold of 0.5
        "below the threshold, no match",
        [pb((0.0, 0.0, 10.0, 10.0))],
        [gb((5.0, 5.0, 15.0, 15.0))],
        0.5,
        [],
    ),
    (
        # two truth boxes share a label and both clear the threshold (iou 0.667 and
        # 1.0); the predicted box goes to whichever it overlaps most, not to the
        # first one in the list
        "the better of two candidates wins, not the first one listed",
        [pb((0.0, 0.0, 10.0, 10.0))],
        [gb((2.0, 0.0, 12.0, 10.0)), gb((0.0, 0.0, 10.0, 10.0))],
        0.5,
        [(0, 1)],
    ),
    (
        # predicted[0] overlaps truth[0] at iou 70/130 ~ 0.538, which clears 0.5, so
        # predicted[0] claims it first. predicted[1] overlaps truth[0] better (0.818)
        # but truth[0] is already used and there is no second truth box to take.
        "an earlier predicted box keeps its claim even when a later one fits better",
        [pb((3.0, 0.0, 13.0, 10.0)), pb((1.0, 0.0, 11.0, 10.0))],
        [gb((0.0, 0.0, 10.0, 10.0))],
        0.5,
        [(0, 0)],
    ),
    (
        # iou is exactly 0.5 (see the box_iou case above); the threshold is inclusive
        "a threshold met exactly still matches",
        [pb((0.0, 0.0, 10.0, 10.0))],
        [gb((0.0, 0.0, 10.0, 20.0))],
        0.5,
        [(0, 0)],
    ),
    (
        "a threshold missed by a hair does not match",
        [pb((0.0, 0.0, 10.0, 10.0))],
        [gb((0.0, 0.0, 10.0, 20.0))],
        0.500001,
        [],
    ),
    ("no predicted boxes", [], [gb((0.0, 0.0, 10.0, 10.0))], 0.5, []),
    ("no truth boxes", [pb((0.0, 0.0, 10.0, 10.0))], [], 0.5, []),
]


def score_match(failures):
    passed = 0
    for name, predicted, truth, threshold, expected in MATCH_CASES:
        try:
            got = match_boxes([dict(p) for p in predicted], [dict(t) for t in truth], threshold)
            ok = isinstance(got, list) and [tuple(pair) for pair in got] == expected
        except Exception as err:
            got = f"raised {type(err).__name__}: {err}"
            ok = False
        if ok:
            passed += 1
        else:
            failures.append(f"match_boxes: {name}: expected {expected}, got {got!r}")
    return passed, len(MATCH_CASES)


# ---------------------------------------------------------------------- mAP cases

MAP_CASES = [
    (
        # two boxes, two perfect matches, one class: AP = 1.0 at the one threshold
        "two perfect matches in one class",
        [pb((0.0, 0.0, 10.0, 10.0), score=0.9), pb((20.0, 20.0, 30.0, 30.0), score=0.8)],
        [gb((0.0, 0.0, 10.0, 10.0)), gb((20.0, 20.0, 30.0, 30.0))],
        [0.5],
        1.0,
    ),
    (
        # the higher-scoring box is a false positive and gets ranked first: rank 1 is
        # a miss (precision 0, recall 0, contributes nothing), rank 2 is the true
        # positive (precision 1/2, recall 1/1, contributes 0.5). AP = 0.5
        "a higher-scoring false positive is ranked ahead of the true positive",
        [pb((0.0, 0.0, 10.0, 10.0), score=0.9), pb((90.0, 90.0, 100.0, 100.0), score=0.95)],
        [gb((0.0, 0.0, 10.0, 10.0))],
        [0.5],
        0.5,
    ),
    (
        # one of two truth boxes is never predicted: the single prediction reaches
        # precision 1, recall 1/2, then the list ends. AP = 0.5
        "a missed truth box caps recall",
        [pb((0.0, 0.0, 10.0, 10.0))],
        [gb((0.0, 0.0, 10.0, 10.0)), gb((50.0, 50.0, 60.0, 60.0))],
        [0.5],
        0.5,
    ),
    (
        "two classes, both perfect, average to 1.0",
        [pb((0.0, 0.0, 10.0, 10.0), label="text"), pb((20.0, 20.0, 30.0, 30.0), label="table")],
        [gb((0.0, 0.0, 10.0, 10.0), label="text"), gb((20.0, 20.0, 30.0, 30.0), label="table")],
        [0.5],
        1.0,
    ),
    (
        # iou here is 0.6 (see the derivation in pairwise_agreement's fixtures below).
        # At threshold 0.5 it matches (AP 1.0); at threshold 0.7 it does not (AP 0.0).
        # mean_average_precision averages over the two thresholds it is given: 0.5
        "one box scored at two thresholds that disagree",
        [pb((2.5, 0.0, 12.5, 10.0))],
        [gb((0.0, 0.0, 10.0, 10.0))],
        [0.5, 0.7],
        0.5,
    ),
    (
        "a class with truth but nothing predicted scores zero",
        [],
        [gb((0.0, 0.0, 10.0, 10.0))],
        [0.5],
        0.0,
    ),
    (
        "no truth boxes at all scores zero, whatever was predicted",
        [pb((0.0, 0.0, 10.0, 10.0))],
        [],
        [0.5],
        0.0,
    ),
    (
        "a threshold too strict for any overlap present scores zero",
        [pb((2.5, 0.0, 12.5, 10.0))],
        [gb((0.0, 0.0, 10.0, 10.0))],
        [0.99],
        0.0,
    ),
]


def score_map(failures):
    passed = 0
    for name, predicted, truth, thresholds, expected in MAP_CASES:
        try:
            got = mean_average_precision([dict(p) for p in predicted], [dict(t) for t in truth], list(thresholds))
            ok = isinstance(got, (int, float)) and abs(float(got) - expected) <= TOLERANCE
        except Exception as err:
            got = f"raised {type(err).__name__}: {err}"
            ok = False
        if ok:
            passed += 1
        else:
            failures.append(f"mean_average_precision: {name}: expected {expected}, got {got!r}")
    return passed, len(MAP_CASES)


def score_map_pool(failures):
    match_passed, match_total = score_match(failures)
    map_passed, map_total = score_map(failures)
    return (match_passed + map_passed) / (match_total + map_total)


# ------------------------------------------------------------- pairwise_agreement

AGREE_CASES = [
    (
        "two identical single-box annotators agree completely",
        [[gb((0.0, 0.0, 10.0, 10.0))], [gb((0.0, 0.0, 10.0, 10.0))]],
        1.0,
    ),
    (
        "two identical three-box annotators agree completely",
        [
            [gb((0.0, 0.0, 10.0, 10.0)), gb((20.0, 0.0, 30.0, 10.0)), gb((0.0, 20.0, 10.0, 30.0), label="table")],
            [gb((0.0, 0.0, 10.0, 10.0)), gb((20.0, 0.0, 30.0, 10.0)), gb((0.0, 20.0, 10.0, 30.0), label="table")],
        ],
        1.0,
    ),
    (
        # one annotator draws a second box the other never drew (the DocLayNet
        # subfigure example: one annotator sees two things, the other sees one).
        # forward (A predicted, B truth, 2 truth boxes): the one shared box is a
        # true positive at recall 1/2, precision 1: AP = 0.5 at every threshold,
        # since the shared box overlaps perfectly and clears all ten of them.
        # backward (B predicted, A truth, 1 truth box): the shared box ranks first
        # (tie broken by list order) and is a true positive at recall 1, precision 1,
        # contributing 1.0; the extra box then adds nothing (recall already at 1),
        # contributing 0. AP = 1.0 at every threshold.
        # pair score = (0.5 + 1.0) / 2 = 0.75
        "one annotator draws an extra box the other does not",
        [
            [gb((0.0, 0.0, 10.0, 10.0))],
            [gb((0.0, 0.0, 10.0, 10.0)), gb((50.0, 50.0, 60.0, 60.0))],
        ],
        0.75,
    ),
    (
        # same location, different label: match_boxes never pairs them, so every
        # class scores 0.0 in both directions.
        "the same box labelled two different ways does not agree",
        [
            [gb((0.0, 0.0, 10.0, 10.0), label="text")],
            [gb((0.0, 0.0, 10.0, 10.0), label="table")],
        ],
        0.0,
    ),
    (
        # boxes with no overlap at all: never matched at any threshold.
        "boxes that do not overlap at all do not agree",
        [
            [gb((0.0, 0.0, 10.0, 10.0))],
            [gb((50.0, 50.0, 60.0, 60.0))],
        ],
        0.0,
    ),
    (
        # iou = 0.6 (intersection 75, union 125, both areas 100). Of the ten
        # thresholds 0.50 through 0.95 in steps of 0.05, only 0.50, 0.55, and 0.60
        # are met. AP is 1.0 at those three and 0.0 at the other seven, in both
        # directions by symmetry: mean = 0.3 * 2 / 2 = 0.3
        "partial overlap agrees at the loose end of the threshold range only",
        [
            [gb((0.0, 0.0, 10.0, 10.0))],
            [gb((2.5, 0.0, 12.5, 10.0))],
        ],
        0.3,
    ),
    (
        # one annotator saw nothing on the page at all.
        "an empty annotation set agrees with nothing",
        [
            [],
            [gb((0.0, 0.0, 10.0, 10.0))],
        ],
        0.0,
    ),
    (
        # A and B are identical; C is missing the table box both A and B drew.
        # (A,B) = 1.0. (A,C) forward (A predicted, C truth: text only) = 1.0;
        # backward (C predicted, A truth: text and table) = mean(1.0, 0.0) = 0.5;
        # pair score 0.75. (B,C) is the same as (A,C) since B equals A: 0.75.
        # overall = (1.0 + 0.75 + 0.75) / 3
        "three annotators, one missing a box the other two share",
        [
            [gb((0.0, 0.0, 10.0, 10.0), label="text"), gb((20.0, 20.0, 30.0, 30.0), label="table")],
            [gb((0.0, 0.0, 10.0, 10.0), label="text"), gb((20.0, 20.0, 30.0, 30.0), label="table")],
            [gb((0.0, 0.0, 10.0, 10.0), label="text")],
        ],
        (1.0 + 0.75 + 0.75) / 3,
    ),
]


def score_agree(failures):
    passed = 0
    total = 0

    for name, annotations, expected in AGREE_CASES:
        total += 1
        try:
            got = pairwise_agreement([[dict(box) for box in ann] for ann in annotations])
            ok = isinstance(got, (int, float)) and abs(float(got) - expected) <= TOLERANCE
        except Exception as err:
            got = f"raised {type(err).__name__}: {err}"
            ok = False
        if ok:
            passed += 1
        else:
            failures.append(f"pairwise_agreement: {name}: expected {expected}, got {got!r}")

    total += 1
    try:
        pairwise_agreement([[gb((0.0, 0.0, 10.0, 10.0))]])
        failures.append("pairwise_agreement: a single annotation set should raise, it returned normally")
    except ValueError:
        passed += 1
    except Exception as err:
        failures.append(f"pairwise_agreement: a single annotation set raised {type(err).__name__}, not ValueError")

    return passed / total


# ------------------------------------------------------------------ coverage cases

COVERAGE_CASES = [
    ("an exact match covers completely", "the quick brown fox", "the quick brown fox", 1.0),
    ("converting into nothing covers nothing", "", "the quick brown fox", 0.0),
    # page has 5 tokens; 3 survive (the, quick, fox); 2 do not (brown, jumps)
    ("some words are dropped", "the quick fox", "the quick brown fox jumps", 3.0 / 5.0),
    # page repeats "cat" twice; converted has three, which caps at two, plus "dog"
    ("a repeated word only needs to be matched, not over-matched", "cat cat cat dog", "cat cat dog", 1.0),
    # page repeats "run" three times; converted only has it twice: 2/3
    ("a repeated word partially recovered", "run run", "run run run", 2.0 / 3.0),
    # invented words the page never had do not affect coverage either way
    ("extra invented words do not change coverage", "alpha beta gamma delta epsilon", "alpha beta", 1.0),
    ("case and punctuation are not part of the token", "Hello, World!", "hello world", 1.0),
    ("a page with no text at all is trivially covered", "anything at all", "", 1.0),
    ("a page that is only punctuation is trivially covered", "no words here either", "... !! ,,,", 1.0),
]


def score_coverage(failures):
    passed = 0
    for name, converted, page_text, expected in COVERAGE_CASES:
        try:
            got = conversion_coverage(converted, page_text)
            ok = isinstance(got, (int, float)) and abs(float(got) - expected) <= TOLERANCE
        except Exception as err:
            got = f"raised {type(err).__name__}: {err}"
            ok = False
        if ok:
            passed += 1
        else:
            failures.append(f"conversion_coverage: {name}: expected {expected}, got {got!r}")
    return passed / len(COVERAGE_CASES)


def main():
    failures = []
    iou_score = score_iou(failures)
    map_score = score_map_pool(failures)
    agree_score = score_agree(failures)
    coverage_score = score_coverage(failures)

    report("iou_cases_passed", iou_score)
    report("map_cases_passed", map_score)
    report("agreement_cases_passed", agree_score)
    report("coverage_cases_passed", coverage_score)

    if failures:
        print("\nwhat went wrong:", file=sys.stderr)
        for line in failures:
            print(f"  {line}", file=sys.stderr)


main()
