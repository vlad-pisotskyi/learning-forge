# Bennie alignment: what the agentic-retrieval topic must cover

Written 2026-08-14. This is a plan record. It states what was intended on that date and
should not be revised to match whatever the code later became.

One redaction was made before this file was committed, and it is the only edit this record
will take. Route names, the application's own name, and the name of the measurement skill
were replaced with descriptions of what each thing is. The document's own non-goal section
forbids exactly those identifiers in committed material, and this file had been written
before that rule was applied to it. Nothing about the plan changed.

## Goal

Finishing the agentic-retrieval course should leave three things true. The three assistant
routes in the application are legible: for each one, the mechanism it uses, why that mechanism,
and what would measure whether it works. The PDF to markdown conversion step, which does not
exist yet, is something the learner can build and measure rather than perform by hand. And
the conversation-level evaluation currently running against the graph route is extendable to
the newest route.

## Non-goal

Bennie is not a source. No bennie code, route names, hostnames, or policy text appears in
chapter prose or in any committed material. The course is generated from public sources;
bennie supplies the shape of the practical work only.

## Decisions settled in this session

**Language is Python.** The topic stays Python throughout, including the new framework
chapter, which teaches the Python LangGraph package. The ecosystem documents itself in
Python, and learning it is a deliberate goal.

**Reshape, not a second topic.** The existing map is revised in place. A separate bennie
topic would duplicate the first eight chapters wholesale, and the map is still unapproved,
which is the cheapest moment to change it.

**A LangGraph shard reads DeepWiki first.** The research playbook's shortlist rule applies,
and DeepWiki is the index it names for a repository. The shard starts there, writes down
which documentation pages and source files are worth opening, and fetches those. LangGraph's
documentation plus its source is a large surface and almost none of it concerns StateGraph,
reducers, conditional edges, or checkpointers, so the shortlist is what keeps the fetch count
small. Excerpts pin to the pages the shortlist named. DeepWiki itself is never quoted,
because it is generated about the repo rather than published by it. Whether it fetches
cleanly for an agent is untested, so a shard that cannot reach it records that in one line
and proceeds with ordinary documentation and repository lookup.

**The c04 corpus ships empty.** The challenge brief describes the corpus by its properties,
meaning multi-column layouts, ruled tables, scanned pages, and forms, and instructs the
learner to place their own PDFs in `corpus/`. That path gets a gitignore entry and the brief
carries a note explaining why it is empty. The learner will supply real documents locally
when ready. This avoids republishing NC material that was never ours to republish and makes
it impossible to commit a filled-in form containing a real person's data. It also improves
the challenge: a hidden evaluation set built against fixed PDFs measures those PDFs, whereas
one that scores conversion output against a stated ceiling measures the skill.

## Why the timing matters

At the time of writing, `topics/agentic-retrieval` is at stage research. The map is written
and unapproved. There are 225 pinned excerpts and zero cited. Revising chapter order and
challenge briefs now costs nothing. Once eleven chapters cite those excerpts, it costs a
regeneration. This document exists to get the reshaping done before `map.approved.json` is
copied.

## Phase 0: the scan, and what it must return

This is the only phase that touches bennie. It is read-only and nothing it finds enters
committed material verbatim. It should return a written inventory, not a narrative.

For each of the three routes in the application, meaning the plain route, the graph
route, and the newest route: what it retrieves from, by what mechanism, how context is assembled and
ordered before the model call, and where the three diverge from each other. For the graph
route specifically, the node and edge structure, whether checkpointing is used, and what the
conditional routing decides.

For the scraper repo: what kinds of PDF it collects, where they land in the cloud, and what
the manual conversion step currently does. The two halves are disconnected today and no
automatic mechanism joins them, which is the gap the course should let the learner close.

For measurement: what the conversation-level evaluation skill reports, at what granularity, and what
would have to change for it to run against the newest route. It currently covers the graph route
only.

Finally, a concept inventory. Every distinct concept the three routes and the scraper rely
on, mapped against the 65 concepts already in the map, each marked covered, covered under a
different name, or missing. The naming collisions matter as much as the gaps, because a
concept taught under an unfamiliar name reads as missing to the learner.

## Topics the course must cover

Stated as a hypothesis for the scan to confirm or reject.

**Serving the plain route:** when not to retrieve, the cost of getting that
decision wrong in either direction, and context assembly and ordering. Believed already
covered by chapters six through eight.

**Serving the graph route:** state machines against loops, nodes and edges and conditional
routing, checkpointing and what durable state makes possible, and the question of what a
graph buys over a plain loop. Only the first half of this exists in the map today, and the
last part is not answerable from vendor documentation, which advocates rather than measures.

**Serving the newest route:** sparse and dense retrieval over a markdown corpus, chunking on
document structure rather than character count, and retrieval metrics with how to compute
them. Believed covered by chapters two through five, though the first challenge is currently
written against the wrong corpus type.

**Serving the conversion pipeline that does not yet exist:** layout analysis, what docling
does and where it fails, OCR and when it is needed, and conversion quality measurement
including the ceiling concept. Covered by chapters nine through eleven, which were previously
flagged as cuttable and are now load-bearing.

**Serving evaluation as a whole:** conversation-level measurement. Retrieval metrics answer
whether the right chunk came back. Conversion metrics answer whether the document survived.
Neither answers whether the assistant helped the person who asked. Nothing in the current
eleven chapters covers this.

## Gaps in the current map

Three, in priority order. Graph orchestration and LangGraph, which has no shard and no
excerpts at all. Conversation-level evaluation, which directly serves extending conversation-level
measurement to the newest route. Just-in-time context loading, flagged earlier and unchanged by this
session.

Everything else named above is already in the map and needs its challenge brief repointed
rather than new research.

## Map changes

A new LangGraph chapter is inserted after chapter eight, so the pattern is taught before the
framework that implements it. Chapter eight teaches the retrieval loop from Self-RAG and
ReAct; the new chapter then shows which parts of LangGraph are ideas and which are that
library's opinions. Chapters nine through eleven shift down.

This new chapter differs in kind from every other one in the map. The others teach a measured
finding. This one teaches an API, pinned to documentation retrieved on a date, and it will go
stale faster than a chapter pinned to a paper. That is worth recording where the chapter is
defined.

Four challenge briefs are rewritten. The first moves onto a markdown corpus, matching the
newest route rather than the embeddings framing it currently has. The third is briefed against
the retrieve-or-not decision the plain route makes. A new challenge builds a graph. The
fourth is briefed against the conversion pipeline, with the corpus arrangement described
above. That last one is the one worth protecting, because it produces a working component and
a number where the learner currently has neither.

## Remaining phases

Phase one confirms or rejects the topic list against what the scan found. Phase two
researches only the new shards, two or three of them, under the same bounded and checkpointed
discipline as the earlier research. Phase three revises the map and the challenge briefs.
Phase four approves and generates, and remains the owner's gate.

## Open questions

Whether the scan finds concepts in bennie under names the map does not use, which would mean
renaming rather than adding chapters. Whether the graph route's structure supports a
challenge that is more than a toy. Whether DeepWiki is usable by an agent at all.

## Two caveats on this record

The c04 corpus decision is settled, but the gitignore line and the brief's explanatory note
are real edits that still have to be made when the briefs are rewritten in phase three.
Recording the decision here does not make them.

The topic inventory above is a hypothesis stated from descriptions of the routes, not from
reading them. Phase one exists specifically to overturn parts of it.
