"""Reference implementation for c02.

Exists so the challenge is proven solvable inside the interface challenge.json pins.
`forge eval --reference` stages this file at work/checker.py and runs the held-out set
against it, which is the only thing that makes "the challenge is solvable" a fact
rather than an assertion.
"""

import json
from pathlib import Path

CORPUS = Path(__file__).resolve().parents[3] / "corpus" / "fasteners.json"


def load_windows():
    """Map fastener id to its window dict, or to None when the fastener is unrated."""
    with CORPUS.open(encoding="utf-8") as handle:
        corpus = json.load(handle)
    return {entry["id"]: entry["window"] for entry in corpus["fasteners"]}


_WINDOWS = load_windows()


def classify(reading):
    """Return "in-window", "under", "over", or "unrated" for one reading."""
    # Two distinct routes to "unrated", kept apart on purpose. A fastener the corpus
    # does not list is unknown; a fastener it lists with a null window is known and
    # carries no rating. Both are unrated to a caller, and collapsing them into one
    # dictionary lookup that returns None either way loses the distinction the rubric
    # asks for.
    if reading["fastener"] not in _WINDOWS:
        return "unrated"
    window = _WINDOWS[reading["fastener"]]
    if window is None:
        return "unrated"

    # Both bounds inclusive, in one comparison rather than two special cases.
    value = reading["newtonMetres"]
    if value < window["min"]:
        return "under"
    if value > window["max"]:
        return "over"
    return "in-window"
