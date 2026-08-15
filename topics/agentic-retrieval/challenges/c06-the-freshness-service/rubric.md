# Rubric: build a corpus freshness service

The four metrics decide whether the service works. This decides whether the reasoning
behind it holds. Weights sum to 100.

## the digest and the four buckets (20)

Full credit gives `content_digest` a body whose output depends on the entire text, not
on a shortcut like length or a small sample of characters, so two same-length,
different-content documents get different digests. `detect_changes` sorts every
document id into exactly one bucket, decides changed versus unchanged purely by
comparing digests, and treats a page-count difference on otherwise identical text as
no change at all. Every list comes back sorted by id.

Points come off for a digest that collides on inputs an actual hash would not, for a
change decision that also looks at `pages`, and for buckets built in an order that
happens to match the input dict rather than being sorted deliberately.

## the reconversion budget and its stopping rule (25)

Full credit builds the candidate list as added documents followed by changed
documents, in the order each arrives, and says in a comment or docstring why added
comes first: a document with nothing converted yet cannot be answered from at any
price, where a changed document still has a stale copy sitting in the corpus. The
running-total walk stops at the first candidate that does not fit and leaves every
later candidate out too, rather than reaching past it for a cheaper one. Every skipped
entry carries the literal reason `"insufficient budget"`. The boundary case, a
candidate whose cost lands exactly on the remaining budget, is kept.

Points come off for a version that packs the budget as tightly as possible by
reordering candidates by cost, for a version that keeps checking candidates after one
has failed to fit, and for a reason string that varies by candidate when the brief
pins one string for the one reason that exists here.

## scoring a question against a snapshot (20)

Full credit treats a missing document as an automatic zero with no checks evaluated,
matches each check against the document text after folding case and collapsing
whitespace on both sides, and scores a question as the fraction of its checks that
pass. A question with no checks scores `1.0` when its document is present, and the
submission says why: there is nothing left for it to fail.

Points come off for a substring test that is case-sensitive or whitespace-sensitive
where the brief says to normalise, and for a missing-document path that raises instead
of returning a zero score.

## separating what moved from why it moved (25)

Full credit decides a question's category by checking document presence before
comparing scores, so a document that disappeared between snapshots is
`"doc-disappeared"` even though its score also dropped to zero, and a document that
newly appeared is `"doc-appeared"` even though its score also rose. Only once presence
is unchanged does the code compare scores, with a tolerance around equality rather than
exact floating-point comparison, to land on `"stable"`, `"improved"`, or `"regressed"`.
`staleness_report` raises when the two inputs do not cover the same question ids, and
the summary counts add up to the number of questions scored.

Points come off for a category decided by score movement alone, which collapses the
distinction chapter 16 is built around, for a missing or silent failure on mismatched
question sets, and for a summary that is computed separately from the per-question
categories rather than tallied from them.

## reading the tradeoff honestly (10)

Full credit explains, in a comment, docstring, or the code's own structure, what the
reconversion budget is actually trading off: a fixed number of pages a dollar buys, set
against documents that differ in how badly their staleness has already cost the
questions depending on them. It does not claim the budget policy here is optimal for
every corpus, and it does not conflate the offline replay this challenge builds with a
measurement of what users actually experienced, which chapter 16 is explicit is a
separate, unconnected mode of measurement.

Points come off for treating a passing `replay_cases_passed` score as evidence about
live user outcomes, and for a plan_reconversion policy with no stated reasoning for why
documents are ordered the way they are.
