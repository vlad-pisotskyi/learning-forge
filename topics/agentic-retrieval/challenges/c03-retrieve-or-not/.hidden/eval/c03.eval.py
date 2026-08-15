"""Held-out evaluation set for c03. The Judge runs this; nobody else reads it.

Nothing here comes from corpus/c03-passages.json. The world below is a second synthetic
world with its own passages, its own queries and its own scripted generator, so a
submission tuned to the sample scenarios has been tuned to the wrong thing.

Four metrics, and they are deliberately not four views of one number.

  mmr_cases_passed     the criterion, including both endpoints and the ties
  loop_cases_passed    the decision rule, the budget rule, and the loop's bookkeeping
  answer_accuracy      whether the loop reaches the right answer at all
  retrievals_per_query what it spent getting there

The last two are the pair that matters. A loop that retrieves on every step it is not
finished reaches most of the answers and blows the budget; a loop that never retrieves
spends nothing and answers almost nothing. Passing both means the decision rule is
doing work.

Thresholds live in challenge.json and are compared by the CLI. This file prints numbers.
"""

import math
import sys
from pathlib import Path

# The learner's code is staged at "work" beside this challenge, the same place a
# TypeScript spec would reach through a relative import.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "work"))


# --------------------------------------------------------------------------- preflight

def load_entrypoint():
    """Import the four exports, or say precisely which one is missing.

    A submission that wired the interface wrong should be told that. Reporting it as a
    score of zero would read as an algorithm that failed, which is a different problem
    with a different fix.
    """
    try:
        import agent_loop
    except ImportError as exc:
        raise SystemExit(
            "c03: could not import work/agent_loop.py. The evaluation set imports the "
            f"module by name from the work tree, and the import raised: {exc}"
        )

    wanted = {
        "should_retrieve": "should_retrieve(query, state, threshold) -> bool",
        "rerank_mmr": "rerank_mmr(passages, query, lam, k) -> list[dict]",
        "select_k": "select_k(passages, budget) -> list[dict]",
        "run_loop": "run_loop(query, retrieve, generate, max_steps) -> dict",
    }
    missing = [
        f"  {name}: expected {sig}"
        for name, sig in wanted.items()
        if not callable(getattr(agent_loop, name, None))
    ]
    if missing:
        raise SystemExit(
            "c03: work/agent_loop.py does not export every function the brief pins.\n"
            + "\n".join(missing)
        )
    return agent_loop


def smoke_test(module):
    """Check the four return containers before scoring anything against them."""
    passage = {"id": "smoke", "text": "one", "embedding": [1.0, 0.0], "tokens": 1, "score": 1.0}

    decision = module.should_retrieve(
        "smoke",
        {"passages": [], "seen_queries": [], "retrieve_scores": {"yes": 1.0, "no": 0.0}, "step": 0},
        0.5,
    )
    if decision is None:
        raise SystemExit("c03: should_retrieve returned None. It has to return a decision.")

    ranked = module.rerank_mmr([passage], [1.0, 0.0], 0.7, 1)
    if not isinstance(ranked, list) or not ranked or not isinstance(ranked[0], dict):
        raise SystemExit(
            "c03: rerank_mmr has to return a list of the passage dicts it was given, "
            f"in selection order. It returned {ranked!r}."
        )

    kept = module.select_k([passage], 10)
    if not isinstance(kept, list):
        raise SystemExit(f"c03: select_k has to return a list of passages, not {kept!r}.")

    def retrieve(_query):
        return {"query_embedding": [1.0, 0.0], "passages": [passage]}

    def generate(_query, _passages, _step):
        return {"text": "done", "done": True, "follow_up": None, "retrieve_scores": {}}

    result = module.run_loop("smoke", retrieve, generate, 2)
    if not isinstance(result, dict):
        raise SystemExit(f"c03: run_loop has to return a dict, not {result!r}.")
    absent = [k for k in ("answer", "steps", "retrievals", "decisions", "passages") if k not in result]
    if absent:
        raise SystemExit(
            "c03: run_loop's result is missing the keys "
            + ", ".join(absent)
            + ". The brief pins all five."
        )


AGENT = load_entrypoint()
smoke_test(AGENT)
should_retrieve = AGENT.should_retrieve
rerank_mmr = AGENT.rerank_mmr
select_k = AGENT.select_k
run_loop = AGENT.run_loop


# ------------------------------------------------------------------ the held-out world

def _cos(a, b):
    """Private to the fixtures. Used to attach retriever scores, never to derive an
    expected answer: every expected ordering below is written out by hand."""
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


def _norm(text):
    return " ".join(str(text).lower().split())


# Axes: route, cache, owner, quota, alerting, audit.
PASSAGE_SOURCE = [
    ("h01", "Vega routes every request through the Lumen cache before it reaches storage.", [3, 3, 0, 0, 0, 0]),
    ("h02", "The Lumen cache is owned by the Fenwick group.", [0, 3, 3, 0, 0, 0]),
    ("h03", "Fenwick sets a nightly quota on cache rebuilds.", [0, 2, 3, 3, 0, 0]),
    ("h04", "Vega requests bypass the cache when the payload exceeds one megabyte.", [3, 2, 0, 1, 0, 0]),
    ("h05", "Alerting for Vega pages the on-duty engineer after two failures.", [1, 0, 0, 0, 3, 0]),
    ("h06", "Every cache eviction is written to the audit log.", [0, 3, 0, 0, 0, 3]),
    ("h07", "The Fenwick group publishes its quota changes a week ahead.", [0, 0, 3, 3, 0, 0]),
    ("h08", "Audit records are retained for ninety days and then dropped.", [0, 0, 0, 0, 0, 3]),
    ("h09", "Lumen holds a request for eleven minutes before evicting it.", [1, 3, 0, 0, 0, 0]),
    ("h10", "Quota overruns raise an alert rather than rejecting the request.", [0, 0, 0, 3, 3, 0]),
    ("h11", "Vega has two routing tables and swaps between them on deploy.", [3, 0, 0, 0, 0, 0]),
    ("h12", "The on-duty rota for alerting is owned by the Fenwick group.", [0, 0, 3, 0, 3, 0]),
    ("h13", "Nothing in the cache survives a region failover.", [0, 3, 0, 0, 1, 0]),
    ("h14", "Access to the audit log goes through the same review as Lumen.", [0, 1, 0, 0, 0, 3]),
]
PASSAGES = {
    pid: {"id": pid, "text": text, "embedding": [float(x) for x in vec], "tokens": len(text.split())}
    for pid, text, vec in PASSAGE_SOURCE
}

QUERY_EMBEDDINGS = {
    "e1": [3.0, 3.0, 0.0, 0.0, 0.0, 0.0],  # where do Vega requests go first
    "e2": [0.0, 2.0, 3.0, 0.0, 0.0, 0.0],  # who owns the Lumen cache
    "e3": [0.0, 0.0, 3.0, 3.0, 0.0, 0.0],  # what quota does Fenwick set
    "e4": [1.0, 3.0, 0.0, 0.0, 0.0, 0.0],  # how long does Lumen hold a request
    "e5": [0.0, 0.0, 2.0, 0.0, 3.0, 0.0],  # who is paged by alerting
    "e6": [0.0, 0.0, 0.0, 0.0, 0.0, 3.0],  # how long are audit records kept
}

Q_ROUTE = "where do Vega requests go first"
Q_OWNER = "who owns the Lumen cache"
Q_QUOTA = "what quota does Fenwick set"
Q_HOLD = "how long does Lumen hold a request"
Q_PAGED = "who is paged by alerting"
Q_AUDIT = "how long are audit records kept"
Q_FAILOVER = "what happens on region failover"

RETRIEVERS = {
    _norm(query): rule
    for query, rule in {
        Q_ROUTE: ("e1", ["h01", "h04", "h09"]),
        Q_OWNER: ("e2", ["h02", "h07", "h06"]),
        Q_QUOTA: ("e3", ["h07", "h03", "h10"]),
        Q_HOLD: ("e4", ["h09", "h13", "h01"]),
        Q_PAGED: ("e5", ["h12", "h05", "h10"]),
        Q_AUDIT: ("e6", ["h08", "h14", "h06"]),
    }.items()
}


def make_retrieve():
    """A retriever that answers the six queries above and nothing else.

    A query it does not know returns an empty candidate list rather than raising, which
    is the dead end a real retriever hands back and which the loop has to survive.
    """
    log = []

    def retrieve(query):
        log.append(query)
        rule = RETRIEVERS.get(_norm(query))
        if rule is None:
            return {"query_embedding": [0.0] * 6, "passages": []}
        embedding_id, candidate_ids = rule
        embedding = QUERY_EMBEDDINGS[embedding_id]
        candidates = []
        for pid in candidate_ids:
            passage = dict(PASSAGES[pid])
            passage["score"] = _cos(passage["embedding"], embedding)
            candidates.append(passage)
        return {"query_embedding": list(embedding), "passages": candidates}

    return retrieve, log


def make_generate(rules):
    """A scripted generator. It reads the ids already in the context and the step index,
    and emits the first rule that matches both."""

    def generate(_query, passages, step):
        held = {p["id"] for p in passages}
        for rule in rules:
            if "step" in rule and rule["step"] != step:
                continue
            if not set(rule.get("have", ())) <= held:
                continue
            return {
                "text": rule["text"],
                "done": rule.get("done", False),
                "follow_up": rule.get("follow_up"),
                "retrieve_scores": rule.get("scores", {}),
            }
        return {"text": "unscripted", "done": True, "follow_up": None, "retrieve_scores": {}}

    return generate


def say(text, follow_up=None, yes=None, no=None, have=(), step=None, done=False):
    rule = {"text": text, "done": done, "have": list(have)}
    if follow_up is not None:
        rule["follow_up"] = follow_up
    if yes is not None:
        rule["scores"] = {"yes": yes, "no": no}
    if step is not None:
        rule["step"] = step
    return rule


# ------------------------------------------------------------------ the twelve queries
# Two the generator answers from its own weights, three single hops, two chains whose
# second query cannot be written until the first passage is in hand, three where the
# generator floats a sub-question it is not confident about and resolves it itself on
# the next step, and two where it asks for the same thing twice.

SCENARIOS = [
    {
        "id": "parametric-group",
        "query": "Is Fenwick a group?",
        "max_steps": 6,
        "answer": "Yes",
        "rules": [say("Yes", done=True)],
    },
    {
        "id": "parametric-tables",
        "query": "How many routing tables does Vega have?",
        "max_steps": 6,
        "answer": "Two",
        "rules": [say("Two", done=True)],
    },
    {
        "id": "hop-route",
        "query": "Where do Vega requests go first?",
        "max_steps": 6,
        "answer": "The Lumen cache",
        "rules": [
            say("The Lumen cache", have=["h01"], done=True),
            say("I do not know the routing path.", follow_up=Q_ROUTE, yes=8.5, no=1.5),
        ],
    },
    {
        "id": "hop-hold",
        "query": "How long does Lumen hold a request?",
        "max_steps": 6,
        "answer": "Eleven minutes",
        "rules": [
            say("Eleven minutes", have=["h09"], done=True),
            say("The eviction window is not something I know.", follow_up=Q_HOLD, yes=9.0, no=1.0),
        ],
    },
    {
        "id": "hop-audit",
        "query": "How long are audit records kept?",
        "max_steps": 6,
        "answer": "Ninety days",
        "rules": [
            say("Ninety days", have=["h08"], done=True),
            say("Retention is not in my weights.", follow_up=Q_AUDIT, yes=8.0, no=2.0),
        ],
    },
    {
        "id": "chain-owner",
        "query": "Who owns the cache that Vega routes through?",
        "max_steps": 6,
        "answer": "Fenwick",
        "rules": [
            say("Fenwick", have=["h01", "h02"], done=True),
            say("Vega routes through Lumen, so the question is who owns Lumen.", have=["h01"], follow_up=Q_OWNER, yes=9.0, no=1.0),
            say("I cannot name the cache yet.", follow_up=Q_ROUTE, yes=8.0, no=2.0),
        ],
    },
    {
        "id": "chain-quota",
        "query": "Who sets the quota on the cache Vega routes through?",
        "max_steps": 6,
        "answer": "Fenwick",
        "rules": [
            say("Fenwick", have=["h01", "h07"], done=True),
            say("The cache is Lumen. Now the quota.", have=["h01"], follow_up=Q_QUOTA, yes=9.0, no=1.0),
            say("I cannot name the cache yet.", follow_up=Q_ROUTE, yes=8.0, no=2.0),
        ],
    },
    {
        "id": "soft-overrun",
        "query": "Does a quota overrun reject a request?",
        "max_steps": 8,
        "answer": "No, it raises an alert",
        "rules": [
            say("Now I am wondering who gets paged.", have=["h08"], follow_up=Q_PAGED, yes=3.0, no=7.0),
            say("That was quota changes, not overruns.", have=["h07"], follow_up=Q_AUDIT, yes=3.0, no=7.0),
            say("No, it raises an alert", step=1, done=True),
            say("An overrun alerts rather than rejects, I am fairly sure.", follow_up=Q_QUOTA, yes=2.5, no=7.5),
        ],
    },
    {
        "id": "soft-retention",
        "query": "Is the audit log kept forever?",
        "max_steps": 8,
        "answer": "No",
        "rules": [
            say("That was the rota, not the log.", have=["h12"], follow_up=Q_QUOTA, yes=3.0, no=7.0),
            say("Ownership does not tell me retention.", have=["h02"], follow_up=Q_PAGED, yes=3.0, no=7.0),
            say("No", step=1, done=True),
            say("Ninety days sounds right, though I could check the owner.", follow_up=Q_OWNER, yes=2.0, no=8.0),
        ],
    },
    {
        "id": "soft-deploy",
        "query": "Does Vega swap routing tables on deploy?",
        "max_steps": 8,
        "answer": "Yes",
        "rules": [
            say("Eviction timing is not what I asked about.", have=["h09"], follow_up=Q_AUDIT, yes=3.0, no=7.0),
            say("Retention is not it either.", have=["h08"], follow_up=Q_HOLD, yes=3.0, no=7.0),
            say("Yes", step=1, done=True),
            say("It does, on every deploy, though I could confirm the cache side.", follow_up=Q_HOLD, yes=2.0, no=8.0),
        ],
    },
    {
        "id": "repeat-owner",
        "query": "Who owns the Lumen cache?",
        "max_steps": 6,
        "answer": "Fenwick",
        "rules": [
            say("Fenwick", have=["h02"], step=2, done=True),
            say("Let me confirm that.", have=["h02"], follow_up=Q_OWNER, yes=9.0, no=1.0),
            say("I need the owner of Lumen.", follow_up=Q_OWNER, yes=9.0, no=1.0),
        ],
    },
    {
        "id": "repeat-rota",
        "query": "Which group owns the alerting rota?",
        "max_steps": 6,
        "answer": "Fenwick",
        "rules": [
            say("Fenwick", have=["h12"], step=2, done=True),
            say("I want a second look at that.", have=["h12"], follow_up=Q_PAGED, yes=8.0, no=2.0),
            say("I need the rota owner.", follow_up=Q_PAGED, yes=8.0, no=2.0),
        ],
    },
]
SCENARIO_BY_ID = {s["id"]: s for s in SCENARIOS}

# Four more scenarios that exist for the structural cases rather than for the score.
EDGE_SCENARIOS = {
    "dead-end": {
        "id": "dead-end",
        "query": "What survives a region failover?",
        "max_steps": 4,
        "answer": "I keep needing the same thing.",
        "rules": [say("I keep needing the same thing.", follow_up=Q_FAILOVER, yes=9.0, no=1.0)],
    },
    "overlap": {
        "id": "overlap",
        "query": "Who sets the quota and who is paged?",
        "max_steps": 6,
        "answer": "Fenwick on both counts",
        "rules": [
            say("Fenwick on both counts", have=["h07", "h12"], done=True),
            say("Quota is Fenwick. Now the paging.", have=["h07"], follow_up=Q_PAGED, yes=9.0, no=1.0),
            say("I need the quota owner first.", follow_up=Q_QUOTA, yes=9.0, no=1.0),
        ],
    },
    "on-the-bar": {
        "id": "on-the-bar",
        "query": "Does the quota change weekly?",
        "max_steps": 3,
        "answer": "It changes when Fenwick says so",
        "rules": [
            say("It changes when Fenwick says so", step=1, done=True),
            say("I could look up the quota schedule.", follow_up=Q_QUOTA, yes=5.0, no=5.0),
        ],
    },
    "no-follow-up": {
        "id": "no-follow-up",
        "query": Q_PAGED,
        "max_steps": 3,
        "answer": "Fenwick",
        "rules": [
            say("Fenwick", have=["h12"], done=True),
            say("I have nothing more precise to ask than the question itself.", yes=9.0, no=1.0),
        ],
    },
}


def play(scenario):
    retrieve, log = make_retrieve()
    generate = make_generate(scenario["rules"])
    result = run_loop(scenario["query"], retrieve, generate, scenario["max_steps"])
    return result, log


# ------------------------------------------------------------------------- the criterion

def passage(pid, embedding):
    return {"id": pid, "text": pid, "embedding": [float(x) for x in embedding], "tokens": 10, "score": 1.0}


# Four candidates whose top scorer is not parallel to the query, which is the only shape
# where the novelty term can reorder anything. Input order is deliberately not the
# relevance order.
V = [
    passage("v2", [1, 0, 0, 0]),
    passage("v3", [0.6, 0.6, 0.53, 0]),
    passage("v1", [0.6, 0.8, 0, 0]),
    passage("v4", [0, 0, 0, 1]),
]
V_QUERY = [0.8, 0.6, 0.0, 0.0]

# w1 and w2 are the same vector, and w3 is equally relevant while sharing nothing with
# either. Three-way tie on relevance, so the first pick also tests the tie rule.
W = [
    passage("w1", [1, 0, 0, 0]),
    passage("w2", [1, 0, 0, 0]),
    passage("w3", [0, 1, 0, 0]),
    passage("w4", [0, 0, 1, 0]),
]
W_QUERY = [1.0, 1.0, 0.0, 0.0]

# A zero embedding, a candidate pointing away from the query, and an exact match.
Z = [
    passage("z1", [0, 0, 0, 0]),
    passage("z2", [-1, -1, 0, 0]),
    passage("z3", [1, 1, 0, 0]),
    passage("z4", [0, 0, 1, 0]),
]

MMR_CASES = [
    ("ordinary selection at 0.7", V, V_QUERY, 0.7, 3, ["v1", "v2", "v3"]),
    ("pure relevance at 1.0", V, V_QUERY, 1.0, 3, ["v1", "v3", "v2"]),
    ("the printed criterion at 0.0", V, V_QUERY, 0.0, 3, ["v2", "v3", "v1"]),
    ("0.9 is not 0.7", V, V_QUERY, 0.9, 3, ["v1", "v3", "v2"]),
    ("k past the end of the list", V, V_QUERY, 0.7, 10, ["v1", "v2", "v3", "v4"]),
    ("k of zero", V, V_QUERY, 0.7, 0, []),
    ("no candidates at all", [], V_QUERY, 0.7, 3, []),
    ("a duplicate demoted, a tie broken", W, W_QUERY, 0.7, 3, ["w1", "w3", "w2"]),
    ("the printed criterion at 0.0 again", W, W_QUERY, 0.0, 3, ["w1", "w2", "w3"]),
    ("a query with no direction", W, [0.0, 0.0, 0.0, 0.0], 0.7, 3, ["w1", "w3", "w4"]),
    ("a zero embedding and a negative similarity", Z, W_QUERY, 0.7, 4, ["z3", "z1", "z4", "z2"]),
    ("input order does not decide anything but ties", list(reversed(V)), V_QUERY, 0.7, 4, ["v1", "v2", "v3", "v4"]),
]


def score_mmr(failures):
    passed = 0
    for name, candidates, query, lam, k, expected in MMR_CASES:
        got = rerank_mmr([dict(p) for p in candidates], list(query), lam, k)
        try:
            got_ids = [p["id"] for p in got]
        except (TypeError, KeyError):
            failures.append(f"mmr: {name}: expected the passage dicts back, got {got!r}")
            continue
        if got_ids == expected:
            passed += 1
        else:
            failures.append(f"mmr: {name}: expected {expected}, got {got_ids}")
    return passed / len(MMR_CASES)


# ------------------------------------------------------------- the decision and the budget

def state(seen=(), yes=None, no=None, extra=None, step=0):
    scores = {}
    if yes is not None:
        scores["yes"] = yes
        scores["no"] = no
    if extra:
        scores.update(extra)
    return {"passages": [], "seen_queries": list(seen), "retrieve_scores": scores, "step": step}


SHOULD_CASES = [
    ("clearly above the bar", "who owns Lumen", state(yes=8.0, no=2.0), 0.5, True),
    ("clearly below the bar", "who owns Lumen", state(yes=2.0, no=8.0), 0.5, False),
    ("exactly on the bar", "who owns Lumen", state(yes=5.0, no=5.0), 0.5, False),
    ("a hair over the bar", "who owns Lumen", state(yes=51.0, no=49.0), 0.5, True),
    ("a query already run", "who owns Lumen", state(seen=["who owns lumen"], yes=9.0, no=1.0), 0.5, False),
    ("the same query, spelled loosely", "  Who   Owns  LUMEN ", state(seen=["who owns lumen"], yes=9.0, no=1.0), 0.5, False),
    ("a query the loop has not run", "who owns Vega", state(seen=["who owns lumen"], yes=9.0, no=1.0), 0.5, True),
    ("no signal at all", "who owns Lumen", state(), 0.5, False),
    (
        "a retrieve token with three values",
        "who owns Lumen",
        state(yes=4.0, no=3.0, extra={"continue": 3.0}),
        0.35,
        True,
    ),
    (
        "the same three values against a higher bar",
        "who owns Lumen",
        state(yes=4.0, no=3.0, extra={"continue": 3.0}),
        0.5,
        False,
    ),
    ("a bar of zero", "who owns Lumen", state(yes=1.0, no=9.0), 0.0, True),
]


def scored(pid, score, tokens):
    return {"id": pid, "text": pid, "embedding": [1.0, 0.0], "tokens": tokens, "score": score}


SELECT_CASES = [
    (
        "the budget cuts the tail off",
        [scored("a", 0.9, 12), scored("b", 0.8, 12), scored("c", 0.7, 12)],
        30,
        ["a", "b"],
    ),
    (
        "a passage that exactly fills the budget",
        [scored("a", 0.9, 18), scored("b", 0.8, 12)],
        30,
        ["a", "b"],
    ),
    ("the first passage is already too big", [scored("a", 0.9, 40), scored("b", 0.8, 5)], 30, []),
    ("a budget of nothing", [scored("a", 0.9, 1)], 0, []),
    ("no passages", [], 30, []),
    (
        "a zero-scoring passage in the middle",
        [scored("a", 0.9, 10), scored("b", 0.0, 5), scored("c", 0.6, 10)],
        30,
        ["a", "c"],
    ),
    (
        "a negatively scoring passage",
        [scored("a", 0.9, 10), scored("b", -0.4, 5)],
        30,
        ["a"],
    ),
    (
        "stop rather than skip ahead to something smaller",
        [scored("a", 0.9, 20), scored("b", 0.8, 20), scored("c", 0.7, 5)],
        30,
        ["a"],
    ),
    (
        "two small passages behind one that does not fit",
        [scored("a", 0.9, 10), scored("b", 0.8, 25), scored("c", 0.7, 6), scored("d", 0.6, 6)],
        30,
        ["a"],
    ),
]


def flags(result):
    return [bool(d.get("retrieved")) for d in result.get("decisions", [])]


def queries(result):
    return [d.get("query") for d in result.get("decisions", [])]


def ids(result):
    return [p["id"] for p in result.get("passages", [])]


def check_two_hop(failures):
    result, log = play(SCENARIO_BY_ID["chain-owner"])
    ok = True
    if result.get("retrievals") != 2:
        failures.append(f"loop: a two-hop question should cost two retrievals, got {result.get('retrievals')}")
        ok = False
    if result.get("steps") != 3:
        failures.append(f"loop: a two-hop question should take three generate calls, got {result.get('steps')}")
        ok = False
    if flags(result) != [True, True]:
        failures.append(f"loop: expected both decisions to retrieve, got {flags(result)}")
        ok = False
    if "h01" not in ids(result) or "h02" not in ids(result):
        failures.append(f"loop: the two passages the answer needs are not in the context, got {ids(result)}")
        ok = False
    if len(log) != 2:
        failures.append(f"loop: the retriever was called {len(log)} times for two decisions to retrieve")
        ok = False
    return ok


def check_answered_from_weights(failures):
    result, log = play(SCENARIO_BY_ID["parametric-group"])
    ok = True
    if result.get("retrievals") != 0 or log:
        failures.append("loop: a question the generator answers at once should cost no retrieval")
        ok = False
    if result.get("decisions") != []:
        failures.append(f"loop: a loop that never reached a decision should record none, got {result.get('decisions')}")
        ok = False
    if result.get("steps") != 1:
        failures.append(f"loop: one generate call, got {result.get('steps')}")
        ok = False
    return ok


def check_soft_follow_up(failures):
    result, _ = play(SCENARIO_BY_ID["soft-overrun"])
    ok = True
    if flags(result) != [False]:
        failures.append(f"loop: a sub-question below the bar should be refused, decisions were {flags(result)}")
        ok = False
    if result.get("retrievals") != 0:
        failures.append(f"loop: nothing should have been retrieved, got {result.get('retrievals')}")
        ok = False
    if result.get("steps") != 2:
        failures.append(f"loop: two generate calls, got {result.get('steps')}")
        ok = False
    return ok


def check_repeat(failures):
    result, log = play(SCENARIO_BY_ID["repeat-owner"])
    ok = True
    if flags(result) != [True, False]:
        failures.append(f"loop: the second ask is the same query and should be refused, got {flags(result)}")
        ok = False
    if result.get("retrievals") != 1 or len(log) != 1:
        failures.append(f"loop: one retrieval for two identical asks, got {result.get('retrievals')}")
        ok = False
    return ok


def check_dead_end(failures):
    result, log = play(EDGE_SCENARIOS["dead-end"])
    ok = True
    if result.get("steps") != 4:
        failures.append(f"loop: a generator that never finishes should run to max_steps, got {result.get('steps')}")
        ok = False
    if result.get("retrievals") != 1:
        failures.append(f"loop: the same query four times is one retrieval, got {result.get('retrievals')}")
        ok = False
    if flags(result) != [True, False, False, False]:
        failures.append(f"loop: expected one retrieval and three refusals, got {flags(result)}")
        ok = False
    if ids(result):
        failures.append(f"loop: a retriever that returned nothing should add nothing, got {ids(result)}")
        ok = False
    if result.get("answer") != EDGE_SCENARIOS["dead-end"]["answer"]:
        failures.append("loop: on exhaustion the answer is the last thing the generator wrote")
        ok = False
    return ok


def check_no_duplicates(failures):
    result, _ = play(EDGE_SCENARIOS["overlap"])
    ok = True
    kept = ids(result)
    if len(kept) != len(set(kept)):
        failures.append(f"loop: a passage retrieved twice should hold one slot, got {kept}")
        ok = False
    if result.get("answer") != EDGE_SCENARIOS["overlap"]["answer"]:
        failures.append(f"loop: expected the overlap scenario to resolve, got {result.get('answer')!r}")
        ok = False
    return ok


def check_on_the_bar(failures):
    result, _ = play(EDGE_SCENARIOS["on-the-bar"])
    ok = True
    if flags(result) != [False]:
        failures.append(f"loop: a step sitting exactly on the bar has not cleared it, got {flags(result)}")
        ok = False
    if result.get("answer") != EDGE_SCENARIOS["on-the-bar"]["answer"]:
        failures.append(f"loop: expected the bar scenario to resolve, got {result.get('answer')!r}")
        ok = False
    return ok


def check_no_follow_up(failures):
    scenario = EDGE_SCENARIOS["no-follow-up"]
    result, log = play(scenario)
    ok = True
    if queries(result) != [scenario["query"]]:
        failures.append(
            f"loop: with no sub-question the decision is about the original query, got {queries(result)}"
        )
        ok = False
    if result.get("answer") != scenario["answer"]:
        failures.append(f"loop: expected the original query to be retrieved for, got {result.get('answer')!r}")
        ok = False
    if log != [scenario["query"]]:
        failures.append(f"loop: the retriever should have been called with the original query, got {log}")
        ok = False
    return ok


LOOP_CHECKS = [
    check_two_hop,
    check_answered_from_weights,
    check_soft_follow_up,
    check_repeat,
    check_dead_end,
    check_no_duplicates,
    check_on_the_bar,
    check_no_follow_up,
]


def score_control(failures):
    passed = 0
    total = 0

    for name, query, st, threshold, expected in SHOULD_CASES:
        total += 1
        got = bool(should_retrieve(query, dict(st), threshold))
        if got == expected:
            passed += 1
        else:
            failures.append(f"should_retrieve: {name}: expected {expected}, got {got}")

    for name, candidates, budget, expected in SELECT_CASES:
        total += 1
        got = select_k([dict(p) for p in candidates], budget)
        try:
            got_ids = [p["id"] for p in got]
        except (TypeError, KeyError):
            failures.append(f"select_k: {name}: expected the passage dicts back, got {got!r}")
            continue
        if got_ids == expected:
            passed += 1
        else:
            failures.append(f"select_k: {name}: expected {expected}, got {got_ids}")

    for check in LOOP_CHECKS:
        total += 1
        if check(failures):
            passed += 1

    return passed / total


# ------------------------------------------------------------------- accuracy and spend

def score_run(failures):
    correct = 0
    retrievals = 0
    for scenario in SCENARIOS:
        result, _ = play(scenario)
        retrievals += result.get("retrievals", 0)
        answer = _norm(result.get("answer", ""))
        if answer == _norm(scenario["answer"]):
            correct += 1
        else:
            failures.append(
                f"answer: {scenario['id']}: expected {scenario['answer']!r}, got {result.get('answer')!r}"
            )
    return correct / len(SCENARIOS), retrievals / len(SCENARIOS)


def main():
    failures = []
    mmr = score_mmr(failures)
    control = score_control(failures)
    accuracy, spend = score_run(failures)

    print(f"metric mmr_cases_passed {mmr:.4f}")
    print(f"metric loop_cases_passed {control:.4f}")
    print(f"metric answer_accuracy {accuracy:.4f}")
    print(f"metric retrievals_per_query {spend:.4f}")

    if failures:
        print("\nwhat went wrong:", file=sys.stderr)
        for line in failures:
            print(f"  {line}", file=sys.stderr)


main()
