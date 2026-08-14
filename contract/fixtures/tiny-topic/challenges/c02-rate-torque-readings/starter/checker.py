"""Starter scaffolding for c02. Replace the body of classify.

The windows live in corpus/fasteners.json, four directories up from this file once
your work tree is laid out the way the brief describes. load_windows below finds it
for you so the lookup is the only thing left to write.
"""

import json
from pathlib import Path

CORPUS = Path(__file__).resolve().parents[3] / "corpus" / "fasteners.json"


def load_windows():
    """Map fastener id to its window dict, or to None when the fastener is unrated."""
    with CORPUS.open(encoding="utf-8") as handle:
        corpus = json.load(handle)
    return {entry["id"]: entry["window"] for entry in corpus["fasteners"]}


def classify(reading):
    """Return "in-window", "under", "over", or "unrated" for one reading.

    reading is {"fastener": <id>, "newtonMetres": <number>}.
    """
    raise NotImplementedError("c02: classify is yours to write")
