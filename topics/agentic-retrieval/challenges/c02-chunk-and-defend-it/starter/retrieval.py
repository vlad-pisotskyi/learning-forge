"""The retrieval rule, fixed so that a sweep measures chunking and nothing else.

Every configuration in the sweep is ranked by the same crude lexical scorer: a
chunk scores one point for each distinct query term that appears in it, ties go
to the chunk that starts earlier, and chunks scoring zero are never returned.
The scorer is deliberately dumb. If retrieval quality varied with the ranker as
well as with the chunk boundaries, a difference between two rows of the sweep
would have two possible causes and the sweep would settle nothing.

Do not change this file. The evaluation set applies the same rule with its own
copy, so an edited version here only makes your sweep numbers disagree with the
ones you are scored against.
"""

from textutil import normalise

TOP_K = 3
"""Chunks returned per query, everywhere in this challenge."""


def top_chunks(
    normalised: list[str],
    spans: list[tuple[int, int]],
    terms: list[str],
    k: int = TOP_K,
) -> list[tuple[int, int]]:
    """Returns up to k spans, best first.

    `normalised` is the whole document as normalised tokens, so spans index into
    it directly. Chunks containing none of the terms are dropped rather than used
    to pad the result out to k.
    """
    wanted = {normalise(term) for term in terms}
    wanted.discard("")

    scored = []
    for start, end in spans:
        hits = len(wanted.intersection(normalised[start:end]))
        if hits:
            scored.append((-hits, start, end))
    scored.sort()
    return [(start, end) for _, start, end in scored[:k]]
