# Stage: verify

Runs after the validator passes with no errors and no warnings. Ends with every chapter
carrying both verdicts and the topic at `verified`, or with a list of what has to be
revised first.

The validator has already checked everything a program can check. This stage is the two
questions it cannot answer: whether the claims are carried by the sources, and whether the
chapter teaches.

## Before anything

```
npm run validate -- topics/<slug> --strict
npm run forge -- status <slug>
```

Both agents run against material that already validates. Auditing a chapter that still has
a citation-density error wastes the audit, because the chapter is going to be rewritten
anyway.

If the topic is not yet `validated`, promote it first:

```
npm run forge -- promote <slug>
```

Verified sits above validated and the CLI will refuse to skip the step. That is deliberate:
two agents liking the material is not a route around the mechanical check.

## The worklist

Every chapter needs one audit and one critique. Read what is already done off disk rather
than tracking it here:

```
npm run forge -- verify <slug>
```

Run with nothing written yet, it reports every chapter as `pending` for both and stamps
nothing. That listing is the worklist, and it is also how you resume after a dead session.

## Running the agents

For each chapter, two agents, and they are independent. `forge-auditor` writes
`.forge-cache/<slug>/verdicts/<chapterId>.audit.json`. `forge-critic` writes
`.forge-cache/<slug>/verdicts/<chapterId>.critique.json`.

Launch at most three at once, and prefer three of the same kind over one chapter's pair,
so a bad prompt shows up in three files rather than being masked by its partner passing.

Each agent needs its inputs named explicitly in the prompt. The auditor gets the chapter
path, the `sources.json` path, and its output path. It gets nothing else, and in particular
it does not get told what the chapter was trying to say or why a claim is correct, since a
grader shown the case for a claim grades the case.

The critic gets the chapter path, `concepts.json`, the earlier chapters' titles and taught
concepts, the chapter's quiz, the challenges that follow and what they exercise, and its
output path.

Neither agent has a shell and neither can reach the web. The auditor rules against excerpts
already pinned in `sources.json`; if a claim needs a source nobody pinned, that is the
finding, not a reason to go looking.

## Stamping

```
npm run forge -- verify <slug>
```

This reads the verdict files and writes the audit blocks. What it does, so that a surprise
is recognisable as a bug rather than as the tool being opinionated:

- derives the faithfulness verdict from the rulings, passing only when every claim is
  `supported`
- derives the critique verdict from the findings, passing only when none is `blocking`
- resolves every marker an audit names and confirms the quoted span appears in that
  excerpt, ignoring whitespace and case
- rejects the whole of a chapter's audit if any span does not appear, and stamps nothing
- stamps nothing for a chapter until both agents have ruled, so a half-audit cannot look
  finished
- sets the topic to `verified` once every chapter is verified, if the topic is already
  `validated`

A rejected span is not a retry-the-same-way situation. It means the audit quoted something
the source does not say, which is the one failure that makes an auditor worse than nothing.
Re-run that chapter's auditor and say plainly in the prompt that a previous run quoted a
passage that did not resolve.

## When a chapter fails

A failed chapter is a revision, not an argument with the agent. The verdict file names what
is wrong.

- `unsupported` or `contradicted` claims: the prose is wrong, or the wrong marker is
  attached, or the research never covered the point. The first two are chapter edits. The
  third means the chapter is claiming something nobody sourced, and the honest fixes are to
  cut the claim or to go back to the research stage.
- `overstated` claims: almost always the house style flattening a qualified source. The fix
  is to state the narrower thing the source actually supports, not to add a hedge. "Above 11
  newton metres the fastener yields" instead of "over-torque may cause problems".
- a claim worth keeping at its current precision even though no pinned excerpt carries it
  that precisely, and neither narrowing nor a return to research is worth the cost: say so
  in the chapter, as a fact about the sourcing rather than a hedge about the claim. Name what
  the pinned excerpt does and does not establish, and point at where a reader could confirm
  the rest themselves. This is the same move the contract already asks for when sources
  disagree with each other (the `contested-evidence` and `evidence-gap` shape); it is not a
  new category, only that shape applied to a source that is thin rather than one that
  conflicts. It is an editorial call the owner makes claim by claim, not a default an agent
  reaches for on its own, and the resulting sentence still has to pass the next audit on what
  it now actually says.

  A disclaimer does not neutralise the sentence it follows. Naming a claim as unconfirmed
  and then restating the claim anyway still leaves the restatement itself uncited and
  gradeable, and it fails the same way an unmarked sentence always does. The version that
  passes narrows what is actually said down to what the excerpt supports plus the fact of
  the gap, and drops the unconfirmed mechanics rather than keeping them company with a
  caveat. One round of this stage caught exactly that shape: a hedge added next to a claim
  the source did not carry, ruled `unsupported` on the next pass for the same reason the
  original did.
- `blocking` critique findings: fix the named defect. Read the `keep` list first, because a
  revision that fixes an ordering problem and loses the one worked example that made the
  chapter land has not improved anything.

After revising, delete that chapter's verdict files and run the agent again. A stale
verdict describing a chapter that no longer exists is worse than no verdict. On round one,
delete both files and run both agents. On round two and three, delete and re-run only the
agent whose finding drove the revision; the other agent's passing verdict from round one
still describes the untouched parts of the chapter, and re-running it too would pay full
price to relearn what it already ruled.

**Round one audits the whole chapter. Round two and three audit the fix, not the chapter
again.** Full re-decomposition costs the same whether the revision touched one sentence or
ten, because it re-quotes and re-rules every claim from scratch, and a chapter runs 30 to 70
claims. Name the exact sentence or clause that changed and what the fix was supposed to do,
and ask the agent to rule on that change plus its immediate paragraph, not the whole chapter.
It still needs the full chapter path and `sources.json`, since a claim's neighbours are part
of reading it in context, but it does not need to re-decompose material nowhere near the
edit. This is the fix for a cost that showed up concretely on 2026-08-16: one chapter took
four full-chapter audit rounds, each re-ruling 30-plus claims, to land three one-sentence
citation fixes. A scoped check on rounds two and three would have caught the same three
findings for a fraction of the tokens.

The trade this makes: a full re-pass sometimes catches something unrelated to the edit that
the previous round missed, which is real and documented below. A scoped pass will not. That
risk is the reason round one still audits everything, and the reason a chapter that fails all
three rounds gets reported to the owner rather than pushed through a fourth scoped pass that
was never going to see the whole picture anyway.

### Three rules that come from watching this loop fail to converge

**Cap it at three rounds per chapter.** The first run of this stage put one chapter through
three passes. It failed all three, on a different set of claims each time, while the claim
count rose from 32 to 40 on text that changed in one passage per round. A fourth round was
not going to land somewhere the first three had not. When a chapter fails a third pass, stop
revising and report it to the owner with all three verdicts, because at that point the
finding is about the material or the sources rather than about the prose.

A chapter can earn an extra round past the cap, but only on the owner's say-so and only for
a fix that is mechanical rather than a rewrite, such as attaching a marker that was already
correctly used elsewhere in the same paragraph. Ask before taking a fourth round; do not
decide on your own that a finding looks trivial enough to warrant one.

**Report findings; do not auto-fix and re-loop past round one.** Round one's findings get
fixed and re-audited without asking, since that is this stage's ordinary job. From round two
on, when an audit or critique finding is not a mechanical marker fix (see above), name the
finding to the owner and wait rather than fixing it and immediately spending another full
agent run to re-check. The chapters most prone to non-convergence are exactly the ones where
this saves the most: a chapter oscillating between findings is a chapter where the next fix
is least likely to be the last one.

**A critic asking for new material is asking for a claim.** The same run produced this in
one loop: the critic asked for a correspondence to be stated because a quiz question turned
on it, a writer added the sentence citing the nearest excerpts, and the next auditor ruled
it `unsupported` because nothing pinned actually carried it. Before acting on a critique
finding that calls for something new to be said, check `sources.json` for an excerpt that
carries it. If none does, the honest options are to go back to the research stage or to cut
the quiz question that depends on it. Writing the sentence and hoping produces a chapter
that fails the next audit, which is how a loop like this stops converging.

## Done

`forge verify` reports every chapter verified and the topic at `verified`. Re-run the
validator once more afterwards, because stamping rewrote frontmatter:

```
npm run validate -- topics/<slug> --strict
```

Then report to the owner: chapters verified, total claims audited, the ruling distribution
across the topic, and anything you left as advisory. The ruling distribution is worth
reporting even when everything passed, because a topic with a hundred claims and zero
`overstated` and zero `contradicted` across the whole book is a result to be suspicious of
rather than pleased about.
