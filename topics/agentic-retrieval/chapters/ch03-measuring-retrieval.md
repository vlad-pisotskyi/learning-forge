---
id: ch03
title: "Measuring retrieval: nDCG, recall at k, reciprocal rank"
order: 3
requires: [ch01, ch02]
teaches: [test-collection, precision-and-recall, recall-at-k, ndcg, reciprocal-rank, graded-versus-binary-relevance, evaluation-cutoff, headline-measure]
quiz: quizzes/ch03.quiz.json
estimatedMinutes: 30
status: draft
audit:
  faithfulness:
    verdict: fail
    at: 2026-08-15
    claims: 46
    supported: 44
    unsupported: 0
    overstated: 2
    contradicted: 0
    unreachable: 0
  critique:
    verdict: pass
    at: 2026-08-15
    notes: 0 blocking, 4 advisory
---

## What you need before you can score anything

The previous chapter compared systems using numbers it never defined: top-20 passage
retrieval accuracy and BEIR's zero-shot scores. Before either one can be defined,
three other things have to be pinned down. This chapter's premise is that a retrieval
score is a property of a system and a collection together, not of the system alone,
and the sections that follow build the case: the same system scored against a
different collection, or against a different record of what counts as relevant, comes
out with a different number without anything about the system changing. Measuring ad
hoc retrieval effectiveness in the standard way starts by assembling a test
collection. {{S38.a}} A test collection, in the sense this book uses throughout, is
documents being searched, information needs being served, and a record of which
documents are relevant to which need.

The middle part is where engineers new to this go wrong, because a need is not a
query. Relevance is assessed relative to an information need, not relative to a
query. {{S38.b}} A document is relevant when it addresses the stated need, not
because it happens to contain all the words in the query. {{S38.c}} Lose that
distinction and the evaluation quietly becomes a test of string overlap between the
query and the document, which is not the thing anyone set out to measure.

Size matters as well, since one need proves nothing about a system. Manning,
Raghavan and Schutze give 50 information needs as a rule of thumb for a sufficient
minimum. {{S38.d}} Benchmarks run much wider: BEIR bundles 18 English zero-shot
evaluation datasets drawn from 9 different retrieval tasks. {{S03.k}} Each of those
datasets ships its own relevance judgements. {{S03.l}}

## Precision and recall over an unranked set

The two most frequent and basic measures of retrieval effectiveness are precision
and recall. {{S07.a}} Precision is the fraction of retrieved documents that are
relevant. {{S07.c}} Recall is the fraction of relevant documents that are retrieved.
{{S07.b}} Both fractions count the same numerator, the documents that are retrieved
and relevant, and differ only in what they divide by: precision divides by what the
system returned, recall divides by what existed. The standard presentation is a
contingency table of retrieved against relevant. {{S07.d}}

|               | relevant | nonrelevant |
| ------------- | -------- | ----------- |
| retrieved     | hits     | false positives |
| not retrieved | misses   | true negatives |

Precision reads the top row: hits over the whole row. Recall reads the left column:
hits over the whole column.

```ts
const hits = retrieved.filter((d) => relevant.has(d)).length;
const precision = hits / retrieved.length;
const recall = hits / relevant.size;
```

Neither fraction looks at order. Shuffle the returned set and both numbers come out
identical, which is exactly why BEIR rules them out for comparing rankers: precision
and recall are both rank unaware. {{S03.i}}

## Recall at a cutoff, and why the cutoff travels with the number

Recall at k is the fraction of the relevant documents that are successfully
retrieved within the top k extracted documents. {{S03.m}} The k is the cutoff, and
it is written into the name because the same ranking produces different values at
different cutoffs. A recall figure with no cutoff attached cannot be compared with
another one.

trec_eval, the official TREC evaluation tool, computes recall as relevant retrieved
divided by relevant, measured at a list of document level cutoffs in the ranking.
{{S05.a}} Two details in its descriptor are worth carrying. When the cutoff is larger
than the number of documents the system returned, the remaining positions are
assumed to be filled with nonrelevant documents. {{S05.a}} A run that returns three
results is scored at cutoff 10 as though it had returned seven bad ones, so a short
list buys nothing. The descriptor also records that recall is a fine measure on a
single topic but does not average well. {{S05.a}}

The tool does not choose a cutoff for you. It ships nine defaults, declared as a
plain array above the measure descriptor and repeated in the measure's default
parameter string. {{S05.b}} {{S05.a}}

```c
static long long_cutoff_array[] = { 5, 10, 15, 20, 30, 100, 200, 500, 1000 };
```

Which cutoff to report is a decision about the application, not a property of the
ranker.
BEIR's argument for its own metric opens on exactly that point: retrieval tasks are
precision focused or recall focused depending on the nature and requirements of the
real world application. {{S03.i}}

## Discounted gain, and what normalising it against the ideal buys

trec_eval computes a traditional nDCG following Jarvelin and Kekalainen (2002), and
by default the gain of a document is set to its relevance level. {{S04.a}} That
default is the connection to graded judgements: gain is the grade the assessor gave.

The accumulation is one loop over the retrieved list. {{S04.b}}

```c
    for (i = 0; i < res_rels.num_ret && ideal_gain > 0.0; i++) {
        /* Calculate change in results dcg */
        results_gain = get_gain(res_rels.results_rel_list[i], &gains);
        if (results_gain != 0)
            /* Note: i+2 since doc i has rank i+1 */
            results_dcg += results_gain / log2((double) (i + 2));
```

Read three things out of it. The index `i` is zero based while the document at that
index sits at rank `i + 1`, so the discount divides by `log2(i + 2)`, and the source
carries a comment marking exactly that. {{S04.b}} The document at rank 1 divides by `log2(2)`, which
is 1, so the top position takes no discount and every position after it is worth
strictly less than the one before. And the loop halts as soon as the ideal ranking
has no gain left to place. {{S04.b}}

The same loop keeps a second running total. At each position, the gain the ideal
ranking would have there is divided by the identical discount and added to the ideal
DCG. {{S04.c}}

```c
        if (ideal_gain > 0.0)
            ideal_dcg += ideal_gain / log2((double) (i + 2));
```

The measure itself is then a division. {{S04.d}}

```c
    if (strcmp(tm->name, "ndcg") == 0) {
        /* Compare sum to ideal NDCG */
        if (ideal_dcg > 0.0) {
            eval->values[tm->eval_index].value = results_dcg / ideal_dcg;
        }
```

Work the ratio through by hand from the code above. {{S04.d}} When a ranking puts the
highest gains first, `results_dcg` accumulates the same gains in the same order as
`ideal_dcg`, so the two sums come out equal and the division returns 1.0: the
normalised number has a fixed ceiling no matter how many relevant documents a
particular need has. The same file also reports the raw DCG and the ideal DCG under
their own measure names, so the unnormalised sums are available when the ratio is not
what is wanted. {{S04.d}}

## Reciprocal rank, and the task it suits

Reciprocal rank is one divided by the position of the first relevant retrieved
document. {{S06.a}} In trec_eval it is the six lines below. {{S06.b}}

```c
    for (i = 0; i < res_rels.num_ret; i++) {
        if (res_rels.results_rel_list[i] >= epi->relevance_level)
            break;
    }
    if (i < res_rels.num_ret)
        eval->values[tm->eval_index].value = (double) 1.0 / (double) (i + 1);
```

The loop walks the result list until it reaches a document whose judgement is at or
above the configured relevance level, breaks there, and scores `1 / (i + 1)`.
{{S06.b}} Rank 1 scores 1.0, rank 2 scores 0.5, rank 10 scores 0.1. Nothing past the
first relevant document is read at all, so a run with a single relevant document at
rank 1 and a run with fifty relevant documents starting at rank 1 are
indistinguishable. {{S06.b}}

That is the design and not an oversight. The measure is most useful for tasks in
which there is only one relevant document, or in which the user only wants one.
{{S06.a}} A lookup with one right answer has that shape. A request to assemble
everything written about a subject does not.

## Binary judgements against graded ones

BEIR's own datasets illustrate the two kinds directly: a majority carry binary
judgements, relevant or not relevant, and a few carry fine-grained, graded judgements
instead. {{S03.l}}

Which measures are usable follows from that split. nDCG reads a grade directly,
because gain defaults to the relevance level. {{S04.a}} Reciprocal rank does not: the
comparison in its loop is a threshold test against a configured relevance level, so a
graded scale is flattened to relevant or not the moment the measure runs. {{S06.b}}
BEIR raises the same objection against MRR and MAP. MRR is mean reciprocal rank, the
aggregate of the exact reciprocal rank measure walked through above, and MAP is mean
average precision, another rank-aware measure built on binary judgements; BEIR's own
text spells the first acronym out as Mean Reciprocal Rate. BEIR calls both binary
rank-aware metrics that fail to evaluate tasks with graded relevance judgements.
{{S03.i}}

The other direction costs nothing. A binary judgement is a graded one with two
grades, which is why nDCG at a cutoff is suitable for tasks with binary and with
graded judgements alike. {{S03.i}}

## Why a benchmark picks one number

BEIR ranks systems across 18 datasets from 9 tasks. {{S03.k}} To get results that
compare across all of them, it argues for a single evaluation metric that can be
computed comparably on every task. {{S03.i}} The elimination runs in two steps.
Precision and recall are rank unaware and therefore unsuitable; MRR and MAP are rank
aware but binary, and fail on graded judgements; nDCG at a cutoff covers both kinds
of judgement. {{S03.i}} The number that comes out is nDCG@10, computed for every
dataset through the Python interface of the official TREC evaluation tool. {{S03.j}}

So the headline number is chosen for comparability across tasks rather than because
10 is the right depth for each of them, and BEIR's own opening observation is that
applications are precision focused or recall focused depending on their requirements.
{{S03.i}} Two systems that both put a relevant document at rank 1 are
indistinguishable on reciprocal rank, which stops reading after that document.
{{S06.b}} They separate on nDCG@10 when one of them fills the remaining nine
positions with graded gain and the other leaves them empty. {{S04.d}}

Every comparison in the chapters that follow is a comparison at a cutoff, over one
collection, against judgements somebody wrote down. When a result looks surprising,
those three are the first place to look.
