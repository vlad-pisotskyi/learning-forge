"""The module the evaluation set imports. Implement the four functions below.

Every span in this file is a half-open range of token positions over
`textutil.tokenize(text)`, never a character offset.
"""

from textutil import normalised_tokens, tokenize  # noqa: F401
from retrieval import TOP_K, top_chunks  # noqa: F401

Span = tuple[int, int]


def chunk_fixed(text: str, size: int, overlap: int) -> list[Span]:
    """Splits text into chunks of `size` tokens that repeat `overlap` tokens
    across each boundary.

    Chunk starts step by `size - overlap`. The last chunk is truncated at the end
    of the document, and no chunk is emitted whose span is already covered by its
    predecessor. Raises ValueError unless `size` is positive and
    `0 <= overlap < size`.
    """
    raise NotImplementedError


def token_recall(retrieved: list[Span], relevant: list[Span]) -> float:
    """Fraction of the relevant token positions that the retrieved spans cover.

    Both arguments are sets of positions once the spans are unioned, so spans
    that overlap each other contribute their positions once. Returns 0.0 when
    nothing is labelled relevant.
    """
    raise NotImplementedError


def token_iou(retrieved: list[Span], relevant: list[Span]) -> float:
    """Intersection over union of the retrieved and relevant token positions.

    Returns 0.0 when both sides are empty.
    """
    raise NotImplementedError


def sweep(
    text: str,
    sizes: list[int],
    overlaps: list[int],
    queries: list[dict],
) -> list[dict]:
    """Scores every valid (size, overlap) pair over the query set.

    One record per pair, each holding at least the keys "size", "overlap",
    "token_recall" and "token_iou", where the last two are the means over
    `queries`. Pairs with `overlap >= size` are skipped rather than raised on.
    Each query is a dict with "terms" and "relevant"; retrieval is
    `top_chunks(normalised_tokens(text), spans, query["terms"], TOP_K)`.
    """
    raise NotImplementedError


def chunk_semantic(text: str, max_size: int) -> list[Span]:
    """Splits text on detected boundaries instead of on a token counter, with
    `max_size` as the ceiling no chunk exceeds.

    Not imported by the evaluation set. It exists so the written defence has a
    second strategy to compare the fixed-size baseline against.
    """
    raise NotImplementedError
