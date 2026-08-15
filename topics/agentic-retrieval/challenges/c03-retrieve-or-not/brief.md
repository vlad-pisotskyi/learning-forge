# Decide whether to retrieve, then choose what to keep

Every pipeline in chapters one to eight retrieved once, before generation, and retrieved
the same number of passages whatever the question was. Chapters nine and ten took that
apart from two directions. Self-RAG moved the retrieval decision into the generator and
gave it a bar to clear. FLARE and Self-Ask moved the timing into the middle of
generation. Chapter eight, meanwhile, was about what to do with the passages once they
come back: reorder them, and then decide how many of them earn a slot.

Build the small agent that does all three. Four functions in `work/agent_loop.py`, and
the fourth one composes the other three into a loop.

```python
should_retrieve(query: str, state: dict, threshold: float) -> bool
rerank_mmr(passages: list[dict], query: list[float], lam: float, k: int) -> list[dict]
select_k(passages: list[dict], budget: int) -> list[dict]
run_loop(query: str, retrieve, generate, max_steps: int) -> dict
```

Python 3, standard library only. There is no numpy, so `rerank_mmr` takes an embedding
as a list of floats and the cosine similarity is yours to write.

## the shapes everything travels in

A passage is a dict:

```python
{"id": "p01", "text": "Orion streams...", "embedding": [3.0, 2.0, 0.0, 0.0, 1.0, 0.0], "tokens": 11}
```

A retriever attaches a `score` to each passage it returns, which is that passage's
similarity to the query it was retrieved for. `retrieve` and `generate` are callables
your loop is handed, so nothing in this challenge calls a model:

```python
retrieve(query: str) -> {"query_embedding": list[float], "passages": list[dict]}
generate(query: str, passages: list[dict], step: int) -> {
    "text": str,                        # what the generator produced this step
    "done": bool,                       # whether that text is the final answer
    "follow_up": str | None,            # the sub-question to retrieve for, when not done
    "retrieve_scores": dict[str, float] # its scores for the values of the retrieve token
}
```

A retriever handed a query it cannot serve returns an empty candidate list rather than
raising. That is a dead end, and the loop has to survive one.

## should_retrieve

Chapter nine's threshold rule, plus one thing the loop knows that the generator does not.

The generator's `retrieve_scores` are the scores over the values of its retrieve token,
for instance `{"yes": 8.0, "no": 2.0}`. Normalise over the values present in that dict,
not over anything wider, and compare the resulting probability of yes against the
threshold. Self-RAG's word is "surpasses", so a step sitting exactly on the bar has not
cleared it. Scores are non-negative. An empty dict, or one whose values sum to zero, is
not a request to retrieve.

Before any of that, the loop's own bookkeeping gets a say. `state` carries `passages`
(what the context already holds), `seen_queries` (the queries the loop has already run),
`retrieve_scores`, and `step`. A query the loop has already run is refused whatever the
generator's confidence says, because running it again returns the passages that are
already in the context: a step spent, nothing gained. Compare queries after folding case
and collapsing runs of whitespace, so two spellings of one request count as one.

## rerank_mmr

Chapter eight transcribed the criterion from page 335 of the 1998 paper. Implement that
transcription, parentheses where the paper puts them:

```
arg max over D_i in R\S of   lam * ( Sim1(D_i, Q) - (1 - lam) * max over D_j in S of Sim2(D_i, D_j) )
```

Sim1 and Sim2 are both cosine similarity here, which the paper permits. `S` is the set
already selected, so a candidate's score changes every time that set grows: selection is
incremental, not a sort. Over an empty `S` there is nothing to take a maximum of, and the
novelty term is zero, which leaves the first pick to relevance alone.

Do not correct the arithmetic. Chapter eight is explicit that this parenthesisation is
not what most secondary sources reproduce and that one of its endpoints does not behave
the way the paper's own sentence describes. Both endpoints are measured here, so a
rendering copied from a blog post will not agree with what you are scored against.

Return the passage dicts themselves, in selection order, at most `k` of them. Two more
decisions are yours to make and both are checked. A zero vector has no direction, so
settle what its cosine is before you write the division. And when two candidates score
the same, something has to break the tie: use the earlier position in the input list, and
allow a tolerance of about `1e-9` rather than comparing floats for equality, because
scores here are recomputed on every round.

The lambda parameter is not a quality knob. Chapter eight's last section is the reason:
no source pinned in this topic measures what moving it does to the quality of an answer
across its range. What it does to the retrieved set is well defined, and that is what
your implementation has to get right.

## select_k

The list arrives in the order the reranker chose. Two rules cut it down.

A passage whose score is zero or below is not evidence about the query. Chapter seven
priced what an irrelevant passage in the context costs, so one never earns a slot however
much room is left. Drop it and carry on down the list.

Then walk what survives and keep passages while the running total of `tokens` stays
within `budget`. A passage that exactly fills the budget is kept. Stop at the first
passage that does not fit, rather than skipping past it to a smaller one further down:
skipping ahead swaps a passage the ranker preferred for one it did not, purely because
the budget had room. Filling the budget is not the goal.

## run_loop

The generator moves first on every round. That ordering is the whole of the difference
between an adaptive loop and the fixed pipeline: retrieving before the model has said
anything is exactly the arrangement Self-RAG's abstract objects to.

For each step from zero up to `max_steps`, call `generate(query, passages, step)` with
the original query and the passages gathered so far. If it reports `done`, its text is
the answer and the loop is over. Otherwise the query for this step is its `follow_up`, or
the original query when it produced none. Ask `should_retrieve` about that query, record
the decision, and retrieve only if the answer is yes. What comes back goes through
`rerank_mmr` and then `select_k`, and whatever survives is appended to the context, minus
any passage whose id is already in it. If the loop runs out of steps, the answer is the
last thing the generator wrote.

The four constants the loop runs on are in the starter. Leave the values alone, because
the held-out set runs your loop at those settings, and keep them at module level rather
than inlining them: a threshold that arrives from outside the model is a decision
somebody should be able to find and change.

Return one dict:

```python
{
    "answer": str,          # the final answer text
    "steps": int,           # how many times generate was called
    "retrievals": int,      # how many times retrieve was called
    "decisions": list[dict],# one {"step", "query", "retrieved"} per decision reached
    "passages": list[dict], # the context, in the order passages entered it
}
```

A step that ends the loop with `done` has reached no retrieval decision, so it records
none. `step` in a decision is the index of the generate call that produced it.

## the corpus

`corpus/c03-passages.json` is a small synthetic world: fourteen passages with hand-built
embeddings over six named axes, six queries, and the whitespace token count of each
passage. Every candidate score in it is the cosine similarity of the passage embedding
and the query embedding, rounded to six places, so recomputing one is a way to check your
own cosine before anything else is built on it.

`corpus/c03-scenarios.json` holds three sample scenarios in the format the fakes read,
with the answer each one should reach. `dev_check.py` in the starter runs your loop over
all three and prints the decisions it made. Those three exist for development. What you
are scored on is a different world with its own passages and its own scripted generator,
so tuning to these three tunes to the wrong thing.

## how it is scored

| metric | bar | what it covers |
|---|---|---|
| `mmr_cases_passed` | 1.0 | held-out reranking cases, each an exact selection order |
| `loop_cases_passed` | 0.9 or better | held-out cases over the decision rule, the budget rule, and the loop's bookkeeping |
| `answer_accuracy` | 0.7 or better | share of held-out questions the loop answers correctly |
| `retrievals_per_query` | 2.5 or less | mean number of retrieve calls across those same questions |

`mmr_cases_passed` is the one bar with no slack in it. The criterion is arithmetic and
the cases include both endpoints, an exact duplicate, a tie, a zero vector, and a
negative similarity, so every one of them has one right answer.

The last two are a pair, and passing both is the point. A loop that retrieves on every
step it has not finished answers most of the questions and overruns the retrieval budget.
A loop that never retrieves spends nothing and answers almost none of them. Neither
number is reachable by ignoring the decision rule, which is what makes them worth
reporting together.
