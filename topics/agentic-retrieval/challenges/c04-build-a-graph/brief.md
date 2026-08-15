# Build a graph that can be resumed

Chapter eleven gave state a schema and a set of reducers, and let a routing
function decide where control goes next. Chapter twelve made that graph
durable: a checkpoint at every step boundary, keyed by a thread id, with resume
re-running only what comes after the checkpoint it started from. Build the
executor that makes both of those things true, in `work/graph.py`, without
installing the framework that motivated them.

```python
build_graph(nodes: dict, edges: list[tuple[str, str]], routes: dict, reducers: dict) -> dict
merge_messages(left: list[dict], right: list[dict]) -> list[dict]
run(graph: dict, state: dict, store: dict, thread_id: str) -> dict
resume(graph: dict, store: dict, thread_id: str, checkpoint_id: str | None = None) -> dict
```

Python 3, standard library only.

## nodes, edges, and the two reserved names

A node is a plain callable, `state: dict -> dict`, returning a partial update
rather than the whole state, the same split chapter eleven draws. `nodes` hands
`build_graph` a dict from node name to that callable. You never write a node
body yourself: every node in this challenge is handed to you by whatever calls
`build_graph`.

`edges` is the unconditional wiring: a list of `(source, destination)` pairs,
each naming the node that always runs after `source` finishes. `routes` is the
conditional wiring: a dict from a node name to a routing function,
`state: dict -> str`, called once that node has produced its update and been
merged into the state, returning the name of whichever node runs next.

Two names are reserved and never appear in `nodes`. `"START"` as an edge's
source names the first node the graph runs. `"END"` as an edge's destination,
or a routing function's return value, ends the graph. A node's outgoing wiring
is one or the other, an edge or a route, never both, and a graph needs exactly
one edge leaving `"START"`. `build_graph` is where a graph built out of shape
gets caught: an edge or route naming a node that was never handed to it, a
node wired both ways, more than one unconditional edge leaving the same
source, or nothing leaving `"START"` at all. Raise on each of those before
`run` or `resume` ever sees the graph.

## reducers, and merge_messages

`reducers` is a dict from a state key to a binary function, `(left, right) ->
value`, in the order chapter eleven pins: left is the value already stored,
right is the value the node's partial update carried for that key. A key with
no reducer in the dict falls back to the default chapter eleven describes: the
stored value is replaced by the update, whatever the update is. Nothing
accumulates unless a reducer was written for it.

`merge_messages` is one reducer, worth writing as its own function because
chapter eleven names it directly. It merges two lists of message dicts, keyed
by `"id"`. A message in `right` whose id already appears in `left` replaces
the entry at that position, so a revision lands where the original message
was rather than at the end of the transcript. A message whose id is new, or
which carries no id at all, is appended. A missing left list is treated as
empty, since a reducer's left argument is exactly the channel's default before
anything has written to it. Nothing about `merge_messages` is specific to any
one graph: it is a plain reducer, and it can sit in a `reducers` dict as
`{"messages": merge_messages}` like any other.

## running the graph, and the checkpoint it leaves

`run` starts a thread over. Whatever `store` already held for `thread_id` is
replaced, not appended to, because `run` is the function that starts a run
from scratch, not the one that continues an existing one. It takes `state` as
the graph's first values, follows the edge leaving `"START"` to the first
node, and then repeats: call the node, merge its partial into the accumulated
values through the reducer for each key it touched, ask the edge or the route
for what runs next, and write a checkpoint. Chapter twelve's boundary is
exactly that: a checkpoint gets written once for the input and once after
every node.

A checkpoint is a dict with four keys, and this shape is not yours to
renegotiate, because `store` is read directly by whatever is grading you:

```python
{
    "values": dict,     # the merged state after this super-step
    "next": list[str],  # the node about to run, or [] once the graph is done
    "config": {"thread_id": str, "checkpoint_id": str},
    "metadata": {"source": "input" | "loop", "step": int, "writes": dict},
}
```

`checkpoint_id` is the checkpoint's position in `store[thread_id]`, written as
a string: the first checkpoint a thread ever gets is `"0"`, and the count only
grows, across both `run` and `resume`. `writes` on the input checkpoint is
empty; on every checkpoint after it, `writes` is `{node_name: partial}` for
whichever node just ran. `store[thread_id]` holds every checkpoint the thread
has, oldest first. `run` returns the last one it wrote.

## resuming, and what gets skipped

`resume` reads a checkpoint out of `store[thread_id]` rather than starting
over: the one named by `checkpoint_id`, or the newest one on that thread when
`checkpoint_id` is `None`. An unknown thread or an unknown checkpoint id is an
error. `resume`'s job is chapter twelve's replay rule, applied literally:
everything the checkpoint's `values` already reflects is not recomputed, and
only the node named in that checkpoint's `next`, and whatever runs after it,
executes again. A checkpoint whose `next` is already empty has nothing left to
do, and resuming it changes nothing and writes no new checkpoint.

What `resume` writes goes onto the end of `store[thread_id]`, after whatever
was already there. It does not delete or rewrite a checkpoint that already
exists, including ones later than the one it resumed from. Two resumes from
the same checkpoint id are two independent replays, each appending its own
checkpoints, because a checkpoint is a fixed point to replay from, not a place
execution can be told it already passed.

Because of that, a node written for this challenge has to survive running more
than once for the same super-step, chapter twelve's node-idempotency point.
Nothing in this challenge asks you to write a node, but every node the
held-out set hands you is written to that standard, and your executor is what
decides how many times one actually runs. A routing function that never
reaches `"END"` would loop forever; guarding against that is good practice,
but nothing here is scored on a particular limit.

## how it is scored

| metric | bar | what it covers |
|---|---|---|
| `reducer_cases_passed` | 1.0 | `merge_messages`, the default replace behaviour, and a custom reducer, exercised directly and through `run` |
| `routing_cases_passed` | 1.0 | unconditional chains, a conditional branch, a routing function sending control backwards, and the ways `build_graph` should refuse a malformed graph |
| `checkpoint_cases_passed` | 1.0 | the shape and count of what `run` writes to `store`, and that two threads in one store never see each other's state |
| `resume_cases_passed` | 0.9 or better | which nodes rerun and which do not, across a mid-run resume, a resume from the very first checkpoint, a resume of a finished thread, and the error cases |

Nothing here is passable by getting the happy path right and skipping the
rest. `routing_cases_passed` and `checkpoint_cases_passed` sit at 1.0 because
each case in them has exactly one correct answer once the sections above are
read carefully: a graph is either shaped correctly or it is not, and a
checkpoint either has the fields this brief pins or it does not.
`resume_cases_passed` has a little more room, because getting most of a set of
resume scenarios right without missing the point of replay clears the bar;
getting the concept wrong loses more than one case at a time.
