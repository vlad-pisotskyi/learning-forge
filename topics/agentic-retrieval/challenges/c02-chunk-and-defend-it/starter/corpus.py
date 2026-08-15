"""Loads the challenge corpus.

The file is `corpus/c02-corpus.json` at the topic root. It holds two documents
and sixteen queries. Each query carries the query terms the retrieval rule uses
and the token spans a human judged relevant, as half-open ranges over
`textutil.tokenize(document_text)`.
"""

import json
from pathlib import Path

CORPUS_FILE = "c02-corpus.json"


def corpus_path() -> Path:
    """Resolves the corpus file relative to this module, so the working
    directory does not matter."""
    return Path(__file__).resolve().parents[3] / "corpus" / CORPUS_FILE


def load_corpus(path: Path | str | None = None) -> dict:
    """Returns the parsed corpus.

    Relevance labels arrive as lists of two integers and are converted to tuples,
    which is the shape the interface is written against.
    """
    data = json.loads(Path(path or corpus_path()).read_text(encoding="utf-8"))
    for query in data["queries"]:
        query["relevant"] = [tuple(span) for span in query["relevant"]]
    return data


def documents(corpus: dict) -> dict[str, dict]:
    """Documents keyed by id."""
    return {document["id"]: document for document in corpus["documents"]}


def queries_for(corpus: dict, document_id: str) -> list[dict]:
    """The queries labelled against one document."""
    return [query for query in corpus["queries"] if query["document"] == document_id]
