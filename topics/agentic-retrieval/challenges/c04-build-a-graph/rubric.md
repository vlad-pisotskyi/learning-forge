# Rubric: build a graph that can be resumed

The four metrics decide whether the executor works. This decides whether the
reasoning behind it holds up, and whether the shape it leaves in `store` is
something a caller could actually build on. Weights sum to 100.

## the wiring contract build_graph enforces (25)

Full credit treats a node's outgoing wiring as one thing, never two: an
unconditional edge or a routing function, and `build_graph` refuses a node
that carries both rather than silently preferring one. It refuses an edge or
a route naming a node that was never passed in `nodes`, refuses more than one
unconditional edge leaving the same source, and refuses a graph with nothing
leaving `"START"`. All four checks happen inside `build_graph`, before `run`
or `resume` is ever called, so a malformed graph fails at the point it was
built rather than partway through a run.

Points come off for a validation check performed lazily at run time instead of
at build time, for a check that only catches one of the four cases, and for
treating `"START"` or `"END"` as ordinary node names that could collide with
something in `nodes`.

## reducers, and the default that is not accumulation (20)

Full credit applies the reducer signature in the order chapter eleven pins,
left as the stored value and right as the node's update, and falls back to
replacement, not accumulation, for any key with no reducer of its own.
`merge_messages` matches an update to an existing entry by id and replaces it
in place rather than at the end of the list, appends anything with a new id or
no id, and treats a missing left list as empty rather than raising. The
submission can state, in a comment or in how the code is organised, that
`merge_messages` is an ordinary reducer and nothing about it depends on being
wired to any particular key.

Points come off for a hand-rolled accumulation applied to every key regardless
of whether a reducer was given for it, for `merge_messages` appending a
revised message instead of replacing it in place, and for a reducer call whose
arguments are in the wrong order.

## the checkpoint run writes (20)

Full credit writes exactly the four-key checkpoint shape the brief pins,
including a checkpoint for the input itself before any node has run, with an
empty `writes` and a `next` naming the first node. Every node execution after
that writes one more checkpoint, `step` and `checkpoint_id` track the
thread's own position rather than any global counter, and `next` is `[]`
exactly when the graph has reached `"END"`. Two thread ids passed to the same
`store` dict never read or write each other's checkpoints. Calling `run` twice
on one thread id replaces what was there rather than appending to it.

Points come off for a checkpoint missing one of the four keys, for a `step` or
`checkpoint_id` that resets or drifts across a second `run` on the same
thread, and for state leaking between two thread ids because the store's
per-thread lists were not kept properly separate.

## resume, and what replay actually skips (25)

Full credit starts execution at the node named in the resumed checkpoint's
`next`, never re-running anything the checkpoint's `values` already reflects,
and a checkpoint whose `next` is empty is a no-op: nothing runs, nothing new
is written. New checkpoints are appended after whatever the thread already
held, and a checkpoint earlier in that history is never mutated by a later
resume, including one that resumes from a point before it. Resuming with
`checkpoint_id=None` reaches the newest checkpoint on the thread. An unknown
thread id and an unknown checkpoint id both raise rather than returning
something that looks like a valid result.

Points come off for a resume that re-runs a node the checkpoint had already
recorded, for one that mutates or truncates checkpoints after the resume
point instead of appending past them, and for silently returning an empty or
default result on an unknown thread or checkpoint id instead of raising.

## code a caller can trust (10)

Full credit keeps the state dict passed to a node, and the `values` written
into a checkpoint, free of aliasing that would let a later mutation reach back
into an earlier checkpoint: each checkpoint's `values` is its own dict, not a
reference shared with the live state the executor keeps mutating. Names and
structure make the four functions readable on their own, and a reader can
tell from the code, not just from a passing score, why a routing function is
called after a node's update is merged rather than before.

Points come off for a checkpoint whose `values` is the same object as a later
one, so that mutating one after the fact mutates both, and for logic that only
works because a caller happens to pass a graph shaped exactly like the
starter's sample.
