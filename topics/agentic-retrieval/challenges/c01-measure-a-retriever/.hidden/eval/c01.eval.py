"""Held-out evaluation for c01.

Three numbers come out of here. `metric_cases_passed` is the fraction of the measure
cases the submission's own recall_at_k, ndcg_at_k and reciprocal_rank get right, and it
has to be all of them. `ndcg_at_10` and `recall_at_50` are the submission's retriever
scored over the held-out query set, and they are computed by this file's own measures so
that a broken measure cannot inflate a retrieval score or the other way round.

Every expected value below is written as the arithmetic it comes from rather than as a
decimal, so a case that fails can be read against the definition it was derived from.
"""

import json
import math
import sys
import traceback
from importlib import util
from pathlib import Path

HERE = Path(__file__).resolve()
CHALLENGE = HERE.parents[2]
TOPIC = HERE.parents[4]
ENTRYPOINT = CHALLENGE / "work" / "retrieval.py"
DOCS = TOPIC / "corpus" / "c01-docs.json"
QUERIES = HERE.parent / "c01-held-queries.json"

EXPORTS = ("build_index", "search", "recall_at_k", "ndcg_at_k", "reciprocal_rank")
TOLERANCE = 1e-9

# Filled in as soon as the measure cases have run, so that a submission whose retriever
# is wired wrong still gets told what its measures scored.
CASE_SCORE = 0.0


def report(name, value):
    print(f"metric {name} {value:.6f}")


def bail(message):
    """An interface problem is not a low score, so it is reported as itself."""
    print("INTERFACE PROBLEM")
    print(message)
    print("The brief pins the entrypoint at work/retrieval.py and the five names it exports.")
    report("metric_cases_passed", CASE_SCORE)
    report("ndcg_at_10", 0.0)
    report("recall_at_50", 0.0)
    sys.exit(1)


def load_submission():
    if not ENTRYPOINT.exists():
        bail(f"nothing at work/retrieval.py (looked in {ENTRYPOINT.parent}).")
    spec = util.spec_from_file_location("submission_retrieval", ENTRYPOINT)
    module = util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception:
        bail("work/retrieval.py raised while it was being imported:\n" + traceback.format_exc())
    missing = [name for name in EXPORTS if not hasattr(module, name)]
    if missing:
        bail(f"work/retrieval.py does not export: {', '.join(missing)}.")
    not_callable = [name for name in EXPORTS if not callable(getattr(module, name))]
    if not_callable:
        bail(f"these names are exported but are not callable: {', '.join(not_callable)}.")
    return module


# --------------------------------------------------------------------- measures
# This file's own copies. They score the retriever, and they are never compared against
# the submission's copies except through the cases below.


def _dcg(grades):
    return sum(g / math.log2(i + 2) for i, g in enumerate(grades) if g)


def _ndcg(ranked, relevance, k):
    if k <= 0:
        return 0.0
    ideal = _dcg(sorted(relevance.values(), reverse=True)[:k])
    if ideal <= 0.0:
        return 0.0
    return _dcg([relevance.get(doc_id, 0) for doc_id in ranked[:k]]) / ideal


def _recall(ranked, relevant, k):
    if not relevant or k <= 0:
        return 0.0
    return len({d for d in ranked[:k] if d in relevant}) / len(relevant)


# ------------------------------------------------------------------------ cases
# A ranking of ten documents with four judged relevant, one of which (z) the ranking
# never returned. Several cases read off this one fixture at different cutoffs, which is
# the point of writing the cutoff into the name of the measure.
RANKED = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]
GRADED = {"a": 3, "c": 2, "f": 1, "z": 3}
RELEVANT = {"a", "c", "f", "z"}

# The same five documents in two orders. Recall cannot tell them apart; the two rank
# aware measures can.
ORDER_ONE = ["p", "q", "r", "s", "t"]
ORDER_TWO = ["t", "s", "r", "q", "p"]
FIVE = {"p": 3, "t": 1}

# One need, two runs. Both put a relevant document at rank 1; only the second one fills
# the positions below it.
NEED = {"m": 3, "n": 2, "o": 2, "u": 1}
RUN_THIN = ["m", "x1", "x2", "x3", "x4"]
RUN_THICK = ["m", "n", "o", "u", "x1"]

# Five documents graded 3, of which the run returns two, inside a cutoff of three. The
# ideal ranking is cut at the same three.
MANY = {"g1": 3, "g2": 3, "g3": 3, "g4": 3, "g5": 3}
TWO_OF_FIVE = ["g1", "g2", "x1", "x2"]

# Binary judgements, which are graded judgements with one grade.
BINARY = {"b1": 1, "b3": 1, "b5": 1}
BINARY_GOOD = ["b1", "b3", "b5", "z1", "z2"]
BINARY_POOR = ["z1", "z2", "b1", "b3", "b5"]


def cases(m):
    """(name, thunk, expected value) triples.

    The call sits behind a thunk so that one function raising costs one case rather than
    the whole run, and so a submission that has implemented three of the five names still
    gets a number back.
    """
    out = []

    def case(name, thunk, want):
        out.append((name, thunk, want))

    # recall at a cutoff
    case("recall_at_k over ten results at k=10", lambda: m.recall_at_k(RANKED, RELEVANT, 10), 3 / 4)
    case("recall_at_k at a shallower cutoff", lambda: m.recall_at_k(RANKED, RELEVANT, 3), 2 / 4)
    case("recall_at_k at the shallowest cutoff", lambda: m.recall_at_k(RANKED, RELEVANT, 1), 1 / 4)
    case("recall_at_k with a cutoff past the end of the list", lambda: m.recall_at_k(RANKED, RELEVANT, 100), 3 / 4)
    case("recall_at_k with nothing judged relevant", lambda: m.recall_at_k(RANKED, set(), 10), 0.0)
    case("recall_at_k with an empty result list", lambda: m.recall_at_k([], RELEVANT, 10), 0.0)
    case("recall_at_k at k=0", lambda: m.recall_at_k(RANKED, RELEVANT, 0), 0.0)
    case(
        "recall_at_k ignores the order of the results",
        lambda: float(
            abs(m.recall_at_k(ORDER_ONE, set(FIVE), 5) - m.recall_at_k(ORDER_TWO, set(FIVE), 5)) < TOLERANCE
        ),
        1.0,
    )
    case(
        "the same two orderings do separate on nDCG",
        lambda: float(m.ndcg_at_k(ORDER_ONE, FIVE, 5) - m.ndcg_at_k(ORDER_TWO, FIVE, 5) > 0.1),
        1.0,
    )

    # nDCG
    case(
        "ndcg_at_k over a graded ranking at k=10",
        lambda: m.ndcg_at_k(RANKED, GRADED, 10),
        (3 / math.log2(2) + 2 / math.log2(4) + 1 / math.log2(7))
        / (3 / math.log2(2) + 3 / math.log2(3) + 2 / math.log2(4) + 1 / math.log2(5)),
    )
    case(
        "ndcg_at_k over the same ranking at k=3",
        lambda: m.ndcg_at_k(RANKED, GRADED, 3),
        (3 / math.log2(2) + 2 / math.log2(4))
        / (3 / math.log2(2) + 3 / math.log2(3) + 2 / math.log2(4)),
    )
    case(
        "ndcg_at_k when the ranking is already the ideal one",
        lambda: m.ndcg_at_k(["a", "c", "f"], {"a": 3, "c": 2, "f": 1}, 10),
        1.0,
    )
    case(
        "ndcg_at_k when the ideal ranking is cut at k as well",
        lambda: m.ndcg_at_k(TWO_OF_FIVE, MANY, 3),
        (3 / math.log2(2) + 3 / math.log2(3))
        / (3 / math.log2(2) + 3 / math.log2(3) + 3 / math.log2(4)),
    )
    case(
        "ndcg_at_k with one relevant document below the top position",
        lambda: m.ndcg_at_k(["x", "a", "y"], {"a": 3}, 10),
        (3 / math.log2(3)) / (3 / math.log2(2)),
    )
    case("ndcg_at_k when nothing retrieved was judged", lambda: m.ndcg_at_k(["x", "y"], GRADED, 10), 0.0)
    case("ndcg_at_k with no judgements at all", lambda: m.ndcg_at_k(RANKED, {}, 10), 0.0)
    case("ndcg_at_k at k=0", lambda: m.ndcg_at_k(RANKED, GRADED, 0), 0.0)
    case(
        "ndcg_at_k over binary judgements",
        lambda: m.ndcg_at_k(BINARY_POOR, BINARY, 5),
        (1 / math.log2(4) + 1 / math.log2(5) + 1 / math.log2(6))
        / (1 / math.log2(2) + 1 / math.log2(3) + 1 / math.log2(4)),
    )

    # reciprocal rank
    case("reciprocal_rank with the first result relevant", lambda: m.reciprocal_rank(RANKED, RELEVANT), 1.0)
    case("reciprocal_rank with the first relevant result at rank 3", lambda: m.reciprocal_rank(RANKED, {"c", "f"}), 1 / 3)
    case("reciprocal_rank with nothing relevant retrieved", lambda: m.reciprocal_rank(RANKED, {"z"}), 0.0)
    case("reciprocal_rank with nothing judged relevant", lambda: m.reciprocal_rank(RANKED, set()), 0.0)
    case("reciprocal_rank over an empty result list", lambda: m.reciprocal_rank([], RELEVANT), 0.0)
    case(
        "reciprocal_rank reads the first relevant result and stops",
        lambda: float(
            abs(m.reciprocal_rank(RUN_THIN, set(NEED)) - m.reciprocal_rank(RUN_THICK, set(NEED))) < TOLERANCE
        ),
        1.0,
    )

    # the distinctions the measures exist for
    case(
        "nDCG separates two runs that reciprocal rank cannot",
        lambda: float(m.ndcg_at_k(RUN_THICK, NEED, 5) - m.ndcg_at_k(RUN_THIN, NEED, 5) > 0.1),
        1.0,
    )
    case(
        "recall ties where nDCG does not",
        lambda: float(
            abs(m.recall_at_k(BINARY_GOOD, set(BINARY), 5) - m.recall_at_k(BINARY_POOR, set(BINARY), 5)) < TOLERANCE
            and m.ndcg_at_k(BINARY_GOOD, BINARY, 5) - m.ndcg_at_k(BINARY_POOR, BINARY, 5) > 0.1
        ),
        1.0,
    )
    case(
        "a graded ranking scores differently at two cutoffs",
        lambda: float(abs(m.ndcg_at_k(RANKED, GRADED, 10) - m.ndcg_at_k(RANKED, GRADED, 3)) > TOLERANCE),
        1.0,
    )
    return out


def run_cases(m):
    passed = 0
    total = 0
    for name, thunk, want in cases(m):
        total += 1
        got = None
        try:
            got = thunk()
            ok = isinstance(got, (int, float)) and not isinstance(got, bool) and abs(float(got) - want) <= 1e-6
        except Exception as err:
            got = f"raised {type(err).__name__}: {err}"
            ok = False
        if ok:
            passed += 1
        else:
            print(f"case failed: {name} (returned {got!r})")
    return passed, total


# -------------------------------------------------------------------- retrieval
def run_retrieval(m):
    documents = json.loads(DOCS.read_text())["documents"]
    queries = json.loads(QUERIES.read_text())["queries"]
    known = {doc["id"] for doc in documents}

    try:
        index = m.build_index([{"id": d["id"], "title": d["title"], "text": d["text"]} for d in documents])
    except Exception:
        bail("build_index raised on the corpus:\n" + traceback.format_exc())

    ndcg_total = 0.0
    recall_total = 0.0
    for query in queries:
        try:
            ranked = m.search(index, query["query"], 50)
        except Exception:
            bail(f"search raised on the query {query['query']!r}:\n" + traceback.format_exc())
        if not isinstance(ranked, list):
            bail(f"search returned {type(ranked).__name__}, and the interface pins a list of document ids.")
        if any(not isinstance(doc_id, str) for doc_id in ranked):
            bail("search returned something other than document id strings. Ranked results are ids, best first.")
        if len(ranked) > 50:
            bail(f"search was asked for 50 results and returned {len(ranked)}.")
        if len(set(ranked)) != len(ranked):
            bail("search returned the same document id more than once.")
        unknown = [doc_id for doc_id in ranked if doc_id not in known]
        if unknown:
            bail(f"search returned ids that are not in the collection, for instance {unknown[0]!r}.")

        relevance = query["relevance"]
        relevant = {doc_id for doc_id, grade in relevance.items() if grade >= 1}
        ndcg_total += _ndcg(ranked, relevance, 10)
        recall_total += _recall(ranked, relevant, 50)

    n = len(queries)
    return ndcg_total / n, recall_total / n


def main():
    global CASE_SCORE
    submission = load_submission()
    passed, total = run_cases(submission)
    CASE_SCORE = passed / total
    ndcg, recall = run_retrieval(submission)

    print(f"measure cases: {passed}/{total}")
    print(f"held-out queries: {len(json.loads(QUERIES.read_text())['queries'])}")
    report("metric_cases_passed", passed / total)
    report("ndcg_at_10", ndcg)
    report("recall_at_50", recall)


main()
