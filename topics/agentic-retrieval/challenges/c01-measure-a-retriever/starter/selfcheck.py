"""Six worked examples of the three measures.

    python3 work/selfcheck.py

These are here to pin the definitions, not to be the grading set. Passing all six says
your arithmetic matches the definitions in the brief on six small inputs. The grader runs
a wider set, including the boundaries the chapter warned about.
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import retrieval  # noqa: E402

RANKED = ["d1", "d2", "d3", "d4"]

CASES = [
    (
        "recall_at_k: one of the two relevant documents is inside the cutoff",
        lambda: retrieval.recall_at_k(RANKED, {"d2", "d9"}, 4),
        1 / 2,
    ),
    (
        "recall_at_k: the same ranking at a cutoff of one",
        lambda: retrieval.recall_at_k(RANKED, {"d2", "d9"}, 1),
        0.0,
    ),
    (
        "ndcg_at_k: the ranking is the ideal one",
        lambda: retrieval.ndcg_at_k(["d1", "d2"], {"d1": 1, "d2": 1}, 2),
        1.0,
    ),
    (
        "ndcg_at_k: the two grades the wrong way round",
        lambda: retrieval.ndcg_at_k(["d2", "d1"], {"d1": 3, "d2": 1}, 2),
        (1 / math.log2(2) + 3 / math.log2(3)) / (3 / math.log2(2) + 1 / math.log2(3)),
    ),
    (
        "reciprocal_rank: the first relevant result sits at rank 3",
        lambda: retrieval.reciprocal_rank(RANKED, {"d3"}),
        1 / 3,
    ),
    (
        "reciprocal_rank: nothing is judged relevant",
        lambda: retrieval.reciprocal_rank(RANKED, set()),
        0.0,
    ),
]


def main():
    passed = 0
    for name, thunk, want in CASES:
        try:
            got = thunk()
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
