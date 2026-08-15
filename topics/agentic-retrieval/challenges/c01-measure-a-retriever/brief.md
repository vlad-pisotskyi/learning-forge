# Measure a retriever over a markdown corpus

Chapter 3 said a retrieval score is a property of a system and a collection together.
This challenge hands you the collection and asks for the system, and then for the three
measures that turn one into a number.

You are building two things that are usually built by different people. The first is a
sparse retriever: an index over 522 markdown documents and a ranking function that scores
them against a query by the words they share. The second is the measuring apparatus:
recall at a cutoff, nDCG at a cutoff, and reciprocal rank, each written to the definitions
in chapter 3 rather than to the first formula a search turns up.

## the collection

`corpus/c01-docs.json` is an operations handbook for a fictional freight company. It has
one entry per document:

```python
{"id": "hb-00-0", "title": "ledger reconciler: restart cadence", "text": "# ledger reconciler: restart cadence\n\nThe ledger reconciler is restarted every 90 minutes..."}
```

There are 36 services and 8 aspects of each one, which gives 288 handbook pages. Around
them sit field notes filed under a service code rather than a service name, incident
runbooks that name a service without answering anything about it, a service index, and
weekly change logs. Several of those exist to be near misses, which is what makes the
ranking part of this worth doing.

`corpus/c01-dev-queries.json` holds 36 development queries with graded judgements:

```python
{"id": "dev-00", "query": "how often is the ledger reconciler restarted",
 "relevance": {"hb-00-0": 3, "hb-00-5": 2, "hb-00-6": 2, "rb-00": 1, "rb-48": 1}}
```

Grade 3 means the document states the answer, 2 means the same service on a
cross-referenced aspect, 1 means the service and the aspect are named in passing with no
answer given, and a document id absent from the map is graded 0. The judgements file
records how they were produced. Read it before you argue with one of them.

The development queries are yours to tune against. They are not the queries you will be
scored on: the grader runs a different set of the same size over the same collection, so a
number your own run prints is an estimate.

## the interface

Put this at `work/retrieval.py`. The names and the argument order are fixed, since the
grader imports them.

```python
def build_index(documents: list[dict]) -> dict: ...
def search(index: dict, query: str, k: int) -> list[str]: ...
def recall_at_k(ranked_ids: list[str], relevant_ids: set[str], k: int) -> float: ...
def ndcg_at_k(ranked_ids: list[str], relevance: dict[str, int], k: int) -> float: ...
def reciprocal_rank(ranked_ids: list[str], relevant_ids: set[str]) -> float: ...
```

`build_index` receives the documents as they are in the corpus file and returns whatever
your scorer needs to read later. The shape of that dict is yours; it is handed straight
back to `search`. `search` returns at most k document ids, best first, with no repeats and
nothing that was not indexed. Returning fewer than k is allowed when fewer documents score
above zero.

The three measures take a ranking that has already been produced, so none of them may look
at the index or at the collection. Four behaviours are pinned, because the grader tests
them:

- `recall_at_k` divides by the number of documents judged relevant, including any the
  ranking never returned. It returns 0.0 when nothing is judged relevant, and 0.0 when k is
  not positive. A cutoff past the end of the list is not an error.
- `ndcg_at_k` reads gain off the grade, discounts the document at rank r by log2(r + 1),
  and normalises against the same judgements sorted highest first and cut at the same k. A
  document id absent from the relevance map is graded 0. It returns 0.0 when the ideal gain
  is 0 and when k is not positive.
- `reciprocal_rank` returns one over the 1-based rank of the first relevant result, and 0.0
  when there is none. Nothing after that document affects it.
- Every one of them returns a float and none of them raises on an empty list.

Write `work/NOTES.md` alongside the code, half a page or so, answering four things:

1. Your retriever's precision at 10 on the development queries, and why that number and
   recall at 50 disagree about how good it is.
2. Which cutoff you would report if this collection were behind a lookup tool where the
   user wants one answer, and which measure you would report with it.
3. The development query your retriever does worst on, what the ranking got wrong, and
   what grades the documents it missed were carrying.
4. What changes in your three numbers if the judgements are flattened to relevant or not
   relevant, and which of the measures cannot tell the difference.

## how it is scored

The grader imports `work/retrieval.py`, runs its own measure cases against your three
measures, then builds your index over the whole collection and calls `search(index, query,
50)` once per held-out query. Both retrieval numbers are read off that one list: recall at
50 over the whole of it, nDCG at 10 over its first ten. The retrieval numbers are computed
with the grader's own measures, so a mistake in yours cannot move them, and a good
retriever cannot cover for them.

| metric | bar |
|---|---|
| `metric_cases_passed` | 1, meaning every measure case, not most of them |
| `ndcg_at_10` | at least 0.4, averaged over the held-out queries |
| `recall_at_50` | at least 0.75, averaged over the held-out queries |

The measure cases cover the ordinary case, the cutoff boundaries, the empty inputs, and the
two distinctions chapter 3 spent the most time on: a ranking that recall cannot tell apart
from another one, and a pair of runs that reciprocal rank scores identically.

Both retrieval bars were set by running the collection against a weighted lexical ranker.
Ranking by unweighted word overlap gets close to the nDCG bar on this collection and falls
a long way short of the recall one, which is the shape of result worth expecting: the
headline number at a shallow cutoff hides a lot of what a ranking is doing further down.
Chapter 2 named the two things weighting has to account for: how rare a term is in the
collection, and how long the document is. The exact function is your decision and the
write-up is where you defend it.

## rules

Python 3, standard library only. There is nothing to install and nothing to download, and
the grader runs with no network. Keep the whole run well under a minute: indexing 522 short
documents and answering 36 queries is not a performance problem unless you rescore the
collection from scratch on every query.

## what you get to start

`starter/retrieval.py` is the interface with the docstrings and no bodies. Copy it to
`work/retrieval.py` and fill it in. `starter/selfcheck.py` runs six worked examples of the
three measures, with the arithmetic each expected value comes from written out, so you can
pin the definitions before you go near the collection. `starter/report.py` scores your
retriever over the development queries and prints the mean of each measure; give it a query
id and it prints that query's top 20 with the grade of each result and lists the relevant
documents that fell outside the cutoff. That last listing is the fastest route to
understanding why a ranking is losing recall.
