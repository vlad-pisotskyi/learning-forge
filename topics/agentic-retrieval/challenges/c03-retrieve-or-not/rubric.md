# Rubric: decide whether to retrieve, then choose what to keep

The four metrics decide whether the agent works. This decides whether the code is worth
keeping and whether the reasoning behind it holds. Weights sum to 100.

## the criterion as chapter eight transcribes it (25)

Full credit implements the 1998 criterion with the parentheses where the paper prints
them, so lambda multiplies the whole bracket rather than the relevance term alone, and
says in a comment or a docstring that this is the printed form and that it differs from
the rendering most secondary sources carry. Selection is incremental: the novelty term is
recomputed against the growing selected set rather than fixed once before the loop.
Novelty is the largest similarity to any single selected passage, not the average over
them, which is the reading the printed formula supports and the one that penalises a
near-duplicate hardest.

Points come off for a version copied from a secondary source, for a sort over
precomputed scores in place of a greedy selection, and for silently repairing the
endpoint behaviour the chapter names.

## the retrieval decision and its bar (20)

Full credit normalises over the values present in `retrieve_scores` rather than assuming
two of them, treats "surpasses" as strict so a step exactly on the bar does not clear it,
and refuses a query the loop has already run before it looks at any probability. The
query comparison folds case and collapses whitespace, so two spellings of one request are
one request. The threshold lives at module level with the other operating points, and the
code or its comments say what a threshold is: a number chosen from outside the model,
which lowering makes the system retrieve more often.

Points come off for hard-coding `scores["yes"] / (scores["yes"] + scores["no"])`, for a
comparison that lets an equal probability through, and for a repeat check done by exact
string identity.

## what earns a context slot (15)

Full credit drops a passage scoring at or below zero wherever it sits in the list, keeps
a passage that exactly fills the remaining budget, and stops at the first passage too
large to fit rather than skipping ahead to a smaller one. The reason for stopping is
stated: the list is in the order the reranker chose, so filling the leftover room means
taking a passage the ranker preferred less, and chapter seven priced what an unhelpful
passage in the context costs.

Points come off for a version that packs the budget as tightly as it can, and for a
budget check written so that a passage exactly on the boundary is thrown away.

## the loop, and the record it leaves (20)

Full credit calls the generator before it retrieves anything, retrieves only on a
decision, composes reranking and budgeting rather than appending whatever the retriever
returned, and refuses to hold the same passage twice. The returned dict carries all five
keys with the meanings the brief pins, and one decision per decision actually reached, so
a step that finished the loop records none. The loop terminates on `max_steps` without
relying on the generator to stop it.

Points come off for a loop that retrieves first and asks afterwards, for a decisions list
that is a running commentary rather than one entry per decision, and for passing the
loop's own passage list to the generator without a copy.

## the arithmetic and its edges (10)

Full credit hand-writes cosine similarity over lists of floats, computes each norm once
per vector rather than inside the inner comparison, and decides what a zero vector gives
back with a reason attached. Ties are broken by input position through a tolerance rather
than by comparing two floats for equality. A reader can tell from the code which of these
choices were made deliberately.

## reading the parameter honestly (10)

Full credit says what the lambda parameter does and stops there. It places the two
endpoints correctly, and it does not claim that some value produces better answers,
because chapter eight's last section is an absence: no source pinned in this topic
measures the effect of moving that parameter on answer quality across its range. A
submission that names the two costs the sources do state, that the parameter is
dataset-specific and needs tuning, and that a near-duplicate keeps a high relevance score
while barely moving an averaged novelty term, has read the chapter rather than skimmed
it.

Points come off for a comment recommending a value as though somebody had measured it,
and for treating a best-of-sweep result from one benchmark as a setting that transfers.
