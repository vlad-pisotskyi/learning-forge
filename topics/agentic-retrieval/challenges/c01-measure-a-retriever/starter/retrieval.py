"""Copy this file to work/retrieval.py and fill it in.

The five names below are the interface the grader imports. Keep the names and the
argument order; add whatever helpers you like alongside them.
"""

from __future__ import annotations


def build_index(documents: list[dict]) -> dict:
    """Build whatever your scorer needs to read at query time.

    documents: each is {"id": str, "title": str, "text": str}, where text is the whole
    markdown document including its heading.

    Returns: a dict. Its shape is yours. It is handed straight back to search().
    """
    raise NotImplementedError


def search(index: dict, query: str, k: int) -> list[str]:
    """Return at most k document ids, best first, with no repeats.

    Every id has to be one that build_index was given. Returning fewer than k is allowed
    when fewer documents score above zero.
    """
    raise NotImplementedError


def recall_at_k(ranked_ids: list[str], relevant_ids: set[str], k: int) -> float:
    """The fraction of relevant_ids that appear in the first k of ranked_ids.

    Return 0.0 when relevant_ids is empty or k is not positive. A cutoff past the end of
    ranked_ids is not an error: the positions that were never filled hold nothing
    relevant.
    """
    raise NotImplementedError


def ndcg_at_k(ranked_ids: list[str], relevance: dict[str, int], k: int) -> float:
    """Discounted cumulative gain over the first k results, over the ideal ordering.

    relevance maps a document id to its grade. A document id that is not in it is graded
    0. The ideal ordering is those grades sorted highest first and cut at the same k.
    Return 0.0 when the ideal gain is 0 or k is not positive.
    """
    raise NotImplementedError


def reciprocal_rank(ranked_ids: list[str], relevant_ids: set[str]) -> float:
    """One over the 1-based rank of the first relevant result, or 0.0 if there is none."""
    raise NotImplementedError
