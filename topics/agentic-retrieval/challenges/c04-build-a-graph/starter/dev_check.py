"""Run a tiny two-node graph and print what run and resume did.

    python3 dev_check.py

This is a development harness, not the scored set. It builds the smallest
graph that has something to skip on resume: two nodes in a line, each
counting how many times it actually ran.
"""

import graph as g


def main():
    counts = {"a": 0, "b": 0}

    def node_a(state):
        counts["a"] += 1
        return {"visited": (state.get("visited") or []) + ["a"]}

    def node_b(state):
        counts["b"] += 1
        return {"visited": (state.get("visited") or []) + ["b"]}

    nodes = {"a": node_a, "b": node_b}
    edges = [(g.START, "a"), ("a", "b"), ("b", g.END)]

    try:
        built = g.build_graph(nodes, edges, {}, {})
        store = {}
        result = g.run(built, {}, store, "dev")
    except NotImplementedError as exc:
        print(f"not written yet: {exc}")
        return

    print(f"after run:    visited={result['values'].get('visited')}  counts={counts}")
    print(f"checkpoints:  {len(store['dev'])}")

    # store["dev"][1] is the checkpoint written right after "a" ran, so its
    # "next" names "b". Resuming from it should rerun "b" and leave "a" alone.
    checkpoint_after_a = store["dev"][1]["config"]["checkpoint_id"]
    resumed = g.resume(built, store, "dev", checkpoint_after_a)
    print(f"after resume: visited={resumed['values'].get('visited')}  counts={counts}")
    print(f"checkpoints:  {len(store['dev'])}")


main()
