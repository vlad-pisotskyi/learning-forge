"""Score your retriever over the development queries.

    python3 work/report.py            # every development query
    python3 work/report.py dev-04     # one of them, with the ranking printed

Nothing here is the grader. The grader runs a different query set over the same
collection, so a number printed by this file is an estimate and not the mark.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import retrieval  # noqa: E402

TOPIC = Path(__file__).resolve().parents[3]
DOCS = TOPIC / "corpus" / "c01-docs.json"
QUERIES = TOPIC / "corpus" / "c01-dev-queries.json"

DEPTH = 50
NDCG_AT = 10


def main():
    wanted = sys.argv[1] if len(sys.argv) > 1 else None
    documents = json.loads(DOCS.read_text())["documents"]
    queries = json.loads(QUERIES.read_text())["queries"]
    if wanted:
        queries = [q for q in queries if q["id"] == wanted]
        if not queries:
            print(f"no development query with id {wanted}")
            return

    index = retrieval.build_index(documents)
    print(f"indexed {len(documents)} documents")

    totals = {"ndcg": 0.0, "recall": 0.0, "rr": 0.0}
    for query in queries:
        ranked = retrieval.search(index, query["query"], DEPTH)
        relevance = {doc_id: int(g) for doc_id, g in query["relevance"].items()}
        relevant = {doc_id for doc_id, g in relevance.items() if g >= 1}

        ndcg = retrieval.ndcg_at_k(ranked, relevance, NDCG_AT)
        recall = retrieval.recall_at_k(ranked, relevant, DEPTH)
        rr = retrieval.reciprocal_rank(ranked, relevant)
        totals["ndcg"] += ndcg
        totals["recall"] += recall
        totals["rr"] += rr

        print(f"{query['id']}  ndcg@{NDCG_AT} {ndcg:.3f}  recall@{DEPTH} {recall:.3f}  rr {rr:.3f}  {query['query']}")
        if wanted:
            print(f"  judged relevant: {sorted(relevance.items())}")
            for position, doc_id in enumerate(ranked[:20], start=1):
                grade = relevance.get(doc_id, 0)
                print(f"  {position:>3}  grade {grade}  {doc_id}")
            missed = sorted(d for d in relevant if d not in ranked[:DEPTH])
            print(f"  relevant and not in the top {DEPTH}: {missed}")

    n = len(queries)
    print(
        f"\nmean over {n} queries: "
        f"ndcg@{NDCG_AT} {totals['ndcg'] / n:.3f}  "
        f"recall@{DEPTH} {totals['recall'] / n:.3f}  "
        f"mrr {totals['rr'] / n:.3f}"
    )


main()
