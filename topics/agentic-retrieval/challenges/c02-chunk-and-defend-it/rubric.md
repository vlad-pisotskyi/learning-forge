# Rubric: Chunk a corpus and defend the choice

Weights sum to 100. The first three criteria score the code, the rest score the
argument in `work/defence.md`. A submission that passes every threshold and
ships no defence is a partial submission.

## the fixed-size chunker (15)

Full credit: `chunk_fixed` returns half-open token spans that cover the document
from position 0 to the last token with no gap; consecutive starts sit
`size - overlap` apart; the final chunk is truncated at the end of the document;
no chunk is emitted whose span already sits inside its predecessor; empty and
whitespace-only documents return an empty list; `ValueError` is raised when
`size` is not positive or `overlap` is outside `0 <= overlap < size`.

Partial credit: the ordinary case is right and one boundary case is not.

No credit: character offsets instead of token positions, or a chunker that drops
the tail of the document.

## the token-level metrics (15)

Full credit: both functions reduce each side to a set of token positions before
counting anything, so overlapping retrieved spans and overlapping relevant spans
each contribute their positions once. Recall divides by the relevant positions
and IoU divides by the union of both sides. The empty cases return 0.0 rather
than raising or returning `None`.

Partial credit: the metrics are right on disjoint spans and wrong when spans
overlap, which is the shape of the summed-lengths mistake.

No credit: a recall that can exceed 1.0, or an IoU that is recall under another
name.

## the sweep (10)

Full credit: one record per valid `(size, overlap)` pair with `size`, `overlap`,
`token_recall` and `token_iou`; pairs where `overlap >= size` are skipped rather
than raised on; scores are the means over the query list; an empty query list
gives 0.0; retrieval uses the ranker from `retrieval.py` unmodified.

Partial credit: the records are correct but the invalid pairs raise, or the
means are computed over a filtered subset of the queries without saying so.

## the boundary-based chunker (12)

Full credit: `chunk_semantic` splits on something read off the text, with the
rule stated in the defence: what signal marks a boundary, what threshold it
uses, and how `max_size` interacts with it. The defence reports what it scored
against fixed-size chunking at a comparable chunk size on both documents, and
takes a position on whether the difference is worth the extra computation.

Partial credit: the chunker works but the comparison is missing, or the
comparison is run at a chunk size that makes the two strategies incomparable.

No credit: a sentence splitter with a fixed sentence count, which is fixed-size
chunking with a different counter.

## the setting you would ship (15)

Full credit: one size and one overlap, named, with the rows of the learner's own
table that argue for them. The trade-off is stated in both directions: what the
choice costs on the measure it does not optimise, and at what point on the grid
the other measure would have won. The reasoning refers to numbers from the run,
not to a value recalled from a source.

Partial credit: a setting is chosen and the table is present, but the cost on
the other measure is not named.

No credit: a setting copied from chapter 5 with the sweep table attached as
decoration.

## corpus dependence (12)

Full credit: at least one setting is identified that wins on the handbook and
loses on the log, or the reverse, with both numbers quoted. The defence says why
the two documents behave differently, in terms of what is actually different
about them: paragraph length, where in a passage the query vocabulary sits, how
much text an answer needs around it. The conclusion drawn is about transferring
a chunk size between corpora, not about which of the two documents is better.

Partial credit: the disagreement is reported but not explained.

## published defaults against measurement (13)

Full credit: at least two of the recommendations from chapter 5 are run through
the sweep at the nearest settings this corpus supports, with the scores
reported. For each, the defence says whether the publishing source shipped a
measurement with the number and what that measurement was, or states that no
measurement was published with it. The difference between a number somebody
measured and a number somebody recommended is applied to specific sources rather
than asserted in general.

Partial credit: the settings are run and scored, but the sources are treated as
interchangeable authorities.

No credit: repeating chapter 5's conclusion without running anything.

## the scope of the result (8)

Full credit: the defence names what the experiment does not establish. Two
documents from one institution, one crude lexical ranker, one value of k, one
query set with labels written by one person, and a metric pair that scores which
tokens came back rather than what a model then wrote from them. The scoping
picks out the limits that actually bear on the conclusion instead of listing
every caveat available.
