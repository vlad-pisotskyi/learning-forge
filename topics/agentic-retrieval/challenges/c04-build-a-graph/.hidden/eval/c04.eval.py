"""Held-out evaluation set for c04. The Judge runs this; nobody else reads it.

Every graph below is built from scratch in this file. Nothing is shared with any
sample the learner has seen, so a submission that special-cased a scenario it
was shown has been tuned to the wrong thing.

Four metrics.

  reducer_cases_passed    merge_messages, the default replace behaviour, and a
                           custom reducer, checked directly and through run
  routing_cases_passed    unconditional chains, a conditional branch, a
                           backward route, and build_graph's four refusals
  checkpoint_cases_passed the shape and count of what run writes to store, and
                           thread isolation
  resume_cases_passed     which nodes rerun and which do not, across ten
                           resume scenarios

Thresholds live in challenge.json and are compared by the CLI. This file prints
numbers.
"""

import sys
from pathlib import Path

# The learner's code is staged at "work" beside this challenge.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "work"))

START = "START"
END = "END"


# --------------------------------------------------------------------------- preflight

def load_entrypoint():
    """Import the four exports, or say precisely which one is missing."""
    try:
        import graph
    except ImportError as exc:
        raise SystemExit(
            "c04: could not import work/graph.py. The evaluation set imports the "
            f"module by name from the work tree, and the import raised: {exc}"
        )

    wanted = {
        "build_graph": "build_graph(nodes, edges, routes, reducers) -> dict",
        "merge_messages": "merge_messages(left, right) -> list[dict]",
        "run": "run(graph, state, store, thread_id) -> dict",
        "resume": "resume(graph, store, thread_id, checkpoint_id=None) -> dict",
    }
    missing = [
        f"  {name}: expected {sig}"
        for name, sig in wanted.items()
        if not callable(getattr(graph, name, None))
    ]
    if missing:
        raise SystemExit(
            "c04: work/graph.py does not export every function the brief pins.\n"
            + "\n".join(missing)
        )
    return graph


def smoke_test(module):
    """Check the basic containers before scoring anything against them."""
    calls = {"a": 0}

    def node_a(state):
        calls["a"] += 1
        return {"seen": True}

    try:
        built = module.build_graph(
            {"a": node_a}, [(START, "a"), ("a", END)], {}, {}
        )
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"c04: build_graph raised on a well-formed graph: {exc!r}")
    if not isinstance(built, dict):
        raise SystemExit(f"c04: build_graph has to return a dict, not {built!r}")

    store = {}
    result = module.run(built, {}, store, "smoke")
    if not isinstance(result, dict) or "values" not in result or "next" not in result:
        raise SystemExit(
            f"c04: run has to return a checkpoint dict with at least 'values' and "
            f"'next'. It returned {result!r}."
        )
    if "smoke" not in store or not isinstance(store["smoke"], list) or not store["smoke"]:
        raise SystemExit(
            "c04: run has to write at least one checkpoint into store[thread_id]."
        )
    if calls["a"] != 1:
        raise SystemExit(f"c04: expected node 'a' to run once, it ran {calls['a']} times.")

    merged = module.merge_messages([], [{"id": "m1", "text": "hi"}])
    if not isinstance(merged, list) or merged != [{"id": "m1", "text": "hi"}]:
        raise SystemExit(f"c04: merge_messages on an empty left case returned {merged!r}")

    resumed = module.resume(built, store, "smoke", store["smoke"][0]["config"]["checkpoint_id"])
    if not isinstance(resumed, dict) or "values" not in resumed:
        raise SystemExit(f"c04: resume has to return a checkpoint dict, got {resumed!r}")


GRAPH = load_entrypoint()
smoke_test(GRAPH)
build_graph = GRAPH.build_graph
merge_messages = GRAPH.merge_messages
run = GRAPH.run
resume = GRAPH.resume


# --------------------------------------------------------------------------- reducers

def concat_reducer(left, right):
    return (left or []) + right


def sum_reducer(left, right):
    return (left or 0) + right


def score_reducers(failures):
    total = 0
    passed = 0

    def check(name, got, expected):
        nonlocal total, passed
        total += 1
        if got == expected:
            passed += 1
        else:
            failures.append(f"reducer: {name}: expected {expected!r}, got {got!r}")

    # merge_messages, called directly.
    check(
        "append into an empty list",
        merge_messages([], [{"id": "m1", "text": "hi"}]),
        [{"id": "m1", "text": "hi"}],
    )
    check(
        "replace in place, not at the end",
        merge_messages(
            [{"id": "m1", "text": "a"}, {"id": "m2", "text": "b"}],
            [{"id": "m1", "text": "a revised"}],
        ),
        [{"id": "m1", "text": "a revised"}, {"id": "m2", "text": "b"}],
    )
    check(
        "a new id is appended after an existing one is revised",
        merge_messages(
            [{"id": "m1", "text": "a"}, {"id": "m2", "text": "b"}],
            [{"id": "m1", "text": "a revised"}, {"id": "m3", "text": "c"}],
        ),
        [{"id": "m1", "text": "a revised"}, {"id": "m2", "text": "b"}, {"id": "m3", "text": "c"}],
    )
    check(
        "a message with no id is always appended",
        merge_messages([{"id": "m1", "text": "a"}], [{"text": "no id at all"}]),
        [{"id": "m1", "text": "a"}, {"text": "no id at all"}],
    )
    check("both sides empty", merge_messages([], []), [])
    check(
        "left missing entirely reads as empty",
        merge_messages(None, [{"id": "m1", "text": "a"}]),
        [{"id": "m1", "text": "a"}],
    )

    # The default reducer, exercised through run: last write wins.
    def node_first(state):
        return {"count": 1}

    def node_second(state):
        return {"count": 2}

    graph = build_graph(
        {"first": node_first, "second": node_second},
        [(START, "first"), ("first", "second"), ("second", END)],
        {},
        {},
    )
    result = run(graph, {}, {}, "default-reducer")
    check("no reducer means the second write replaces the first", result["values"].get("count"), 2)

    # A custom reducer accumulates instead.
    graph = build_graph(
        {"first": node_first, "second": node_second},
        [(START, "first"), ("first", "second"), ("second", END)],
        {},
        {"count": sum_reducer},
    )
    result = run(graph, {}, {}, "custom-reducer")
    check("a sum reducer accumulates both writes", result["values"].get("count"), 3)

    # merge_messages plugged in as a reducer, end to end.
    def node_greet(state):
        return {"messages": [{"id": "m1", "text": "hello"}]}

    def node_revise(state):
        return {"messages": [{"id": "m1", "text": "hello, revised"}, {"id": "m2", "text": "and this"}]}

    graph = build_graph(
        {"greet": node_greet, "revise": node_revise},
        [(START, "greet"), ("greet", "revise"), ("revise", END)],
        {},
        {"messages": merge_messages},
    )
    result = run(graph, {}, {}, "messages-reducer")
    check(
        "merge_messages used as a reducer merges across two nodes",
        result["values"].get("messages"),
        [{"id": "m1", "text": "hello, revised"}, {"id": "m2", "text": "and this"}],
    )

    # A key no node ever writes keeps its initial value.
    def node_noop(state):
        return {"touched": True}

    graph = build_graph({"noop": node_noop}, [(START, "noop"), ("noop", END)], {}, {})
    result = run(graph, {"query": "untouched"}, {}, "untouched-key")
    check("a key no node writes keeps its initial value", result["values"].get("query"), "untouched")

    return passed / total if total else 1.0


# --------------------------------------------------------------------------- routing

def score_routing(failures):
    total = 0
    passed = 0

    def check(name, condition):
        nonlocal total, passed
        total += 1
        if condition:
            passed += 1
        else:
            failures.append(f"routing: {name}: condition failed")

    def check_raises(name, fn):
        nonlocal total, passed
        total += 1
        try:
            fn()
        except Exception:  # noqa: BLE001
            passed += 1
        else:
            failures.append(f"routing: {name}: expected an exception, none was raised")

    # An unconditional chain of three.
    order = []

    def make_tracker(name):
        def node(state):
            order.append(name)
            return {"path": (state.get("path") or []) + [name]}
        return node

    graph = build_graph(
        {"a": make_tracker("a"), "b": make_tracker("b"), "c": make_tracker("c")},
        [(START, "a"), ("a", "b"), ("b", "c"), ("c", END)],
        {},
        {},
    )
    result = run(graph, {}, {}, "chain")
    check("an unconditional chain runs in edge order", order == ["a", "b", "c"])
    check("the chain's final state reflects every node", result["values"].get("path") == ["a", "b", "c"])

    # A conditional branch, both directions.
    def make_branch_nodes():
        calls = {"a": 0, "b": 0, "c": 0}

        def node_a(state):
            calls["a"] += 1
            return {}

        def node_b(state):
            calls["b"] += 1
            return {"reached": "b"}

        def node_c(state):
            calls["c"] += 1
            return {"reached": "c"}

        def route(state):
            return "b" if state.get("flag") else "c"

        graph = build_graph(
            {"a": node_a, "b": node_b, "c": node_c},
            [(START, "a"), ("b", END), ("c", END)],
            {"a": route},
            {},
        )
        return graph, calls

    graph, calls = make_branch_nodes()
    result = run(graph, {"flag": True}, {}, "branch-true")
    check("the true branch reaches b", result["values"].get("reached") == "b")
    check("the true branch never calls c", calls["c"] == 0)

    graph, calls = make_branch_nodes()
    result = run(graph, {"flag": False}, {}, "branch-false")
    check("the false branch reaches c", result["values"].get("reached") == "c")
    check("the false branch never calls b", calls["b"] == 0)

    # A routing function that sends control backwards.
    loop_calls = {"a": 0}

    def loop_node(state):
        loop_calls["a"] += 1
        return {"n": state.get("n", 0) + 1}

    def loop_route(state):
        return "a" if state["n"] < 3 else END

    graph = build_graph({"a": loop_node}, [(START, "a")], {"a": loop_route}, {})
    result = run(graph, {}, {}, "loop-back")
    check("a backward route runs the node until its own condition clears", loop_calls["a"] == 3)
    check("the loop's final state reflects every pass", result["values"].get("n") == 3)

    # build_graph refusing a malformed graph, four ways.
    def bad_unknown_source():
        build_graph({"a": lambda s: {}}, [(START, "a"), ("missing", "a")], {}, {})

    def bad_unknown_destination():
        build_graph({"a": lambda s: {}}, [(START, "a"), ("a", "missing")], {}, {})

    def bad_no_start():
        build_graph({"a": lambda s: {}}, [("a", END)], {}, {})

    def bad_edge_and_route():
        build_graph(
            {"a": lambda s: {}, "b": lambda s: {}},
            [(START, "a"), ("a", "b"), ("b", END)],
            {"a": lambda s: "b"},
            {},
        )

    def bad_two_edges_one_source():
        build_graph(
            {"a": lambda s: {}, "b": lambda s: {}, "c": lambda s: {}},
            [(START, "a"), ("a", "b"), ("a", "c")],
            {},
            {},
        )

    check_raises("an edge naming an unknown source is refused", bad_unknown_source)
    check_raises("an edge naming an unknown destination is refused", bad_unknown_destination)
    check_raises("a graph with no edge leaving START is refused", bad_no_start)
    check_raises("a node wired by both an edge and a route is refused", bad_edge_and_route)
    check_raises("two unconditional edges leaving one source is refused", bad_two_edges_one_source)

    # A routing function that names a node the graph does not have.
    def bad_route_destination():
        graph = build_graph({"a": lambda s: {}}, [(START, "a")], {"a": lambda s: "nowhere"}, {})
        run(graph, {}, {}, "bad-destination")

    check_raises("a route naming an unknown node fails at run time", bad_route_destination)

    return passed / total if total else 1.0


# --------------------------------------------------------------------------- checkpoints

def score_checkpoints(failures):
    total = 0
    passed = 0

    def check(name, condition):
        nonlocal total, passed
        total += 1
        if condition:
            passed += 1
        else:
            failures.append(f"checkpoint: {name}: condition failed")

    def make_tracker(name):
        def node(state):
            return {"visited": (state.get("visited") or []) + [name]}
        return node

    graph = build_graph(
        {"a": make_tracker("a"), "b": make_tracker("b"), "c": make_tracker("c")},
        [(START, "a"), ("a", "b"), ("b", "c"), ("c", END)],
        {},
        {},
    )

    store = {}
    result = run(graph, {"seed": "x"}, store, "cp")
    thread = store.get("cp") or []

    check("three nodes in a line produce four checkpoints", len(thread) == 4)
    if len(thread) == 4:
        check("checkpoint 0 is the input source", thread[0]["metadata"].get("source") == "input")
        check("checkpoint 0's values are exactly the initial state", thread[0]["values"] == {"seed": "x"})
        check("checkpoint 0's writes are empty", thread[0]["metadata"].get("writes") == {})
        check("checkpoint 0's next names the first node", thread[0]["next"] == ["a"])
        check(
            "checkpoints after the input are the loop source",
            all(c["metadata"].get("source") == "loop" for c in thread[1:]),
        )
        check(
            "step increases by one at every checkpoint",
            [c["metadata"].get("step") for c in thread] == [0, 1, 2, 3],
        )
        check("checkpoint 1's writes name node a and its partial", thread[1]["metadata"].get("writes") == {"a": {"visited": ["a"]}})
        check("checkpoint 1's next names node b", thread[1]["next"] == ["b"])
        check("the last checkpoint's next is empty", thread[3]["next"] == [])
        check(
            "checkpoint ids are the string of their position",
            [c["config"]["checkpoint_id"] for c in thread] == ["0", "1", "2", "3"],
        )
        check(
            "every checkpoint's config names the thread",
            all(c["config"].get("thread_id") == "cp" for c in thread),
        )

    check("run returns the last checkpoint it wrote", result == thread[-1] if thread else False)

    # Two threads in one store do not see each other's state.
    graph2 = build_graph({"a": make_tracker("a")}, [(START, "a"), ("a", END)], {}, {})
    store2 = {}
    run(graph2, {"who": "one"}, store2, "t1")
    run(graph2, {"who": "two"}, store2, "t2")
    check("thread t1 keeps its own initial state", store2["t1"][0]["values"].get("who") == "one")
    check("thread t2 keeps its own initial state", store2["t2"][0]["values"].get("who") == "two")
    check("the two threads have independent checkpoint lists", store2["t1"] is not store2["t2"])

    # Running the same thread again replaces rather than appends.
    store3 = {}
    run(graph2, {"who": "first run"}, store3, "reused")
    run(graph2, {"who": "second run"}, store3, "reused")
    check("a second run on the same thread does not double the checkpoints", len(store3["reused"]) == 2)
    check(
        "a second run on the same thread replaces the first run's input",
        store3["reused"][0]["values"].get("who") == "second run",
    )

    return passed / total if total else 1.0


# --------------------------------------------------------------------------- resume

def score_resume(failures):
    total = 0
    passed = 0

    def check(name, condition):
        nonlocal total, passed
        total += 1
        if condition:
            passed += 1
        else:
            failures.append(f"resume: {name}: condition failed")

    def check_raises(name, fn):
        nonlocal total, passed
        total += 1
        try:
            fn()
        except Exception:  # noqa: BLE001
            passed += 1
        else:
            failures.append(f"resume: {name}: expected an exception, none was raised")

    def build_linear(counts):
        def make(name):
            def node(state):
                counts[name] = counts.get(name, 0) + 1
                return {"visited": (state.get("visited") or []) + [name]}
            return node

        return build_graph(
            {"a": make("a"), "b": make("b"), "c": make("c")},
            [(START, "a"), ("a", "b"), ("b", "c"), ("c", END)],
            {},
            {},
        )

    # 1. Resume mid-run: only the nodes after the checkpoint rerun.
    counts = {}
    graph = build_linear(counts)
    store = {}
    run(graph, {}, store, "mid")
    checkpoint_after_a = store["mid"][1]["config"]["checkpoint_id"]
    resumed = resume(graph, store, "mid", checkpoint_after_a)
    check("resuming after a leaves a's own count untouched", counts.get("a") == 1)
    check("resuming after a reruns b", counts.get("b") == 2)
    check("resuming after a reruns c", counts.get("c") == 2)
    check(
        "resuming after a appends exactly two new checkpoints",
        len(store["mid"]) == 6,
    )
    check(
        "the resumed values match what a fresh run reaches",
        resumed["values"].get("visited") == ["a", "b", "c"],
    )

    # 2. Resuming a finished thread with checkpoint_id=None does nothing.
    counts = {}
    graph = build_linear(counts)
    store = {}
    run(graph, {}, store, "done")
    before = len(store["done"])
    resumed = resume(graph, store, "done", None)
    check("resuming a finished thread does not rerun any node", counts == {"a": 1, "b": 1, "c": 1})
    check("resuming a finished thread writes no new checkpoint", len(store["done"]) == before)
    check("resuming a finished thread returns the last checkpoint", resumed["next"] == [])

    # 3. Resuming from the input checkpoint reruns everything.
    counts = {}
    graph = build_linear(counts)
    store = {}
    run(graph, {}, store, "from-start")
    input_id = store["from-start"][0]["config"]["checkpoint_id"]
    resume(graph, store, "from-start", input_id)
    check("resuming from the input checkpoint reruns every node", counts == {"a": 2, "b": 2, "c": 2})
    check("resuming from the input checkpoint appends three checkpoints", len(store["from-start"]) == 7)

    # 4. Earlier checkpoints are untouched by a later resume.
    counts = {}
    graph = build_linear(counts)
    store = {}
    run(graph, {}, store, "immutable")
    before_checkpoints = [dict(c) for c in store["immutable"][:2]]
    checkpoint_after_a = store["immutable"][1]["config"]["checkpoint_id"]
    resume(graph, store, "immutable", checkpoint_after_a)
    check(
        "checkpoints before the resume point are unchanged afterward",
        store["immutable"][0] == before_checkpoints[0] and store["immutable"][1] == before_checkpoints[1],
    )

    # 5. An unknown thread is an error.
    graph = build_linear({})
    check_raises("resuming an unknown thread raises", lambda: resume(graph, {}, "never-ran", None))

    # 6. An unknown checkpoint id on a known thread is an error.
    counts = {}
    graph = build_linear(counts)
    store = {}
    run(graph, {}, store, "known-thread")
    check_raises(
        "resuming an unknown checkpoint id raises",
        lambda: resume(graph, store, "known-thread", "not-a-real-id"),
    )

    # 7. A routing decision is re-evaluated on resume, using the resumed state.
    branch_calls = {"b": 0, "c": 0}

    def route_node(state):
        return {}

    def branch_b(state):
        branch_calls["b"] += 1
        return {"reached": "b"}

    def branch_c(state):
        branch_calls["c"] += 1
        return {"reached": "c"}

    def route(state):
        return "b" if state.get("flag") else "c"

    graph = build_graph(
        {"a": route_node, "b": branch_b, "c": branch_c},
        [(START, "a"), ("b", END), ("c", END)],
        {"a": route},
        {},
    )
    store = {}
    run(graph, {"flag": True}, store, "branch-resume")
    checkpoint_after_a = store["branch-resume"][1]["config"]["checkpoint_id"]
    resumed = resume(graph, store, "branch-resume", checkpoint_after_a)
    check("resuming after a routing node retakes the same branch", resumed["values"].get("reached") == "b")
    check("resuming after a routing node never calls the other branch", branch_calls["c"] == 0)

    # 8. Resuming one thread never touches another thread in the same store.
    counts_x = {}
    counts_y = {}
    graph_x = build_linear(counts_x)
    graph_y = build_linear(counts_y)
    store = {}
    run(graph_x, {}, store, "x")
    run(graph_y, {}, store, "y")
    checkpoint_x = store["x"][1]["config"]["checkpoint_id"]
    resume(graph_x, store, "x", checkpoint_x)
    check("resuming thread x leaves thread y's checkpoints alone", len(store["y"]) == 4)
    check("resuming thread x leaves thread y's node counts alone", counts_y == {"a": 1, "b": 1, "c": 1})

    # 9. Two resumes from the same checkpoint id are two independent replays.
    counts = {}
    graph = build_linear(counts)
    store = {}
    run(graph, {}, store, "repeat")
    checkpoint_after_a = store["repeat"][1]["config"]["checkpoint_id"]
    resume(graph, store, "repeat", checkpoint_after_a)
    resume(graph, store, "repeat", checkpoint_after_a)
    check("resuming the same checkpoint twice reruns b and c both times", counts.get("b") == 3 and counts.get("c") == 3)
    check("resuming the same checkpoint twice appends both times", len(store["repeat"]) == 8)

    # 10. A reducer's accumulated value carries across the resume boundary.
    def node_first(state):
        return {"messages": [{"id": "m1", "text": "first"}]}

    def node_second(state):
        return {"messages": [{"id": "m2", "text": "second"}]}

    graph = build_graph(
        {"first": node_first, "second": node_second},
        [(START, "first"), ("first", "second"), ("second", END)],
        {},
        {"messages": merge_messages},
    )
    store = {}
    run(graph, {}, store, "reducer-resume")
    checkpoint_after_first = store["reducer-resume"][1]["config"]["checkpoint_id"]
    resumed = resume(graph, store, "reducer-resume", checkpoint_after_first)
    check(
        "a resumed node's write merges with what the checkpoint already held",
        resumed["values"].get("messages") == [{"id": "m1", "text": "first"}, {"id": "m2", "text": "second"}],
    )

    return passed / total if total else 1.0


def main():
    failures = []
    reducer_score = score_reducers(failures)
    routing_score = score_routing(failures)
    checkpoint_score = score_checkpoints(failures)
    resume_score = score_resume(failures)

    print(f"metric reducer_cases_passed {reducer_score:.4f}")
    print(f"metric routing_cases_passed {routing_score:.4f}")
    print(f"metric checkpoint_cases_passed {checkpoint_score:.4f}")
    print(f"metric resume_cases_passed {resume_score:.4f}")

    if failures:
        print("\nwhat went wrong:", file=sys.stderr)
        for line in failures:
            print(f"  {line}", file=sys.stderr)


main()
