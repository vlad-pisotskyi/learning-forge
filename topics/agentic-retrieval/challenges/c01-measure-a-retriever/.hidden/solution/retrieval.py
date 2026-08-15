"""Reference solution for c01: a sparse retriever and the three measures.

The retriever is BM25 over a postings list. The measures follow trec_eval: gain is the
relevance grade, the document at rank r divides by log2(r + 1), and a cutoff larger than
the result list is scored as though the missing positions held nonrelevant documents.
"""

from __future__ import annotations

import math
import re
from collections import Counter, defaultdict

K1 = 1.5
B = 0.75

_TOKEN = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> list[str]:
    """Lowercase, then keep runs of letters and digits.

    Markdown punctuation, hyphens in service codes and heading marks all fall out here,
    so `KX-40` indexes as `kx` and `40` and a query spelling it the same way matches.
    """
    return _TOKEN.findall(text.lower())


def build_index(documents: list[dict]) -> dict:
    """Postings, document lengths and the average length, which is all BM25 reads.

    One pass over the collection. `postings[term]` maps a document id to the count of
    that term in it, so scoring a query touches only the documents that contain one of
    its terms rather than the whole collection.
    """
    postings: dict[str, dict[str, int]] = defaultdict(dict)
    lengths: dict[str, int] = {}
    order: list[str] = []

    for doc in documents:
        doc_id = doc["id"]
        counts = Counter(tokenize(doc["text"]))
        for term, count in counts.items():
            postings[term][doc_id] = count
        lengths[doc_id] = sum(counts.values())
        order.append(doc_id)

    total = sum(lengths.values())
    return {
        "postings": dict(postings),
        "lengths": lengths,
        "order": order,
        "count": len(order),
        "avg_length": total / len(order) if order else 0.0,
    }


def search(index: dict, query: str, k: int) -> list[str]:
    """The k best document ids for the query, best first.

    Ties break on document id rather than on insertion order, so two runs of the same
    index return the same list and a scoring difference is never an ordering accident.
    """
    if k <= 0 or not index["order"]:
        return []

    n_docs = index["count"]
    avg_length = index["avg_length"]
    scores: dict[str, float] = defaultdict(float)

    for term in tokenize(query):
        posting = index["postings"].get(term)
        if not posting:
            continue
        # Documents holding a term that nearly every document holds separate on almost
        # nothing, which is what this factor says.
        df = len(posting)
        idf = math.log(1.0 + (n_docs - df + 0.5) / (df + 0.5))
        for doc_id, freq in posting.items():
            length = index["lengths"][doc_id]
            saturation = freq * (K1 + 1.0) / (
                freq + K1 * (1.0 - B + B * length / avg_length)
            )
            scores[doc_id] += idf * saturation

    ranked = sorted(scores.items(), key=lambda pair: (-pair[1], pair[0]))
    return [doc_id for doc_id, _ in ranked[:k]]


def recall_at_k(ranked_ids: list[str], relevant_ids: set[str], k: int) -> float:
    """How much of what exists came back inside the cutoff.

    The denominator is everything judged relevant, including documents the ranking never
    returned. A short result list therefore buys nothing: positions the run did not fill
    count as nonrelevant.
    """
    if not relevant_ids or k <= 0:
        return 0.0
    found = {doc_id for doc_id in ranked_ids[:k] if doc_id in relevant_ids}
    return len(found) / len(relevant_ids)


def ndcg_at_k(ranked_ids: list[str], relevance: dict[str, int], k: int) -> float:
    """Discounted gain over the first k results against the best ordering available.

    Gain is the grade the judgements record, and an unjudged document is graded 0. The
    ideal is the same judgements sorted highest first and cut at the same k, so a need
    with three relevant documents and a cutoff of ten can still reach 1.0.
    """
    if k <= 0:
        return 0.0

    dcg = 0.0
    for position, doc_id in enumerate(ranked_ids[:k]):
        gain = relevance.get(doc_id, 0)
        if gain:
            # position is zero based and the document sits at rank position + 1, so the
            # discount is log2(rank + 1) = log2(position + 2). Rank 1 divides by 1.
            dcg += gain / math.log2(position + 2)

    ideal_dcg = 0.0
    for position, gain in enumerate(sorted(relevance.values(), reverse=True)[:k]):
        if gain:
            ideal_dcg += gain / math.log2(position + 2)

    if ideal_dcg <= 0.0:
        return 0.0
    return dcg / ideal_dcg


def reciprocal_rank(ranked_ids: list[str], relevant_ids: set[str]) -> float:
    """One over the rank of the first relevant result, and 0.0 when there is none.

    Nothing after that document is read, which is the measure's design: it answers how
    far down the user had to look before finding one good answer.
    """
    for position, doc_id in enumerate(ranked_ids):
        if doc_id in relevant_ids:
            return 1.0 / (position + 1)
    return 0.0
