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
- `blocking` critique findings: fix the named defect. Read the `keep` list first, because a
  revision that fixes an ordering problem and loses the one worked example that made the
  chapter land has not improved anything.

After revising, delete that chapter's verdict files and run both agents again. A stale
verdict describing a chapter that no longer exists is worse than no verdict.

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
