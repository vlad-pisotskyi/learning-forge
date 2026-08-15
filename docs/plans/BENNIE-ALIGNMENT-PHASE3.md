# Bennie alignment, phase 3: the map as approved

Written 2026-08-14, after the twelve research shards landed and the map was approved. This
is a plan record. It states what was decided on that date and should not be revised to match
whatever the topic later became.

Read [BENNIE-ALIGNMENT.md](BENNIE-ALIGNMENT.md) and then
[BENNIE-ALIGNMENT-PHASE0.md](BENNIE-ALIGNMENT-PHASE0.md) first. This document exists because
the approved map departs from the shape phase 0 specified, and the departure needs a reason
on the record rather than in a cache directory that is not committed.

## What was approved

Sixteen chapters, six challenges, one hundred and two concepts, and all three hundred and
eighty five pinned excerpts allocated to exactly one chapter each. `forge check` passes.

```
ch01  Retrieval-Augmented Generation: two kinds of memory
ch02  Sparse and dense retrieval, and when each one wins
ch03  Measuring retrieval: nDCG, recall at k, reciprocal rank
ch04  Chunking: what has actually been measured
ch05  Chunking: what everyone recommends, and who measured it
ch06  Where in the context the answer sits
ch07  How much context helps, and where the evidence is contested
ch08  Diversity in what you retrieve, and what it is worth
ch09  Agentic loops: deciding when and what to retrieve
ch10  Retrieving during generation, not before it
ch11  A graph as the shape of a loop
ch12  Checkpointed state, and runs that survive
ch13  Before retrieval: document conversion and layout analysis
ch14  The human ceiling, and how one gets built
ch15  OCR with vision language models
ch16  Measuring a deployed assistant
```

```
c01  after ch03   Measure a retriever over a markdown corpus
c02  after ch05   Chunk a corpus and defend the choice
c03  after ch10   Decide whether to retrieve, then choose what to keep
c04  after ch12   Build a graph that can be resumed
c05  after ch15   Measure a conversion, and the ceiling above it
c06  after ch16   Keep a corpus fresh, and prove it matters
```

## Why sixteen chapters and not thirteen

Phase 0 assumed the four new shards would be served inside chapters that already existed,
and said so plainly: everything else in the reshaped map is served by the excerpts already
pinned. That assumption was made before the shards ran.

They returned one hundred and sixty excerpts. Diversity reranking alone is forty, retrieving
during generation is thirty two, and graph orchestration is forty six. None of those is a
section. Three chapters were added rather than three sections, by splitting the agentic loop
from the question of when the loop retrieves, and by splitting the graph from the state the
graph persists.

The arithmetic is the whole argument. A chapter exists in this repo because there is material
to teach and excerpts to teach it from, and a chapter carrying forty six excerpts in thirty
minutes is three chapters that have not been separated yet.

## Two decisions the map made rather than deferred

**The conversation-evaluation chapter teaches two modes and does not pretend to bridge them.**
Shard 10 closed with the finding that no source it reached connects reference-free scoring on
a replayed dataset to live-traffic outcomes, which is what this chapter was scoped to teach.
The canonical measurement of offline judgements against live behaviour exists only as a PDF an
agent could not quote. Two options were on the table: someone opens that PDF and quotes it by
hand, or the chapter teaches the two modes separately and states outright that nothing in its
sources joins them. The second was taken. It is the honest one and it is thinner.

What the chapter does have is one source that relates offline evaluation to live A/B testing
in search ranking rather than in retrieval-augmented conversation, and it names which of the
two that is rather than letting the reader assume.

**The corpus-truth trap is taught in general form, because no excerpt names it.** Phase 0
called it the sharpest thing the scan produced: a judge that treats a hand-made corpus as
ground truth records an ingestion gap as the user having asked something irrelevant. Nothing
in the pinned pool says that. What the pool does support is the general shape, from the
textbook's own statement that relevance stands in for user happiness because user happiness
cannot be measured, from its separation of relevance from lexical match, and from the two
judge papers on validating a judge against human labels before trusting it. That became the
concept `ground-truth-proxy`, taught in ch16. The specific version is where the learner meets
it in c06.

## The freshness service survived, rescoped

Phase 0 asked whether the six-challenge shape would survive contact with the excerpt pool, and
whether the freshness service rested on too little published measurement to teach as fact. It
rests on none. No source in the pool measures corpus freshness, so no chapter teaches it and
no concept names it.

A challenge may only exercise concepts an earlier chapter taught, and `forge check` enforces
that, so a `corpus-freshness` concept invented for this challenge would have failed the check.
It was not invented. The freshness service is now the setting of c06 rather than its subject,
and the concepts it exercises are ones the chapters earn: document conversion, cost per page,
offline replay, live traffic measurement, and ground truth as a proxy.

This is the check working rather than the check getting in the way. A concept with no chapter
behind it is a chapter that would have had to make something up.

## Two orderings that could reasonably go the other way

ch08 sits after ch07 because reranking is the practical consequence of the position effect,
which is what ch06 and ch07 establish. Maximal marginal relevance is a retrieval-side
technique and would sit just as well straight after ch03.

ch06 requires only ch01, so it could move ahead of the two chunking chapters. It was left
where it is so that the chunking pair stays adjacent to the measurement chapter they are
scored by.

## Still owed

Five sources carry no DOI and no arXiv identifier: the NeurIPS proceedings page, three
trec_eval source files, and four sections of the Manning, Raghavan and Schütze textbook. Each
is a validator warning, and `promote` runs the validator in strict mode, so the topic cannot
reach `validated` while they remain. The NeurIPS one is replaceable by its arXiv entry. The
others are not, and the offline against online distinction the textbook sections carry is
older than arXiv.

Three LangGraph documentation sources have not been confirmed excerpt by excerpt the way the
diversity shard was. The misses appear to sit on bold markers and hyperlinked spans in the raw
markdown the site serves rather than on absent text, but nobody has checked that one at a
time, and the vendor overview page is the material a chapter can least afford to get wrong,
because its claims are unmeasured by the vendor's own admission.

The corpus gitignore entry and the explanatory note in the brief, carried forward from the
first alignment document, are still unmade edits. They belong to c05 now.
