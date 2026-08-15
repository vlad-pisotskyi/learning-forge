---
id: ch04
title: "Chunking: what has actually been measured"
order: 4
requires: [ch01, ch03]
teaches: [fixed-size-chunking, semantic-chunking, chunk-overlap, token-level-evaluation]
quiz: quizzes/ch04.quiz.json
estimatedMinutes: 30
status: verified
audit:
  faithfulness:
    verdict: pass
    at: 2026-08-15
    claims: 30
    supported: 30
    unsupported: 0
    overstated: 0
    contradicted: 0
    unreachable: 0
  critique:
    verdict: pass
    at: 2026-08-15
    notes: 0 blocking, 2 advisory
---

## The baseline everything else is measured against

A fixed-size chunker splits a document sequentially into fixed-size chunks, using a
predefined or user-specified number of sentences per chunk. {{S08.b}} That is exactly
why it is the control condition: anything more expensive has to earn the difference
against it, and whether the more expensive options do was open enough to be worth a
study. {{S08.a}}

The single parameter still moves results. Larger chunks provide more context and cost
more processing time, while smaller chunks improve retrieval recall and cost less.
{{S10.a}} Wang and colleagues ran a comparison across chunk sizes {{S10.f}} and scored
it on faithfulness, which measures whether the generated response is hallucinated or
matches the retrieved text, together with relevancy. {{S10.b}} The corpus was the first
sixty pages of one document, with roughly a hundred and seventy queries
generated from that corpus by an LLM. {{S10.c}} Generation ran on zephyr-7b-alpha and
the scoring was done by gpt-3.5-turbo. {{S10.d}}

Hold that setup in mind before reading any number off that experiment. A chunk size
that wins on sixty pages of one document, against queries written by a model and
graded by a model, is a fact about that arrangement. {{S10.c}} {{S10.d}}

## Splitting on meaning instead of on length

Semantic chunking divides documents into semantically coherent segments, on the
expectation that retrieval improves when a chunk holds one topic rather than one
length. {{S08.a}} The boundary comes from the content rather than a fixed count. {{S08.a}} One of the
chunkers in the study is named for exactly that: the Breakpoint-based Semantic Chunker.
{{S08.e}} That detection carries an additional computational cost. {{S08.f}}

The argument for paying it is that a length cutoff fails at both ends. Chroma's report
speculates that recall reaches a maximum before relevant information becomes diluted
within chunks and correspondingly harder to retrieve, while chunks that are too small
fail to capture the necessary context in a single unit. {{S11.c}} A boundary chosen from
meaning is an attempt to sit at the top of that curve without guessing a number.

## What happened when somebody measured the difference

Qu, Tu and Bao evaluated semantic chunking on three retrieval-related tasks: document
retrieval, evidence retrieval, and retrieval-based answer generation. {{S08.a}} On
evidence retrieval, the fixed-size chunker was best on three of five datasets. {{S08.c}}
The differences between it and the two semantic chunkers were minimal, with no clear
advantage for any strategy. {{S08.d}} The second sentence is what makes the first one
readable. Winning three datasets out of five is not fixed-size being better; it is the
gap being small enough that which side of it you land on moves with the dataset.
{{S08.c}} {{S08.d}}

The authors offer a mechanism for the shrinking advantage. Several datasets were built
by stitching documents together, and as document length increased, fewer documents were
stitched into each example, which reduced topic diversity and diminished the
breakpoint-based chunker's edge. {{S08.e}} That is consistent with the qualified
positive result: semantic chunking occasionally improved performance, particularly on
stitched datasets with high topic diversity, but those benefits were highly
context-dependent and did not consistently justify the additional computational cost.
{{S08.f}} The paper's own summary is that fixed-size chunking remains a more efficient
and reliable choice for practical RAG applications. {{S08.g}}

## Overlap, and the redundancy it buys with

Overlap repeats text across a boundary, one way to keep a passage cut in half by the
split from disappearing between two chunks. The bill arrives as duplicated tokens. IoU,
intersection over union, scores how much a retrieved set overlaps with itself rather
than adding new material, and reducing overlap improves that score because the metric
penalises redundant information. {{S11.b}}

Overlap also has to be pinned down before a size experiment means anything: the chunk
size sweep above held overlap constant at 20 tokens, so what varied was size alone.
{{S10.e}} Chroma measured a configuration at the other extreme. The published default
for OpenAI Assistants is 800-token chunks with 400 tokens of overlap, and, assuming the
`TokenTextSplitter` method, that setting produced slightly below-average recall and the
lowest scores across every other metric. {{S11.f}} Half of every chunk restates its
predecessor, and the metrics that count redundant tokens register it.

## Scoring a chunker at the token level so sizes stay comparable

Chroma's proposal is to evaluate retrieval performance at the token level. {{S11.a}}
The reason is arithmetic. Recall at k, from the previous chapter, counts chunks, and a
chunk is not a fixed quantity of text: ten retrieved chunks at 800 tokens {{S11.f}} is
four times the material of ten retrieved chunks at 200 tokens {{S11.d}}. Compare those
two runs on chunk-level recall and the larger setting looks better partly because it
dragged in more text. Evaluating at the token level instead of the chunk level is how
the two runs land on one scale. {{S11.a}}

Two configurations came out of that sweep well. The heuristic
`RecursiveCharacterTextSplitter` at chunk size 200 with no overlap performs well.
{{S11.d}} The `ClusterSemanticChunker`, with a maximum chunk size of 400 tokens,
achieved the second highest recall recorded, 0.913. {{S11.e}}

Neither number travels alone. The authors report that altering some library defaults was
necessary for fair results, because the recursive splitter's default separator list
commonly produced very short chunks that performed poorly next to `TokenTextSplitter`,
which produces fixed-length chunks by default. {{S11.g}} A score from a sweep is a score
for the configuration that produced it, separators included.

## What the measurements do and do not settle

The semantic chunking study scopes itself to sentence-level chunking, where documents
are split into individual sentences and each sentence is the segment being grouped.
{{S08.h}} The finding is therefore about strategies that group sentences, not about
every conceivable way to find a boundary, and saying so is what makes the negative
result usable rather than merely discouraging.

The two bodies of work also sit at different answers, and the difference is in the
setups rather than in one of them being wrong. Qu, Tu and Bao found no clear advantage
for semantic chunking under sentence-level grouping, with minimal gaps and no
consistent justification for the cost. {{S08.d}} {{S08.f}} {{S08.h}} Chroma's token-level
evaluation placed a clustering semantic chunker at the second highest recall it
recorded. {{S11.e}} Different corpora, different chunkers, different evaluation unit.

What survives across all of it is direction, not settings: more context per chunk
against more processing time at one end, better recall at the other. {{S10.a}} A chunk
size copied from any of these tables is a number about that corpus, those queries, and
that grader. {{S10.c}} {{S10.d}}
