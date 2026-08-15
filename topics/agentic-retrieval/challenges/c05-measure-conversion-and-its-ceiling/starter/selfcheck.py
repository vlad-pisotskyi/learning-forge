"""A handful of worked examples, one or two per function.

    python3 work/selfcheck.py

These are here to pin the definitions, not to be the grading set. Passing all of them
says your arithmetic matches the brief on a few small inputs. The grader runs a wider
set, including the boundaries the brief describes in words rather than in numbers.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import conversion  # noqa: E402


def box(l, t, r, b, label="Text", score=None):
    d = {"box": (l, t, r, b), "label": label}
    if score is not None:
        d["score"] = score
    return d


CASES = [
    (
        "box_iou: one box nested inside another, a quarter of its area",
        lambda: conversion.box_iou((0.0, 0.0, 4.0, 4.0), (0.0, 0.0, 2.0, 2.0)),
        0.25,
    ),
    (
        "box_iou: no overlap at all",
        lambda: conversion.box_iou((0.0, 0.0, 4.0, 4.0), (10.0, 10.0, 14.0, 14.0)),
        0.0,
    ),
    (
        "match_boxes: a perfect overlap on the same label matches",
        lambda: conversion.match_boxes(
            [box(0.0, 0.0, 4.0, 4.0, score=0.9)],
            [box(0.0, 0.0, 4.0, 4.0)],
            0.5,
        ),
        [(0, 0)],
    ),
    (
        "match_boxes: the same overlap on a different label does not match",
        lambda: conversion.match_boxes(
            [box(0.0, 0.0, 4.0, 4.0, label="Table", score=0.9)],
            [box(0.0, 0.0, 4.0, 4.0, label="Text")],
            0.5,
        ),
        [],
    ),
    (
        "mean_average_precision: one class, one perfect match, AP is 1.0",
        lambda: conversion.mean_average_precision(
            [box(0.0, 0.0, 4.0, 4.0, score=0.9)],
            [box(0.0, 0.0, 4.0, 4.0)],
            [0.5],
        ),
        1.0,
    ),
    (
        "mean_average_precision: no truth boxes at all scores 0.0",
        lambda: conversion.mean_average_precision(
            [box(0.0, 0.0, 4.0, 4.0, score=0.9)],
            [],
            [0.5],
        ),
        0.0,
    ),
    (
        "pairwise_agreement: two identical annotators agree completely",
        lambda: conversion.pairwise_agreement(
            [[box(0.0, 0.0, 4.0, 4.0)], [box(0.0, 0.0, 4.0, 4.0)]]
        ),
        1.0,
    ),
    (
        "conversion_coverage: everything survives",
        lambda: conversion.conversion_coverage("alpha beta gamma", "alpha beta gamma"),
        1.0,
    ),
    (
        # page has 4 words; 2 survive
        "conversion_coverage: half the page's words are missing",
        lambda: conversion.conversion_coverage("alpha gamma", "alpha beta gamma delta"),
        0.5,
    ),
    (
        "conversion_coverage: converting into nothing covers nothing",
        lambda: conversion.conversion_coverage("", "alpha beta"),
        0.0,
    ),
]


def main():
    passed = 0
    for name, thunk, want in CASES:
        try:
            got = thunk()
            if isinstance(want, list):
                ok = got == want
            else:
                ok = isinstance(got, (int, float)) and abs(float(got) - want) <= 1e-9
        except Exception as err:
            got = f"raised {type(err).__name__}: {err}"
            ok = False
        passed += 1 if ok else 0
        print(f"{'ok  ' if ok else 'FAIL'}  {name}")
        if not ok:
            print(f"        wanted {want!r}, got {got!r}")
    print(f"\n{passed}/{len(CASES)}")


main()
