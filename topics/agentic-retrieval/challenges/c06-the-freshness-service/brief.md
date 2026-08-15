# Build a corpus freshness service

A corpus is not converted once. Chapter 13 and chapter 15 both priced conversion per
page, and a price per page only matters if the corpus keeps changing after the first
pass: documents get edited, documents get added, documents get pulled. Somebody has to
notice which is which, decide what gets re-converted when the budget will not cover
everything, and then check whether the re-conversion actually mattered to the answers
the system gives. That last step is chapter 16's offline replay, aimed at a new target.

Five functions in `work/freshness.py`, and the last two are the payoff.

```python
content_digest(text: str) -> str
detect_changes(previous: dict, current: dict) -> dict
plan_reconversion(changes: dict, cost_per_page: float, budget: float) -> dict
replay_scores(questions: list[dict], corpus: dict) -> dict
staleness_report(before: dict, after: dict) -> dict
```

Python 3, standard library only.

## the shapes everything travels in

A corpus snapshot is a dict mapping a document id to a small record:

```python
{"text": "Quota resets every Monday at 09:00 local time.", "pages": 1}
```

A question is a dict naming the document it depends on and what a correct answer has
to contain:

```python
{"id": "q-quota", "doc_id": "handbook-quota", "checks": ["resets every Monday"]}
```

`checks` stands in for a generator the challenge does not ask you to build. Instead of
scoring a free-text answer, you check whether the supporting document still contains
what the answer would have to be grounded in, the same move olmOCR 2 makes when it
scores a page against checkable assertions instead of against one fixed string.

## content_digest

A stable digest of a document's content. Calling it twice on the same text returns the
same string both times. Two texts that differ anywhere return different strings. The
digest has to depend on the whole content, not on its length: two same-length texts
that differ have to produce different digests, and this is checked directly.

## detect_changes

Compare two snapshots, `previous` and `current`, and sort every document id into
exactly one of four buckets.

```python
{
    "added": [{"id": ..., "pages": ...}, ...],     # in current, not in previous
    "changed": [{"id": ..., "pages": ...}, ...],   # in both, digests differ
    "removed": [id, ...],                          # in previous, not in current
    "unchanged": [id, ...],                        # in both, digests match
}
```

`added` and `changed` carry the current snapshot's page count, because that is what a
re-conversion of that document would cost. `removed` and `unchanged` are plain lists of
ids. All four lists are sorted by id.

The digest decides changed versus unchanged, and nothing else does. Two snapshots can
disagree about a document's page count while agreeing on its digest, and that document
is unchanged: a metadata correction is not a content edit, and the corpus this teaches
you to distrust is one where re-fetching the same document and getting the same digest
back is read as a change anyway.

## plan_reconversion

`changes` arrives shaped like `detect_changes`'s return value. Build one candidate list
by taking `changes["added"]` in the order it arrives, followed by `changes["changed"]`
in the order it arrives. Added documents are considered first, because a document with
no prior conversion at all cannot be answered from at any cost, where a changed
document at least has a stale version still sitting in the corpus.

Walk that list once, keeping a running total. A candidate's cost is
`pages * cost_per_page`. Keep the candidate, and add its cost to the running total, as
long as doing so does not push the total past `budget`, with a tolerance of about
`1e-9` so a document that lands exactly on the boundary is kept rather than dropped.
The first candidate that would push the total over the budget is left out, and so is
every candidate after it, whatever they would have cost individually: the list is in
priority order, and reaching past a document that does not fit to grab a cheaper one
further down spends the budget on the thing the priority order ranked lower.

Return:

```python
{
    "convert": [{"id": ..., "pages": ..., "cost": ...}, ...],
    "skipped": [{"id": ..., "pages": ..., "cost": ..., "reason": "insufficient budget"}, ...],
    "spent": ...,      # sum of the cost of everything converted
    "budget": ...,      # echoed back
    "remaining": ...,   # budget minus spent
}
```

`"insufficient budget"` is the literal string every skipped entry carries. There is
only one reason a candidate is ever left out here, and naming it the same way every
time is what makes the plan a thing a person can act on rather than a black box that
dropped some documents.

## replay_scores

Score a fixed question set against one snapshot, without calling anything that
generates text. For each question:

If `doc_id` is not a key in `corpus`, the question scores `0.0` and its supporting
document is recorded as absent. No check can be evaluated against a document that is
not there.

Otherwise, match each string in `checks` against the document's `text`, folding case
and collapsing runs of whitespace on both sides before testing whether the check is a
substring of the text. The question's score is the fraction of its checks that match:
zero checks passing scores `0.0`, all of them scores `1.0`. A question with no checks
at all scores `1.0` when its document is present, since there is nothing left for it to
fail.

Return one entry per question:

```python
{
    "q-quota": {
        "score": 1.0,
        "doc_present": True,
        "checks_passed": 1,
        "checks_total": 1,
    },
    ...
}
```

## staleness_report

Take two outputs of `replay_scores`, `before` and `after`, produced by scoring the same
question set against two different snapshots, and explain what happened to each
question. Raise `ValueError` if the two do not cover the same set of question ids.

For every question, decide one category, in this order:

- the document was present in `before` and absent in `after`: `"doc-disappeared"`
- the document was absent in `before` and present in `after`: `"doc-appeared"`
- otherwise, the two scores are equal within `1e-9`: `"stable"`
- otherwise, the score went up: `"improved"`
- otherwise: `"regressed"`

Presence is decided before score. A question whose supporting document vanished scores
zero for a reason that has nothing to do with whether the corpus still contains a
correct answer somewhere, and folding that into `"regressed"` erases the distinction
chapter 16 spends its second half building: whether a number moved because the answer
changed, or because the thing the answer stood on moved out from under it.

Return:

```python
{
    "questions": {
        "q-quota": {
            "before_score": 1.0,
            "after_score": 1.0,
            "before_doc_present": True,
            "after_doc_present": True,
            "category": "stable",
        },
        ...
    },
    "summary": {
        "stable": ...,
        "improved": ...,
        "regressed": ...,
        "doc-appeared": ...,
        "doc-disappeared": ...,
    },
}
```

`summary` counts each category across every question, and the five counts add up to
the number of questions scored.

## the corpus

`corpus/c06-snapshots.json` holds a before snapshot and an after snapshot of a small
handbook, four documents on one side and four on the other, with one edited, one
removed, one added, and two left alone, plus a matching set of five questions.
`dev_check.py` in the starter runs your five functions over it end to end and prints
what came out at every stage. It is small enough to check by hand, which is the point:
what you are scored on is a different pair of snapshots with its own questions, so
tuning your reasoning to this one snapshot tunes it to the wrong thing.

## how it is scored

| metric | bar | what it covers |
|---|---|---|
| `digest_cases_passed` | 1.0 | the properties `content_digest` has to hold |
| `change_cases_passed` | 1.0 | `detect_changes` across all four buckets, and their ordering |
| `budget_cases_passed` | 1.0 | `plan_reconversion`'s priority order, its boundary, and its stopping rule |
| `replay_cases_passed` | 0.9 or better | `replay_scores` and `staleness_report`, including the five categories |

The first three have no slack: each is arithmetic with one right answer per case. The
last one covers the pair that does the actual measuring, and it is where a hidden
snapshot pair with its own before-and-after story is replayed through both functions
in sequence, the same shape `dev_check.py` walks you through on the development
snapshot.
