"""Reference implementation for c02.

Two decisions carry the whole file.

Spans are converted to sets of token positions before either metric touches
them. Summing lengths is faster and wrong: overlap means the retrieved spans
share positions, and a chunk that repeats sixteen tokens of its predecessor
would otherwise be credited for them twice. Recall would climb above one, and
IoU would fall as overlap rose even when nothing new was retrieved.

The chunk loop stops on the chunk that reaches the end of the document rather
than on the next start running past it. With size 4 and overlap 2 over ten
tokens, the starts are 0, 2, 4, 6, 8; the chunk at 6 already ends at 10, so the
chunk at 8 would be entirely inside its predecessor. Emitting it inflates the
chunk count and, under a ranker that returns k chunks, quietly halves how much
distinct text a query gets back.
"""

import re

from textutil import normalise, normalised_tokens, tokenize
from retrieval import TOP_K, top_chunks

Span = tuple[int, int]

_SENTENCE_END = re.compile(r"(?<=[.!?])\s+|\n+")

_STOPWORDS = frozenset(
    """
    a an and are as at be been but by for from has have in into is it its of on
    or that the their them this to was were with which who will would
    """.split()
)


# ------------------------------------------------------------------ chunking


def chunk_fixed(text: str, size: int, overlap: int) -> list[Span]:
    if size <= 0:
        raise ValueError(f"size must be positive, got {size}")
    if overlap < 0:
        raise ValueError(f"overlap must not be negative, got {overlap}")
    if overlap >= size:
        raise ValueError(f"overlap {overlap} must be smaller than size {size}")

    total = len(tokenize(text))
    if total == 0:
        return []

    step = size - overlap
    spans: list[Span] = []
    start = 0
    while start < total:
        end = min(start + size, total)
        spans.append((start, end))
        if end == total:
            break
        start += step
    return spans


def chunk_semantic(text: str, max_size: int, threshold: float = 0.08) -> list[Span]:
    """Breakpoint chunker: a new chunk starts where consecutive sentences stop
    sharing vocabulary, and always before `max_size` is exceeded.

    Similarity is Jaccard overlap of content words between the incoming sentence
    and the sentences already in the chunk. It is a weak proxy for a topic
    boundary and it is the honest one available without an embedding model, which
    is worth saying out loud in the write-up rather than implying otherwise.

    The floor at a third of `max_size` is what keeps the comparison against the
    fixed-size baseline meaningful. Without it, prose whose neighbouring sentences
    share nothing but stopwords breaks at almost every boundary, and the result is
    a chunker that wins on IoU because its chunks are a quarter of the length
    rather than because its boundaries are better placed.
    """
    if max_size <= 0:
        raise ValueError(f"max_size must be positive, got {max_size}")

    sentences = _sentence_spans(text)
    if not sentences:
        return []

    min_size = max(1, max_size // 3)
    words = normalised_tokens(text)
    spans: list[Span] = []
    start, end = sentences[0]
    current = _content(words, start, end)

    for sentence_start, sentence_end in sentences[1:]:
        incoming = _content(words, sentence_start, sentence_end)
        too_long = sentence_end - start > max_size
        turned = _jaccard(current, incoming) < threshold and end - start >= min_size
        if too_long or turned:
            spans.append((start, end))
            start, end = sentence_start, sentence_end
            current = incoming
        else:
            end = sentence_end
            current = current | incoming
    spans.append((start, end))
    return spans


def _sentence_spans(text: str) -> list[Span]:
    """Sentence boundaries as token spans, found by counting tokens rather than
    characters so the result lands on the same axis as everything else."""
    pieces = [piece for piece in _SENTENCE_END.split(text) if piece and piece.strip()]
    spans: list[Span] = []
    cursor = 0
    for piece in pieces:
        length = len(tokenize(piece))
        if length:
            spans.append((cursor, cursor + length))
            cursor += length
    return spans


def _content(words: list[str], start: int, end: int) -> set[str]:
    return {word for word in words[start:end] if word and word not in _STOPWORDS}


def _jaccard(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


# ------------------------------------------------------------------- metrics


def _positions(spans) -> set[int]:
    covered: set[int] = set()
    for span in spans or ():
        start, end = span
        if end > start:
            covered.update(range(start, end))
    return covered


def token_recall(retrieved: list[Span], relevant: list[Span]) -> float:
    wanted = _positions(relevant)
    if not wanted:
        return 0.0
    return len(_positions(retrieved) & wanted) / len(wanted)


def token_iou(retrieved: list[Span], relevant: list[Span]) -> float:
    got = _positions(retrieved)
    wanted = _positions(relevant)
    union = got | wanted
    if not union:
        return 0.0
    return len(got & wanted) / len(union)


# --------------------------------------------------------------------- sweep


def sweep(
    text: str,
    sizes: list[int],
    overlaps: list[int],
    queries: list[dict],
) -> list[dict]:
    words = normalised_tokens(text)
    prepared = [
        (query.get("terms", []), [tuple(span) for span in query.get("relevant", [])])
        for query in queries
    ]

    records: list[dict] = []
    for size in sizes:
        for overlap in overlaps:
            if size <= 0 or overlap < 0 or overlap >= size:
                continue
            spans = chunk_fixed(text, size, overlap)
            recalls: list[float] = []
            ious: list[float] = []
            for terms, relevant in prepared:
                retrieved = top_chunks(words, spans, terms, TOP_K)
                recalls.append(token_recall(retrieved, relevant))
                ious.append(token_iou(retrieved, relevant))
            records.append(
                {
                    "size": size,
                    "overlap": overlap,
                    "chunks": len(spans),
                    "queries": len(prepared),
                    "token_recall": _mean(recalls),
                    "token_iou": _mean(ious),
                }
            )
    return records


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


__all__ = [
    "chunk_fixed",
    "chunk_semantic",
    "normalise",
    "sweep",
    "token_iou",
    "token_recall",
]
