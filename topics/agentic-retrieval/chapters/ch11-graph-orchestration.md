---
id: ch11
title: A graph as the shape of a loop
order: 11
requires: [ch09, ch10]
teaches: [graph-state, state-reducer, node-and-edge, conditional-edge, builder-versus-compiled, version-pinned-documentation]
quiz: quizzes/ch11.quiz.json
estimatedMinutes: 30
status: verified
audit:
  faithfulness:
    verdict: pass
    at: 2026-08-16
    claims: 30
    supported: 30
    unsupported: 0
    overstated: 0
    contradicted: 0
    unreachable: 0
  critique:
    verdict: pass
    at: 2026-08-16
    notes: 0 blocking, 2 advisory
---

Everything below is pinned to one release and one day: the package version is 1.2.11, and the documentation pages quoted here were read on 2026-08-14. These are facts about this chapter's own source record rather than claims a quoted excerpt states, so they appear here directly rather than behind a marker. The documentation URL itself carries no version or revision in its path, unlike the package source's URLs, which are pinned to a commit; opening the documentation URL later returns whatever is current, not what is quoted here. That is a problem this chapter has and the other chapters in this topic do not, and the last section turns it into a habit.

## One shared state object, and the schema that parameterises it

Chapters 9 and 10 left you with a system that decides for itself when to retrieve, loops, and stops on a condition. LangGraph is one framework that gives that loop a fixed shape. The class to reach for is `StateGraph`, and it is parameterised by a state object you define. {{S29.a}} That state is two things at once: the schema of the graph, meaning which keys exist, and a set of reducer functions that specify how updates are applied to those keys. {{S29.b}}

The package source states it in three sentences. Nodes communicate by reading from and writing to one shared state; the signature of a node is `State -> Partial<State>`; and each state key can be annotated with a reducer, of signature `(Value, Value) -> Value`, used to aggregate the values that key receives from several nodes. {{S32.a}}

Read those two signatures together, because the second exists only because of the first. A node hands back a partial, so something has to decide what merging that partial into the whole means, key by key. In TypeScript you would reach for a spread and be done. Here the merge is a per-key policy you choose, and choosing badly is silent.

## Reducers: what happens when two nodes write the same key

A reducer is a binary function with two positional arguments. The left argument is the value already stored in state for that key. The right argument is the update for that key returned by a node. {{S29.c}} The worked example below shows what one reducer does with those two arguments.

```python
# a node: State -> Partial<State>
def retrieve(state: State) -> dict:
    hits = search(state["query"])
    return {"documents": hits}

# a reducer: (Value, Value) -> Value
def concat(left: list[str], right: list[str]) -> list[str]:
    return left + right
```

The node above never sees `state["documents"]`, and it does not need to. It reports what it found. The reducer attached to `documents` is the only thing that knows whether finding something means replacing what was there or adding to it, and it is also what makes aggregation across several nodes writing the same key well defined. {{S32.a}}

## The default reducer, and why accumulation has to be asked for

Here is the sentence that costs people data. When a key has no reducer of its own, the default reducer ignores the left argument and replaces the state value with the right one. {{S29.d}}

Last write wins. Nothing accumulates unless you asked for accumulation. An agentic loop of the kind chapter 9 described, retrieving three times against three reformulated queries and returning `{"documents": hits}` each time, ends holding the third batch and nothing else. The first two retrievals ran, cost tokens and latency, and were overwritten. Nothing about that is a malfunction: replacement is the documented default, and accumulation is the thing you have to write. {{S29.d}}

The counter-case ships in the package. `add_messages` merges two lists of messages, updating existing messages by ID. {{S33.a}} Its right-hand argument is the list of messages, or a single message, to merge into the base list. {{S33.b}} The documentation describes the same behaviour from the outside: brand new messages are appended to the existing list, and updates to messages already present are handled as updates. {{S29.e}} Merging by id is exactly what separates this from list concatenation. A node that re-emits a message carrying an id already in state revises that entry; plain concatenation would leave two copies of it in the transcript. For the common case there is a prebuilt state class, `MessagesState`, defined with a single `messages` key holding `AnyMessage` objects and using the `add_messages` reducer. {{S29.f}}

## Nodes, edges, and routing decided at run time

Nodes hold the logic. They receive the current state as input, perform some computation or side effect, and return an updated state. {{S29.g}} A node's signature is `State -> Partial<State>`, which names no successor. {{S32.a}} Edges hold the wiring instead. {{S29.h}}{{S29.i}}

There are two kinds of wiring. When control always goes from node A to node B, `add_edge` states that directly. {{S29.h}} When you want to route optionally to one or more edges, or optionally terminate, `add_conditional_edges` takes the name of a node and a routing function to call after that node has executed. {{S29.i}} The source describes the same method as adding a conditional edge from the starting node to any number of destination nodes. {{S32.c}} Its `path` argument is the callable that determines the next node or nodes, it runs when execution exits the source node, and returning `'END'` stops the graph. {{S32.d}}

That single argument is where an agentic loop lives, on this chapter's own reading rather than the documentation's: the callable returns the name of whichever node should run next, or `'END'` to stop, and neither S32.d nor anything else pinned here states a restriction to a node ahead of the current one. {{S32.d}} Nothing pinned here rules it out, so this chapter treats returning the name of a node that already ran as valid, in which case the graph runs it again against the updated state, which is what a loop is. Chapter 9's threshold on whether the retrieved passages are good enough to answer from is not framework machinery at all; it is the body of this function, written by you, reading the state that previous nodes wrote.

## The builder you assemble against the graph you run

`StateGraph` is a builder class and cannot be used directly for execution. Calling `.compile()` produces the executable graph, which is the object carrying `invoke()`, `stream()`, `astream()`, and `ainvoke()`. {{S32.b}}

Two objects, two jobs. You add nodes and edges to the builder, and the thing you then run is the separate value that compiling returns. {{S32.b}} A TypeScript engineer has met this split before, in every query builder whose `.build()` hands back something the builder methods no longer exist on. Keeping a reference to the builder and calling a run method on it is the mistake the docstring exists to prevent.

## What the vendor claims for this, and what nobody has measured

The overview page describes LangGraph as a low-level orchestration framework and runtime for building, managing, and deploying long-running stateful agents, offering fine-grained control to mix deterministic hand-coded steps with model-driven steps inside one graph. {{S35.a}} It names that mixing as a core strength, on the argument that some parts of the logic stay predictable and auditable while others stay flexible. {{S35.b}} Its list of core benefits adds two more: persistence, meaning agents that survive failures and resume where they stopped, and human-in-the-loop oversight, meaning state that a person can inspect and modify at any point. {{S35.c}} For choosing between this and something simpler, the page tells beginners and anyone wanting a higher-level abstraction to use LangChain's prebuilt agents, and reserves LangGraph for those needing fine-grained control over orchestration. {{S35.d}}

<!-- allow-hedge: unmeasured practice, the cited vendor overview page asserts these benefits and reports no measurement of them; the absence claim is scoped to that page -->
Every one of those is a capability claim published without a number behind it. That page carries no benchmark, no ablation, no latency figure, and no comparison against a chain or a hand-written loop. {{S35.a}}{{S35.b}}{{S35.c}}{{S35.d}} The criterion it offers for the choice is a preference about how much control you want, not a measured outcome. {{S35.d}} Chapters 5 and 8 drilled the separation between a measured number and a recommended one, and this page sits entirely on the recommended side. What the API documentation supports is narrower and more useful: a graph is a way to write the loop from chapters 9 and 10 with explicit per-key state updates and an explicit termination condition. {{S29.c}}{{S32.d}} It is not a claim that graphs retrieve better than loops.

## Citing a document that will say something else next month

A documentation page and a source file on a moving branch are not fixed the way this chapter's own citations need them to be. This fact is not the kind a quoted excerpt carries, since it describes the source record rather than anything the source itself says, so it is stated here directly rather than marked: the Graph API page cited throughout this chapter was read on 2026-08-14 against version 1.2.11, and the two quotes taken from the package source name one commit rather than a branch tip. That is the difference between a quote someone can retrieve and a quote someone can only take your word for.

Carry three things into your own notes whenever you cite a moving document. Record the version you ran, because the page you read was serving that release and the next reader's page will not be. Record the date you read it. And prefer a permalink that pins a revision over a URL that always serves the current one, since the pinned form stays checkable after the API moves.

Then expect it to have moved. Names are the surface that gets renamed, and this chapter leans on two of them: `add_conditional_edges` with its routing function, and `.compile()` producing the runnable object. {{S29.i}}{{S32.b}} The mechanism underneath survives a rename. One shared state object, a per-key rule for combining updates, a default that replaces rather than accumulates, and a function of the state deciding where control goes next. {{S29.d}}{{S32.c}} When the names change, that is the list to re-derive against whatever the documentation says then.
