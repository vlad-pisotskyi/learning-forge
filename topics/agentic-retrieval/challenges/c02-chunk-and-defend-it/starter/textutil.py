"""The tokeniser every part of this challenge agrees on.

A token is a run of non-whitespace characters. A span is a half-open range
(start, end) over the list `tokenize` returns, so span (0, 4) is the first four
tokens and an empty document has no spans at all. Every offset in the corpus
labels, in your chunker, and in the evaluation set is counted this way. Nothing
here needs changing.
"""

import re

TOKEN_PATTERN = re.compile(r"\S+")
_EDGES = re.compile(r"^[^0-9A-Za-z]+|[^0-9A-Za-z]+$")


def tokenize(text: str) -> list[str]:
    """Splits text on whitespace. Punctuation stays attached to its token."""
    return TOKEN_PATTERN.findall(text)


def normalise(token: str) -> str:
    """Lowercases a token and drops leading and trailing punctuation.

    'Portmarry,' and 'portmarry' both come back as 'portmarry'. Matching is done
    on normalised tokens; offsets are always counted on raw ones.
    """
    return _EDGES.sub("", token).lower()


def normalised_tokens(text: str) -> list[str]:
    """tokenize followed by normalise, positions preserved."""
    return [normalise(token) for token in TOKEN_PATTERN.findall(text)]
