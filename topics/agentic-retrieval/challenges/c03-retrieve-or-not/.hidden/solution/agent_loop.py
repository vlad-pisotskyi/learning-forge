"""Reference implementation for c03.

Four functions and one loop that composes them. The loop is the interesting part: it
runs the generator first, asks whether the step it is about to take needs retrieval,
and only then spends a retrieval. Everything else is arithmetic the brief pins.

`forge eval --reference` stages this file at work/agent_loop.py and runs the held-out
set against it, which is what makes "the challenge is solvable inside this interface"
a fact rather than a claim.
"""

import math

# The three numbers the loop runs on. They sit at module level because every one of
# them is a decision somebody made from outside the model, and burying a decision in a
# call site is how it stops being reviewable. The threshold in particular arrives from
# outside training: Self-RAG's rule is that retrieval fires when the normalised
# probability of Retrieve=Yes surpasses a designated bar, and the bar is designated
# here.
RETRIEVE_THRESHOLD = 0.5
LAMBDA = 0.7
MMR_K = 3
TOKEN_BUDGET = 30

# Two floats computed by different routes can differ in the last bit or two, and MMR
# rescores every candidate on every round, so exact equality is the wrong test for a
# tie. This is the width of "the same score".
TIE = 1e-9


def cosine(a, b):
    """Cosine similarity of two vectors held as lists of floats.

    A zero vector has no direction, so there is no angle to take the cosine of. Zero is
    the answer that keeps the caller's arithmetic finite, and it is the answer that
    makes a passage with no embedding fall to the bottom of a ranking rather than
    crashing it.
    """
    if len(a) != len(b):
        raise ValueError(f"cosine needs vectors of one length, got {len(a)} and {len(b)}")
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for x, y in zip(a, b):
        dot += x * y
        norm_a += x * x
        norm_b += y * y
    if norm_a <= 0.0 or norm_b <= 0.0:
        return 0.0
    return dot / (math.sqrt(norm_a) * math.sqrt(norm_b))


def normalise_query(text):
    """Fold a query to the form two spellings of one request share."""
    return " ".join(str(text).lower().split())


def should_retrieve(query, state, threshold):
    """Decide whether this step needs retrieval at all.

    Two rules, and the order matters. A query the loop has already run is refused
    whatever the generator's confidence says, because the second run returns the
    passages the first one already put in the context: it costs a step and adds
    nothing. Otherwise the decision is the threshold rule, with the probability
    normalised over the retrieve token's own values rather than over a vocabulary.
    """
    seen = state.get("seen_queries") or []
    if normalise_query(query) in {normalise_query(s) for s in seen}:
        return False

    scores = state.get("retrieve_scores") or {}
    total = sum(scores.values())
    if total <= 0.0:
        # No signal at all is not a signal to retrieve. The generator that emitted
        # nothing has not asked for anything.
        return False
    p_yes = scores.get("yes", 0.0) / total
    # "Surpasses" is strict. A step sitting exactly on the bar has not cleared it.
    return p_yes > threshold


def rerank_mmr(passages, query, lam, k):
    """Select k passages by the maximal marginal relevance criterion.

    The criterion is the one printed on page 335 of the 1998 paper, parentheses
    included:

        arg max over D_i in R\\S of  lam * (Sim1(D_i, Q) - (1 - lam) * max Sim2(D_i, D_j))

    Sim1 and Sim2 are both cosine here, which the paper permits. Note where the closing
    parenthesis falls: lam multiplies the whole bracket rather than the relevance term
    alone. That is the transcription the chapter gives, it is not the rendering most
    secondary sources reproduce, and at lam = 0 it collapses every candidate to a score
    of zero. Implementing it faithfully means the tie rule below is what decides the
    order at that endpoint.

    Selection is incremental rather than a sort, because a candidate's score depends on
    what has already been picked and changes every time the selected set grows.
    """
    if k <= 0 or not passages:
        return []

    # Query similarity does not depend on the selected set, so it is computed once.
    relevance = [cosine(p["embedding"], query) for p in passages]

    chosen = []
    wanted = min(k, len(passages))
    while len(chosen) < wanted:
        best = None
        best_score = None
        for i, passage in enumerate(passages):
            if i in chosen:
                continue
            # The largest similarity to any single selected document, which is the
            # harshest penalty available to a near-duplicate. An average over the
            # selected set would be the softer reading, and the printed criterion is
            # not the softer reading. Over an empty selected set there is nothing to
            # take a maximum of, and zero is the value that leaves the first pick to
            # relevance alone.
            novelty = max(
                (cosine(passage["embedding"], passages[j]["embedding"]) for j in chosen),
                default=0.0,
            )
            score = lam * (relevance[i] - (1.0 - lam) * novelty)
            if best_score is None or score > best_score + TIE:
                best = i
                best_score = score
        # Walking the candidates in input order and replacing only on a strictly better
        # score is what sends a tie to the earlier candidate. No separate tie branch.
        chosen.append(best)
    return [passages[i] for i in chosen]


def select_k(passages, budget):
    """Keep the head of an ordered list that fits the token budget.

    Two rules, from two different chapters. A passage that scores at or below zero is
    not evidence about the query, and putting one in the context costs answer accuracy,
    so it never earns a slot however much room is left. And the walk stops at the first
    passage that does not fit rather than skipping past it to a smaller one further
    down: the list is in the order the reranker chose, so skipping ahead swaps a
    passage the ranker preferred for one it did not, purely because the budget had room.
    Filling the budget is not the goal. Spending it well is.
    """
    kept = []
    used = 0
    for passage in passages:
        if passage.get("score", 0.0) <= 0.0:
            continue
        tokens = passage["tokens"]
        if used + tokens > budget:
            break
        kept.append(passage)
        used += tokens
    return kept


def run_loop(query, retrieve, generate, max_steps):
    """Run the loop to an answer, recording every retrieval decision it made.

    The generator moves first on every round. That ordering is the whole point of an
    adaptive loop: retrieving before the model has said anything is the fixed pipeline,
    and the fixed pipeline retrieves the same amount for a question that needs three
    documents and for one that needs none.
    """
    passages = []
    seen = []
    decisions = []
    retrievals = 0
    answer = ""
    steps = 0

    for step in range(max_steps):
        # The generator gets a copy. A fake that mutates the loop's context would be a
        # bug this function cannot see, and a real one has no business holding it.
        move = generate(query, list(passages), step)
        steps = step + 1
        answer = move.get("text", "")
        if move.get("done"):
            break

        # A generator that emitted no sub-question is still asking about the original.
        next_query = move.get("follow_up") or query
        state = {
            "passages": list(passages),
            "seen_queries": list(seen),
            "retrieve_scores": move.get("retrieve_scores") or {},
            "step": step,
        }
        wanted = bool(should_retrieve(next_query, state, RETRIEVE_THRESHOLD))
        decisions.append({"step": step, "query": next_query, "retrieved": wanted})
        if not wanted:
            continue

        result = retrieve(next_query)
        retrievals += 1
        seen.append(normalise_query(next_query))
        ranked = rerank_mmr(
            result.get("passages") or [],
            result.get("query_embedding") or [],
            LAMBDA,
            MMR_K,
        )
        held = {p["id"] for p in passages}
        for passage in select_k(ranked, TOKEN_BUDGET):
            # A passage already in the context is a slot spent twice on one fact.
            if passage["id"] in held:
                continue
            passages.append(passage)
            held.add(passage["id"])

    return {
        "answer": answer,
        "steps": steps,
        "retrievals": retrievals,
        "decisions": decisions,
        "passages": passages,
    }
