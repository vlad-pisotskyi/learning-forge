"""Starter shell for c04. Copy this file into work/ and fill in the four
functions.

Two names are reserved and never appear in `nodes`: "START" as an edge's
source names the first node to run, and "END" as an edge's destination, or a
routing function's return value, ends the graph. See brief.md for the full
contract, in particular the exact shape of a checkpoint, since `store` is read
directly by whatever grades this.
"""

START = "START"
END = "END"


def build_graph(nodes: dict, edges: list, routes: dict, reducers: dict) -> dict:
    """Assemble a runnable graph, and catch a graph built out of shape before
    run or resume ever sees it.

    Raise on:
      - an edge or route naming a node that is not a key in `nodes`
      - a node wired by both an unconditional edge and a route
      - more than one unconditional edge leaving the same source
      - a graph with no edge leaving "START"
    """
    raise NotImplementedError("c04: build_graph is yours to write")


def merge_messages(left: list, right: list) -> list:
    """A reducer over lists of message dicts, keyed by "id".

    A message in `right` whose id already appears in `left` replaces that
    entry in place. A message with a new id, or with no id at all, is
    appended. A missing `left` is treated as an empty list.
    """
    raise NotImplementedError("c04: merge_messages is yours to write")


def run(graph: dict, state: dict, store: dict, thread_id: str) -> dict:
    """Run the graph to completion from `state`, on a fresh thread.

    Whatever `store` already held for `thread_id` is replaced, not appended
    to. Write a checkpoint at every super-step boundary: once for the input,
    then once after every node.
    """
    raise NotImplementedError("c04: run is yours to write")


def resume(graph: dict, store: dict, thread_id: str, checkpoint_id: str | None = None) -> dict:
    """Continue from a checkpoint already in `store`: the one named by
    `checkpoint_id`, or the newest one on that thread when `checkpoint_id` is
    None. Only the node named in that checkpoint's "next", and whatever runs
    after it, executes again. Whatever this writes is appended after what the
    thread already held.
    """
    raise NotImplementedError("c04: resume is yours to write")
