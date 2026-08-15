"""Starter shell for c03. Copy this file into work/ and fill in the four functions.

The constants below are the loop's operating points. Every one of them is a number
somebody chose from outside the model, so they live here where they can be reviewed and
changed, rather than inside the call that uses them. Leave the values alone: the
held-out set runs your loop at these settings.
"""

RETRIEVE_THRESHOLD = 0.5
LAMBDA = 0.7
MMR_K = 3
TOKEN_BUDGET = 30


def cosine(a, b):
    """Cosine similarity of two vectors held as lists of floats.

    There is no numpy here. Decide what a zero vector should give back before you write
    the division, because the held-out set contains one.
    """
    raise NotImplementedError("c03: cosine is yours to write")


def should_retrieve(query, state, threshold):
    """Decide whether this step needs retrieval at all.

    state carries the loop's bookkeeping: "passages" holds what the context already
    contains, "seen_queries" holds the queries the loop has already run, "retrieve_scores"
    holds the generator's scores for the values of its retrieve token, and "step" holds
    the index of the generate call this decision belongs to.
    """
    raise NotImplementedError("c03: should_retrieve is yours to write")


def rerank_mmr(passages, query, lam, k):
    """Select k passages by the maximal marginal relevance criterion.

    query is the query embedding, not the query text. Each passage carries an
    "embedding" key. Return the passage dicts themselves, in selection order.
    """
    raise NotImplementedError("c03: rerank_mmr is yours to write")


def select_k(passages, budget):
    """Keep the head of an already ordered list that fits the token budget.

    Each passage carries a "tokens" count and a "score" from the retriever.
    """
    raise NotImplementedError("c03: select_k is yours to write")


def run_loop(query, retrieve, generate, max_steps):
    """Run the loop to an answer, recording every retrieval decision it made.

    retrieve(query) -> {"query_embedding": list[float], "passages": list[dict]}
    generate(query, passages, step) -> {"text": str, "done": bool,
                                        "follow_up": str | None,
                                        "retrieve_scores": dict[str, float]}
    """
    raise NotImplementedError("c03: run_loop is yours to write")
