# Rubric

100 points. The three metrics decide whether the submission passes at all; these criteria
decide what it is worth. A submission that clears every bar with code nobody can follow and
a write-up that repeats the brief back does not score well here, and neither does a careful
write-up attached to a retriever that does not run.

## Ranking function, 25 points

Full credit is a lexical scorer that weights a term by how rare it is in the collection and
accounts for document length, applied consistently at index time and query time.

- The weight of a term falls as the number of documents containing it rises, computed from
  the collection rather than hard-coded.
- Repeating a term in a document raises its score by less each time, or the write-up says
  why the submission does not do that and what it does instead.
- A long document is not favoured purely for being long. The service index and the change
  logs in the collection are there to punish a scorer that skips this.
- The tokeniser is one function used by both `build_index` and `search`, so a query token
  and a document token are produced the same way. Markdown punctuation and heading marks
  do not end up as terms.
- Whatever the choice of ranking function, the write-up names it and says what its
  parameters do.

## The three measures, 25 points

Full credit is three functions that match the definitions in the brief on every case,
including the ones the grader does not print.

- The discount divides the document at rank r by log2(r + 1), so rank 1 is undiscounted.
  An off-by-one here produces plausible numbers and is the single most common way to get
  nDCG wrong.
- The ideal ranking is built from the judgements sorted highest first and cut at the same
  k, not from the full judgement list and not from the documents the run returned.
- Gain comes from the grade. A measure that treats grade 3 and grade 1 as the same thing
  has thrown away what graded judgements are for.
- Recall divides by every relevant document, including those the run never returned, so a
  short result list cannot inflate it.
- Empty inputs, a non-positive cutoff, a cutoff past the end of the list, and a judgement
  map with no relevant documents in it all return a float rather than raising or dividing
  by zero.

## Index and search behaviour, 15 points

Full credit is an index built once and read many times, and a `search` that honours its
contract exactly.

- The work that depends only on the collection happens in `build_index`. Rescoring every
  document from raw text on each query is the failure this criterion is looking for.
- `search` returns at most k ids, best first, without repeats, and every id is one that was
  indexed.
- Ties are broken deterministically, so two runs over the same index return the same list.
- A query whose terms are absent from the collection returns an empty list rather than
  raising.

## The write-up, 25 points

Full credit is `work/NOTES.md` answering the four questions in the brief with numbers from
this collection, not with what the chapters said in general.

- Precision at 10 and recall at 50 are both reported, and the answer says what each one
  counts and why they disagree about the same run. Six points.
- The cutoff recommended for a one-answer lookup is named together with the measure that
  suits it, and the answer says what that measure stops reading. Six points.
- One named development query is examined: what ranked above the relevant documents, what
  grades the missing documents carried, and what property of the collection or of the
  scorer caused it. Naming the query without diagnosing it is half credit. Seven points.
- The effect of flattening the judgements to relevant or not relevant is worked out on this
  collection, and the answer identifies which of the three measures cannot see the
  difference. Six points.

## Code a reviewer can follow, 10 points

Full credit is code that a colleague could change safely a month later.

- Names say what the value is. A comment where the reasoning is not obvious from the code,
  and none where it is.
- The ranking constants are named and set in one place rather than appearing as bare
  numbers inside the scoring loop.
- No dead scaffolding, no commented-out earlier attempt, no debugging prints left in the
  functions the grader imports.
