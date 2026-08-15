"""Reference implementation for c04.

A minimal graph executor in the shape chapters eleven and twelve describe: nodes
that return a partial state update, edges and routing functions that decide what
runs next, reducers that decide how a partial update is folded into the stored
state, and a checkpoint written at every super-step boundary so a run can be
resumed from any point in its own history rather than only from the start.

`forge eval --reference` stages this file at work/graph.py and runs the held-out
set against it, which is what makes "the challenge is solvable inside this
interface" a fact rather than a claim.
"""

# Two reserved names. "START" as an edge's source names the first node to run.
# "END" as an edge's destination, or a routing function's return value, ends the
# graph. Neither is ever a key in `nodes`.
START = "START"
END = "END"

# A defensive cap, not a scored behaviour. A routing function that never reaches
# END would otherwise spin forever; nothing in the held-out set relies on this
# particular number, and the number is generous enough that no legitimate graph
# in this challenge comes near it.
MAX_SUPER_STEPS = 500


def build_graph(nodes: dict, edges: list, routes: dict, reducers: dict) -> dict:
    """Assemble a runnable graph, and catch a graph built out of shape before
    run or resume ever sees it.

    The wiring rules mirror chapter eleven's split between a node, which never
    names its own successor, and the edges and routing functions that do. A
    node's outgoing wiring is one or the other: an unconditional edge, or a
    routing function called once that node has produced its update. Never both,
    because two answers to "what runs next" is not a graph, it is an ambiguity.
    """
    node_names = set(nodes)
    edge_by_source: dict = {}

    for source, destination in edges:
        if source != START and source not in node_names:
            raise ValueError(f"build_graph: an edge names an unknown source node: {source!r}")
        if destination != END and destination not in node_names:
            raise ValueError(
                f"build_graph: an edge names an unknown destination node: {destination!r}"
            )
        if source in edge_by_source:
            raise ValueError(
                f"build_graph: more than one unconditional edge leaves {source!r}"
            )
        edge_by_source[source] = destination

    for source in routes:
        if source not in node_names:
            raise ValueError(f"build_graph: a route names an unknown source node: {source!r}")
        if source in edge_by_source:
            raise ValueError(
                f"build_graph: {source!r} has both an unconditional edge and a route; "
                "a node's outgoing wiring is one or the other"
            )

    if START not in edge_by_source:
        raise ValueError(f"build_graph: the graph needs exactly one edge leaving {START!r}")

    return {
        "nodes": dict(nodes),
        "edges": edge_by_source,
        "routes": dict(routes),
        "reducers": dict(reducers),
    }


def merge_messages(left: list, right: list) -> list:
    """A reducer over lists of message dicts, keyed by "id".

    A message in `right` whose id already appears in `left` replaces the entry
    at that position, so a revision lands where the original message was rather
    than at the end of the transcript. A message whose id is new, or which
    carries no id at all, is appended. `left` missing entirely means nothing has
    been written to that key yet, which is treated as an empty list rather than
    an error, since a reducer's left argument is exactly the channel's default
    before any node has written to it.
    """
    if left is None:
        left = []
    result = [dict(message) for message in left]
    index_by_id = {
        message["id"]: position
        for position, message in enumerate(result)
        if "id" in message
    }
    for message in right:
        message_id = message.get("id")
        if message_id is not None and message_id in index_by_id:
            result[index_by_id[message_id]] = dict(message)
        else:
            result.append(dict(message))
            if message_id is not None:
                index_by_id[message_id] = len(result) - 1
    return result


def _merge_state(values: dict, partial: dict, reducers: dict) -> dict:
    """Fold one node's partial update into the accumulated state, key by key.

    A key with no reducer falls back to the default chapter eleven names: the
    stored value is replaced by whatever the update carries. Nothing accumulates
    unless a reducer was written for it.
    """
    merged = dict(values)
    for key, right in partial.items():
        reducer = reducers.get(key)
        merged[key] = right if reducer is None else reducer(values.get(key), right)
    return merged


def _next_after(graph: dict, node_name: str, values: dict) -> str:
    """Ask the edge or the route what runs after `node_name`, now that its
    update has been merged into `values`."""
    if node_name in graph["routes"]:
        destination = graph["routes"][node_name](values)
    else:
        destination = graph["edges"].get(node_name)
        if destination is None:
            raise RuntimeError(f"{node_name!r} has no outgoing edge or route")
    if destination != END and destination not in graph["nodes"]:
        raise RuntimeError(f"routing produced a node the graph does not have: {destination!r}")
    return destination


def _write_checkpoint(store: dict, thread_id: str, values: dict, next_node, source: str, writes: dict) -> dict:
    """Append one checkpoint to `store[thread_id]`.

    A checkpoint's id is its position in that list, as a string, and the count
    only grows, across both run and resume: it is what makes "unique and
    monotonically increasing" true without a clock.
    """
    thread = store.setdefault(thread_id, [])
    checkpoint_id = str(len(thread))
    checkpoint = {
        "values": dict(values),
        "next": [] if next_node == END else [next_node],
        "config": {"thread_id": thread_id, "checkpoint_id": checkpoint_id},
        "metadata": {"source": source, "step": len(thread), "writes": dict(writes)},
    }
    thread.append(checkpoint)
    return checkpoint


def _advance(graph: dict, store: dict, thread_id: str, values: dict, current: str) -> dict:
    """Run `current` and every node after it until the graph reaches END,
    writing one checkpoint per super-step. Shared by run (which starts this
    walk at the node past START) and resume (which starts it at the node past
    whatever checkpoint it was handed)."""
    checkpoint = None
    steps = 0
    while current != END:
        steps += 1
        if steps > MAX_SUPER_STEPS:
            raise RuntimeError(
                f"exceeded {MAX_SUPER_STEPS} super-steps without reaching {END!r}"
            )
        node = graph["nodes"][current]
        partial = node(values)
        values = _merge_state(values, partial, graph["reducers"])
        following = _next_after(graph, current, values)
        checkpoint = _write_checkpoint(
            store, thread_id, values, following, "loop", {current: partial}
        )
        current = following
    return checkpoint


def run(graph: dict, state: dict, store: dict, thread_id: str) -> dict:
    """Run the graph to completion from `state`, on a fresh thread.

    `run` starts a thread over rather than continuing one: whatever `store`
    already held for `thread_id` is replaced. Continuing an existing thread is
    what `resume` is for.
    """
    store[thread_id] = []
    values = dict(state)
    first_node = graph["edges"][START]
    input_checkpoint = _write_checkpoint(store, thread_id, values, first_node, "input", {})
    if first_node == END:
        return input_checkpoint
    return _advance(graph, store, thread_id, values, first_node)


def resume(graph: dict, store: dict, thread_id: str, checkpoint_id: str | None = None) -> dict:
    """Continue a run from a checkpoint already in `store`, re-executing only
    the node or nodes named in that checkpoint's "next", and whatever runs
    after them.

    `checkpoint_id` names the checkpoint directly, or, when it is None, the
    newest one recorded for the thread. Everything the checkpoint's `values`
    already reflects is not recomputed. Whatever this call writes is appended
    to `store[thread_id]`; nothing already there, including checkpoints later
    than the one resumed from, is removed or rewritten. Two resumes from the
    same checkpoint id are two independent replays.
    """
    thread = store.get(thread_id)
    if not thread:
        raise ValueError(f"resume: no checkpoints recorded for thread {thread_id!r}")

    if checkpoint_id is None:
        checkpoint = thread[-1]
    else:
        checkpoint = next(
            (c for c in thread if c["config"]["checkpoint_id"] == checkpoint_id), None
        )
        if checkpoint is None:
            raise ValueError(
                f"resume: no checkpoint {checkpoint_id!r} on thread {thread_id!r}"
            )

    pending = checkpoint["next"]
    if not pending:
        # Nothing left to do. Resuming a finished thread changes nothing and
        # writes nothing.
        return checkpoint

    values = dict(checkpoint["values"])
    return _advance(graph, store, thread_id, values, pending[0])
