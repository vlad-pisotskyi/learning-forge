---
id: ch12
title: Checkpointed state, and runs that survive
order: 12
requires: [ch11]
teaches: [checkpoint, thread-identity, super-step, replay-and-resume, node-idempotency, interrupt-and-resume, durability-mode]
quiz: quizzes/ch12.quiz.json
estimatedMinutes: 35
status: draft
audit:
  faithfulness:
    verdict: fail
    at: 2026-08-15
    claims: 37
    supported: 36
    unsupported: 0
    overstated: 1
    contradicted: 0
    unreachable: 0
  critique:
    verdict: pass
    at: 2026-08-15
    notes: 0 blocking, 3 advisory
---

## The key that decides which state a run joins

A graph that finishes inside one process and then forgets everything is a function with extra ceremony. Persistence is what makes it something else: checkpointers allow LangGraph agents to persist their state within and across multiple interactions. {{S31.a}} Every concept in this chapter falls out of that one capability, including the ones that send you back to rewrite your own node bodies. The material here is pinned to langgraph 1.2.11 read on 2026-08-14, the same pin ch11 established.

The unit of persisted state is a thread. A thread is a unique identifier assigned to each checkpoint a checkpointer saves, it holds the accumulated state of a sequence of runs, and when a run executes, the state of the underlying graph is persisted to that thread. {{S30.a}} Both the documentation and the library source state the same rule about it, and they agree word for word on the mechanism: the checkpointer uses `thread_id` as the primary key for storing and retrieving checkpoints, and without it the checkpointer cannot save state or resume execution after an interrupt, because `thread_id` is what loads the saved state back. {{S30.b}} The class docstring on `BaseCheckpointSaver` repeats the primary key claim and names a third capability that disappears with it: without a `thread_id`, the checkpointer cannot save state, resume from interrupts, or enable time travel debugging. {{S31.b}}

Read "primary key" literally, because the consequence is a design decision you make on every invocation. The docstring gives the two patterns directly. For single shot workflows, use a unique id such as a uuid4 for each run, when executions are independent. For conversational memory, reuse the same `thread_id` across invocations so state such as chat history accumulates within the conversation. {{S31.c}} Whether your agent remembers the last conversation is not a feature you build. It is which string you put in that field.

## What a checkpoint holds

The state of a thread at a particular point in time is a checkpoint: a snapshot of the graph state saved at each super-step, represented by a `StateSnapshot` object. {{S30.c}} The checkpoint library's own `Checkpoint` type describes itself in the same terms, as a state snapshot at a given point in time. {{S31.d}}

You get two views of the same object, and they are useful for different things. The documentation's field table describes what you read back as a caller. `values` holds the state channel values at this checkpoint. {{S30.g}} `next` holds the node names to execute next, and an empty tuple means the graph is complete. {{S30.h}} `config` contains `thread_id`, `checkpoint_ns`, and `checkpoint_id`. {{S30.i}} `metadata` is execution metadata containing `source`, which is one of `input`, `loop`, or `update`, plus `writes`, which is the node outputs, and `step`, the super-step counter. {{S30.j}}

```
StateSnapshot
  values     state channel values at this checkpoint
  next       node names to execute next, () means complete
  config     thread_id, checkpoint_ns, checkpoint_id
  metadata   source, writes, step
```

That `config` triple is what makes an individual checkpoint addressable. The thread id on its own identifies the thread and loads its saved state {{S30.b}}, and the triple adds a namespace and a checkpoint id on top of it {{S30.i}}, which is exactly the handle replay needs in the next section but one.

The second view is the type a storage backend deals in. `Checkpoint` lives in the module that defines the base class for creating a graph checkpointer {{S31.a}}, and its fields are lower level. The checkpoint id is both unique and monotonically increasing, so it can sort checkpoints from first to last. {{S31.e}} `ts` is the timestamp of the checkpoint in ISO 8601 format. {{S31.f}} `channel_values` holds the values of the channels at the time of the checkpoint {{S31.g}}, which is the same content the documentation calls `values` {{S30.g}}. Then two maps that are not state at all: `channel_versions` holds the versions of the channels at the time of the checkpoint {{S31.h}}, and `versions_seen` maps a node id to a map from channel name to the version that node has seen {{S31.i}}.

Take the two views for what each is good for. The caller view tells you where the run is, because `next` is empty exactly when there is nothing left to do. {{S30.h}} The storage view tells you how a backend orders and reconstructs a thread without trusting a clock: the id sorts {{S31.e}}, the timestamp is for people reading the row {{S31.f}}, and the version maps are bookkeeping about the state rather than the state itself {{S31.h}} {{S31.i}}.

## The step boundary the runtime writes at

A checkpoint is written at each super-step boundary. A super-step is a single tick of the graph in which all nodes scheduled for that step execute, potentially in parallel, and for a sequential graph shaped `START -> A -> B -> END` there are separate super-steps for the input, node A, and node B, producing a checkpoint after each one. {{S30.d}} So the granularity is not per node call and not per run. It is per tick.

The documentation's worked example makes the count concrete. Run its two node graph once and there are exactly four checkpoints: an empty one with `START` as the next node, one holding the user input `{'foo': '', 'bar': []}` with `node_a` next, one holding `node_a`'s outputs `{'foo': 'a', 'bar': ['a']}` with `node_b` next, and one holding `node_b`'s outputs `{'foo': 'b', 'bar': ['a', 'b']}` with no next nodes. {{S30.f}} Two nodes, four checkpoints, because the input arrives as its own super-step. Predicting that number for a graph you wrote is the test of whether you understand the granularity.

Those quoted values also show ch11's reducers from the persistence side. Across the three writes `foo` goes from empty to `a` to `b` while `bar` goes from empty to `['a']` to `['a', 'b']`. {{S30.f}} One key is replaced on each write and the other accumulates, and the checkpoint records whatever the reducer produced rather than the raw node return.

Underneath the super-step there is a finer grain that matters when a step fans out. Writes from individual node executions within a super-step are also persisted, stored as tasks and used for fault tolerance, so that if another node in the same super-step fails, the successful node writes do not need to be recomputed when you resume. {{S30.e}} Three parallel retrievers, one of which throws, does not cost you the two that came back.

## Replay: exactly what is skipped and what runs again

Reading state requires the thread. You must specify a thread identifier, and `graph.get_state(config)` returns a `StateSnapshot` corresponding to the latest checkpoint associated with the thread id in that config. {{S30.k}}

Restarting is where the accounting gets specific, and the documentation is unusually blunt about it. Replay re-executes steps from a prior checkpoint. Invoke the graph with a prior `checkpoint_id` to re-run the nodes after that checkpoint. Nodes before the checkpoint are skipped, because their results are already saved. Nodes after the checkpoint re-execute, including any LLM calls, API requests, or interrupts, which are always re-triggered during replay. {{S30.l}}

Resuming is therefore not free, and the line between free and not free is the checkpoint boundary. Everything on the early side costs nothing to recover. Everything on the late side costs full price: the same tokens, the same third party requests, the same charges. A run that crashed nine nodes in and resumes from a checkpoint four nodes back pays for five nodes twice.

## Why your nodes now have to tolerate running twice

That last sentence is a bill in two currencies. The first is money and latency, and it is the one people notice. The second is correctness, and it lands in code you wrote: design node logic so that re-execution does not corrupt state, and if a node inserts a database row, running it twice should not create duplicate rows unless that is intentional. {{S29.j}}

This is a direct consequence of replay re-executing nodes after the checkpoint. {{S30.l}} A node body is not a thing that runs once. It is a thing that runs at least once, in the same sense as an at-least-once message consumer or an HTTP handler sitting behind a client that retries. If you have written either of those, you already know the shapes that survive it: derive an idempotency key from the state you were handed, upsert instead of insert, make the external call conditional on a check of the thing it would create. What changes with a checkpointer attached is not the technique but the expectation. Re-execution stops being an incident and becomes ordinary operation.

## Pausing inside a node and continuing from an answer

The third arrival of the same argument is the one designed for humans. `interrupt` interrupts the graph with a resumable exception from within a node, and it enables human in the loop workflows by pausing graph execution and surfacing a value to the client, where that value can communicate context or request the input required to resume. {{S34.a}} Mechanically, the first invocation of the function inside a given node raises a `GraphInterrupt` exception, halting execution, and the provided value travels with the exception to the client executing the graph. {{S34.b}}

Then the sentence that matters most and gets forgotten most: a client resuming the graph must use the `Command` primitive to specify a value for the interrupt and continue execution, and the graph resumes from the start of the node, re-executing all logic. {{S34.c}} Not from the line after the `interrupt` call. From the top of the node. Anything the node did before it paused, it does again.

The prerequisite is the subject of this whole chapter. To use an `interrupt`, you must enable a checkpointer, because the feature relies on persisting the graph state. {{S34.d}} With no checkpointer there is no saved state for a resumed run to rejoin, and without a `thread_id` there is nothing to resume from after an interrupt either. {{S30.b}}

Sections four, five, and six are one argument arriving three times. Replay re-runs everything after the checkpoint, including LLM calls and API requests {{S30.l}}. Your node logic therefore has to survive being run twice without corrupting anything {{S29.j}}. And an interrupted node restarts at its first line when the human answers {{S34.c}}. One rule, three doors.

## Choosing when the write actually happens

The remaining decision is when the runtime actually writes. There are three durability modes. Under `sync`, changes are persisted synchronously before the next step starts. Under `async`, changes are persisted asynchronously while the next step executes. Under `exit`, changes are persisted only when the graph exits. {{S34.e}}

```python
# langgraph.types.Durability
"sync"    # persisted before the next step starts
"async"   # persisted while the next step executes
"exit"    # persisted only when the graph exits
```

Read the trade off out of the definitions rather than out of a benchmark. `sync` puts a completed write between two steps, so the next step never starts against unwritten state. `async` overlaps the write with the following step's execution, which removes the wait and means the next step is running while the record of the previous one is still in flight. `exit` writes once, at the end, so a run that never reaches its exit has not written its intermediate steps. {{S34.e}} That last mode interacts directly with everything above: replay resumes from a prior checkpoint {{S30.l}}, and `interrupt` relies on the graph state having been persisted {{S34.d}}, so the mode you pick sets how much of a run is recoverable at any moment.

