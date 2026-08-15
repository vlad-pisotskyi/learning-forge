# Chunk a corpus and defend the choice

Chapter 4 showed what happens when somebody measures a chunking strategy, and
chapter 5 showed where the numbers everyone repeats actually came from. This
challenge closes the gap between the two. You build a chunker, you build the
token-level scoring that makes different chunk sizes comparable, you run both
over a grid of settings, and then you write down which setting you would ship
and what evidence you have for it.

There is no correct chunk size in this challenge and none is being withheld from
you. What is being scored is whether the number you pick came from a measurement
you ran, and whether you can say what that measurement does not cover.

## the units

Everything counts tokens, and a token is a run of non-whitespace characters:
`re.findall(r"\S+", text)`. `textutil.py` in the starter defines it once and
everything else agrees with it.

A span is a half-open pair of token positions. `(0, 4)` is the first four
tokens, `(4, 4)` is empty, and a document with no tokens has no spans. Character
offsets appear nowhere in this challenge, and the relevance labels in the corpus
were counted the same way.

## the interface

`work/chunking.py` exports these four names. The evaluation set imports them
directly, so the names and the argument order are fixed.

```python
def chunk_fixed(text: str, size: int, overlap: int) -> list[tuple[int, int]]
def token_recall(retrieved: list[tuple[int, int]], relevant: list[tuple[int, int]]) -> float
def token_iou(retrieved: list[tuple[int, int]], relevant: list[tuple[int, int]]) -> float
def sweep(text: str, sizes: list[int], overlaps: list[int], queries: list[dict]) -> list[dict]
```

### chunk_fixed

Chunks hold `size` tokens and repeat `overlap` tokens across each boundary, so
consecutive chunks start `size - overlap` apart. The first chunk starts at
position 0. The last chunk is cut short at the end of the document rather than
padded, and once a chunk reaches the end of the document there are no further
chunks: with ten tokens, a size of 4 and an overlap of 2, the chunk starting at
6 already ends at 10, and a chunk starting at 8 would sit entirely inside it.

Raise `ValueError` unless `size` is positive and `0 <= overlap < size`. An
overlap equal to the size describes a chunker that never advances, which is a
bug in the caller and not a configuration to honour.

### token_recall and token_iou

Both take two lists of spans and reduce each list to the set of token positions
it covers. Recall is the share of the relevant positions that the retrieved
spans cover. IoU is the size of the intersection divided by the size of the
union of both sides.

Reducing to positions before counting is the whole point, and it is the step
that is easy to skip. Overlap means retrieved chunks share tokens, so adding up
span lengths counts the shared positions once per chunk. That inflates recall
past 1.0 and drags IoU down as overlap rises even when nothing new came back.

Return 0.0 from `token_recall` when nothing is labelled relevant, and 0.0 from
`token_iou` when both sides are empty.

These two exist as a pair for a reason chapter 4 gives directly. Retrieving the
entire document scores a recall of 1.0 on every query and settles nothing. IoU
is what makes that answer look like what it is.

### sweep

One record per `(size, overlap)` pair, holding at least the keys `size`,
`overlap`, `token_recall` and `token_iou`. The last two are the plain means over
the query list, and an empty query list gives 0.0 for both rather than an error.
Pairs where `overlap >= size` are skipped, not raised on, so a caller can hand
you a rectangular grid without pre-filtering it. Extra keys are fine.

Retrieval inside the sweep is fixed and comes from `retrieval.py` in the
starter: chunks score one point per distinct query term they contain, ties go to
the earlier chunk, chunks scoring zero are dropped, and the top `TOP_K` chunks
are returned. `TOP_K` is 3. The ranker is deliberately crude and it is held
constant so that a difference between two rows of your sweep has one cause. Do
not edit that file; the evaluation set applies the same rule from its own copy.

Each query is a dict with a `terms` list and a `relevant` list of spans, so a
sweep row is built as
`top_chunks(normalised_tokens(text), spans, query["terms"], TOP_K)` and then
scored with your two metric functions.

### chunk_semantic

Also write `chunk_semantic(text, max_size)` in the same file, splitting on
boundaries you detect in the content instead of on a token counter, with
`max_size` as the ceiling no chunk exceeds. The evaluation set does not import
it. The written defence needs a second strategy to put next to the fixed-size
baseline, and chapter 4 is specifically about what happened when somebody
compared the two.

## the corpus

`corpus/c02-corpus.json` holds two documents and seventeen queries.

The first document is a handbook written in long paragraphs. The second is a
maintenance log written as short dated lines. They are deliberately different
shapes, because a chunk size that suits one of them is not automatically the
right size for the other.

Each query carries the terms the ranker matches on and the token spans a reader
judged relevant. Some answers sit in a single sentence, some run across two
sentences where only the first shares vocabulary with the question, and a few
have relevant text in two places in the document. `corpus.py` in the starter
loads the file and converts the labels to tuples.

## the written defence

Fill in `work/defence.md`. The skeleton in the starter names the sections. It
has to contain, at minimum:

- the grid you ran, the documents, the query counts, and the value of k
- the size and overlap you would ship, argued from rows of your own table, with
  what you gave up on the other measure
- a setting that wins on one of the two documents and loses on the other, with
  both numbers
- what your boundary-based chunker scored next to fixed-size chunking at a
  comparable chunk size, and whether the difference pays for the extra work
- at least two published chunk size recommendations from chapter 5, run through
  your sweep at the nearest equivalent settings, with what they scored here and
  whether the source that published each one shipped a measurement alongside it
- what this experiment does not establish

Numbers in that document come from runs you did. A number you did not measure is
worth what chapter 5 says it is worth.

## how it is scored

The evaluation set runs your four functions against a held-out document and its
own labelled queries, over chunk sizes from 32 to 256 tokens and overlaps from 0
to 32.

| metric | threshold |
|---|---|
| `span_cases_passed` | 1 |
| `token_recall` | 0.8 |
| `token_iou` | 0.15 |

`span_cases_passed` is the fraction of the behaviour cases your implementation
gets right, covering the chunk boundaries, both metrics, and the sweep records,
so the threshold of 1 means every one of them. `token_recall` and `token_iou`
are the best mean values your code reaches anywhere on that grid, with your
chunker and your metric functions doing the work and the ranker held constant.
The best recall and the best IoU are read off separately, and on a corpus like
this one they will not be at the same grid point.

Those three numbers are the floor. The rubric is where the defence is scored,
and it is in `rubric.md` for you to read before you start.

## constraints

Python 3, standard library only. Nothing else is installed where this runs.

Copy everything from `starter/` into `work/` and implement `chunking.py` there.
`run_sweep.py` prints your sweep as a table once `sweep` returns records.
