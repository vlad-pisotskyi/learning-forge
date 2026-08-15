# Bennie alignment, phase 0: what the scan found and what it changed

Written 2026-08-14, the same day as [BENNIE-ALIGNMENT.md](BENNIE-ALIGNMENT.md). This is a plan
record. It states what was found and decided on that date and should not be revised to match
whatever the code later became.

Read the earlier document first. This one exists because the scan it specified overturned four
of its premises, and the reshaped map has to be built on what the scan found rather than on
what was assumed.

## What was scanned, and what is not written down here

Three read-only shards ran against the application repository, its graph route, the scraper
repository, and the two measurement skills. The full inventory, with file paths and line
numbers, stays on the machine that ran it and is deliberately not committed.

The earlier document's non-goal is the reason. Committed material in this repository carries no
route names, hostnames, storage locations, or collection names from the system being scanned.
What follows is the inventory reduced to its consequences for the map, which is the only part
the Forge needs.

## Four premises that did not survive

**Conversion already exists.** The earlier document treats the PDF to markdown step as
something the learner will build because it does not exist yet. It does exist, as a working
docling pipeline in a sidecar directory, and it produced the entire markdown corpus the newest
route reads. The script's own header calls it a throwaway for a one-off job and disclaims being
the pipeline that was deferred.

What is genuinely missing is the service around it. Nothing triggers conversion, nothing
schedules it, and the content hash written into every converted file is required by the loader
and compared against nothing. A revised document published under its old filename is never
re-fetched, never re-converted, and reaches no route. The corpus is a git artifact, so
refreshing it needs a deploy rather than a write.

So the challenge target moves from building conversion to building what surrounds it.

**The newest route does no dense retrieval and no chunking.** The earlier document assumed it
needed sparse and dense retrieval over a markdown corpus with structure-aware chunking, covered
by chapters two through five. It has no vector store, no embeddings, and no chunking of any
kind. It reads whole markdown files through a tool loop and ranks by literal match count. That
places it in chapter eight's territory rather than chapters two through five.

**The retrieve-or-not decision lives on a different route than assumed.** The earlier document
briefs a challenge against the plain route's decision about whether to retrieve. The plain
route makes no such decision; it retrieves on every request, as does the graph route. The only
place a zero-retrieval answer is possible is the newest route, where the model chooses by way
of tool selection. The brief has to move with the behaviour.

**Wiki-route measurement already exists.** The earlier document treats extending the existing
conversation-level evaluation to the newest route as an open goal. A second measurement system
already targets that route, by replaying a dataset against a local server rather than reading
production traffic. What is uncovered is production traffic, and the obstacle is larger than a
port: the stored conversation records carry no field distinguishing which route answered, so
there is nothing to filter on.

## The finding worth teaching

The judge in both measurement systems treats the markdown corpus as ground truth. A fact
present in the corpus but absent from what was retrieved scores as a retrieval gap. A fact
present nowhere in the corpus scores as out of scope.

But that corpus is a hand-made snapshot derived from an allowlist belonging to a different
route's ingestion. A document that was collected and never converted is therefore scored as the
user having asked something irrelevant. An ingestion gap is silently recorded as a
non-question, and neither measurement system mentions the coupling.

This is the sharpest thing the scan produced. It is a failure that only appears when the
conversion layer and the evaluation layer are looked at together, which is exactly what a
course covering both is positioned to teach. None of the 65 concepts in the current map names
it.

## Concepts the running system relies on that the map cannot name

Maximal marginal relevance and the tradeoff its lambda parameter controls. Conversation
summarization with physical history pruning. Checkpointed durable state. Tool-calling loop
mechanics, and budgets as a termination condition. Citation validation and phantom-citation
detection. Corpus freshness as a measurable property.

One concept runs the other way. Reranking is taught in the map and exercised in a challenge,
and no route performs it. That is not a defect, because reranking is a real technique worth
knowing, but it is not doing alignment work.

## Decisions settled after the scan

**The framework in use is TypeScript, and Python still holds.** The graph is built on the
TypeScript LangGraph package. The topic stays Python throughout regardless, including the
framework chapter. The learner rebuilds the pattern in Python and ports it back themselves.
Learning Python is a goal in its own right, and the transfer cost is accepted deliberately
rather than overlooked.

**Conversion work splits into two challenges.** One measures the quality of existing conversion
output against a hand-built ceiling, and includes the failure where a scanned page converts
successfully into nothing. OCR is never enabled in the running pipeline, and an empty
conversion is written out as a valid file, so this failure is live rather than hypothetical.
The second builds the freshness service: detect a changed document, re-convert, write the
result. This takes the topic to six challenges.

**The conversation-evaluation chapter teaches replay against production.** Not
conversation-level metrics in general, and not the corpus-truth trap on its own, but the two
modes of measuring a deployed assistant and what each one can and cannot tell you. Both modes
exist in the scanned system, which makes the comparison concrete rather than academic.

## The map this implies

Thirteen chapters. Graph orchestration enters after chapter eight, so the pattern is taught
before the framework implementing it, and the conversion chapters shift down. Conversation-level
evaluation goes last, after retrieval measurement and conversion measurement, because it is the
layer that neither of those answers.

```
ch01  RAG: two kinds of memory
ch02  Sparse and dense retrieval
ch03  Measuring retrieval
ch04  Chunking: what has been measured
ch05  Chunking: what everyone recommends
ch06  Where in the context the answer sits
ch07  How much context helps
ch08  Agentic loops
ch09  Graph orchestration                     NEW
ch10  Document conversion and layout analysis
ch11  The human ceiling
ch12  OCR with vision language models
ch13  Conversation-level evaluation           NEW
```

Six challenges. Two repointed, two new, two unchanged.

```
c01  after ch03   Measure a retriever            repointed to a markdown corpus
c02  after ch05   Chunk a corpus and defend it   unchanged
c03  after ch08   Retrieve or not                repointed to the tool-loop decision
c04  after ch09   Build a graph                  NEW
c05  after ch12   Measure conversion and its ceiling   was c04, rescoped
c06  after ch13   The freshness service          NEW
```

## Research still owed

Four shards rather than the two or three the earlier document expected. Graph orchestration and
the Python LangGraph package. Conversation-level evaluation, covering replay and production
measurement. Maximal marginal relevance and the diversity against relevance tradeoff, which the
scan promoted from unnoticed to central. Just-in-time context loading, flagged earlier and
still unaddressed.

Everything else in the reshaped map is served by the 225 excerpts already pinned.

## What the earlier document still owes

Its two closing caveats stand. The corpus gitignore entry and the explanatory note in the brief
are still unmade edits, and they now belong to c05 rather than to the challenge that used to
carry that number.

## Open questions carried forward

Whether the six-challenge shape survives contact with the excerpt pool, or whether the
freshness service turns out to rest on too little published measurement to teach as fact rather
than as practice. Whether DeepWiki is usable by an agent, still untested.
