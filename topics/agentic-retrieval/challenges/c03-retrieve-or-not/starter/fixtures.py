"""Fakes built from the corpus, so nothing here calls a model.

`make_retrieve` and `make_generate` produce the two callables `run_loop` takes. The
generator is scripted: it reads which passage ids are already in the context and which
step it is on, and emits the first rule in the scenario that matches both. That is
enough to reproduce a model that asks a follow-up question, a model that answers from
its own weights, and a model that asks for the same thing twice.

The held-out set builds its callables the same way from a different world.
"""

import json
from pathlib import Path

CORPUS = Path(__file__).resolve().parents[3] / "corpus"


def load_corpus():
    """Return (passages by id, query embeddings by id, scenarios)."""
    with (CORPUS / "c03-passages.json").open(encoding="utf-8") as handle:
        world = json.load(handle)
    with (CORPUS / "c03-scenarios.json").open(encoding="utf-8") as handle:
        scenarios = json.load(handle)["scenarios"]
    passages = {p["id"]: p for p in world["passages"]}
    queries = {q["id"]: q["embedding"] for q in world["queries"]}
    return passages, queries, scenarios


def normalise(text):
    return " ".join(str(text).lower().split())


def make_retrieve(scenario, passages, queries):
    """A retriever that answers the scenario's queries and nothing else.

    A query it does not recognise returns an empty candidate list. That is the dead end
    a real retriever hands back, and your loop has to survive it.
    """
    rules = {normalise(rule["query"]): rule for rule in scenario["retrieve_rules"]}
    log = []

    def retrieve(query):
        log.append(query)
        rule = rules.get(normalise(query))
        if rule is None:
            return {"query_embedding": [0.0] * 6, "passages": []}
        embedding = queries[rule["query_embedding"]]
        candidates = []
        for candidate in rule["candidates"]:
            passage = dict(passages[candidate["id"]])
            passage["score"] = candidate["score"]
            candidates.append(passage)
        return {"query_embedding": list(embedding), "passages": candidates}

    return retrieve, log


def make_generate(scenario):
    """A scripted generator over the scenario's rules."""

    def generate(query, passages, step):
        held = {p["id"] for p in passages}
        for rule in scenario["generate_rules"]:
            if rule.get("step") is not None and rule["step"] != step:
                continue
            if not set(rule.get("have", ())) <= held:
                continue
            return {
                "text": rule["text"],
                "done": rule.get("done", False),
                "follow_up": rule.get("follow_up"),
                "retrieve_scores": rule.get("retrieve_scores", {}),
            }
        return {"text": "unscripted", "done": True, "follow_up": None, "retrieve_scores": {}}

    return generate
