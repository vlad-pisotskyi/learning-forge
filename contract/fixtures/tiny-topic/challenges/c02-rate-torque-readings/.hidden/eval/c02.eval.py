"""Held-out evaluation set for c02. The Judge runs this; nobody else reads it.

None of the readings below appear in corpus/fasteners.json, which is what makes the
score mean something: the corpus gives the windows, and a classifier has to apply them
to readings it has not been shown. Six of the sixteen sit exactly on a bound, because
inclusivity is the one rule this challenge is built around.

Thresholds live in challenge.json and are compared by the CLI. This file prints the two
numbers and checks only structure, so the bar exists in one place.
"""

import sys
from pathlib import Path

# The learner's code is staged at "work" beside this challenge, the same place a
# TypeScript spec would reach through a relative import.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "work"))

from checker import classify  # noqa: E402

M6 = "flange-bolt-m6"  # window 7 to 11
M4 = "cap-screw-m4"  # window 3 to 5
CLIP = "shroud-clip"  # listed, no rating
RIVET = "panel-rivet"  # listed, no rating
GHOST = "hex-nut-m8"  # not in the corpus at all

HELD_OUT = [
    ({"fastener": M6, "newtonMetres": 9}, "in-window"),
    ({"fastener": M6, "newtonMetres": 7}, "in-window"),  # on the lower bound
    ({"fastener": M6, "newtonMetres": 11}, "in-window"),  # on the upper bound
    ({"fastener": M6, "newtonMetres": 6.9}, "under"),
    ({"fastener": M6, "newtonMetres": 2}, "under"),
    ({"fastener": M6, "newtonMetres": 11.1}, "over"),
    ({"fastener": M6, "newtonMetres": 40}, "over"),
    ({"fastener": M4, "newtonMetres": 4}, "in-window"),
    ({"fastener": M4, "newtonMetres": 3}, "in-window"),  # on the lower bound
    ({"fastener": M4, "newtonMetres": 5}, "in-window"),  # on the upper bound
    ({"fastener": M4, "newtonMetres": 2}, "under"),
    ({"fastener": M4, "newtonMetres": 9}, "over"),  # in M6's window, not its own
    ({"fastener": CLIP, "newtonMetres": 6}, "unrated"),
    ({"fastener": CLIP, "newtonMetres": 0}, "unrated"),
    ({"fastener": RIVET, "newtonMetres": 4}, "unrated"),
    ({"fastener": GHOST, "newtonMetres": 9}, "unrated"),  # not listed at all
]

VALID = {"in-window", "under", "over", "unrated"}


def main():
    correct = 0
    in_window_total = 0
    in_window_missed = 0

    for reading, expected in HELD_OUT:
        answer = classify(reading)
        if answer not in VALID:
            raise SystemExit(
                f"classify returned {answer!r} for {reading}, which is not one of {sorted(VALID)}"
            )
        if answer == expected:
            correct += 1
        if expected == "in-window":
            in_window_total += 1
            if answer != "in-window":
                in_window_missed += 1

    accuracy = correct / len(HELD_OUT)
    # Guarded, but the held-out set has in-window readings by construction and the
    # check below fails loudly if that ever stops being true.
    miss_rate = in_window_missed / in_window_total if in_window_total else 1.0

    print(f"metric classification-accuracy {accuracy:.4f}")
    print(f"metric in-window-miss-rate {miss_rate:.4f}")

    if in_window_total == 0:
        raise SystemExit("the held-out set itself has no in-window readings to miss")


main()
