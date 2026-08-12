---
paths:
  - "tools/src/forge.ts"
  - "tools/src/forge-plan.ts"
  - "tools/src/forge-scaffold.ts"
  - "tools/test/forge.test.ts"
  - ".claude/skills/forge-generate/**"
  - ".claude/agents/forge-*.md"
description: The split between the generator's deterministic half and its model half, and what belongs on each side.
---

# Inside the generator

The generator is deliberately two halves, and most bugs here are a decision landing
on the wrong side of the line.

**The CLI decides everything a program can decide.** The directory tree, source ids,
`order`, quiz paths, challenge manifests, which files still owe content. If a model
has to remember a convention, the convention is in the wrong place.

**The model decides everything that needs judgement.** Chapter sequence, concept
boundaries, which excerpt supports which claim, prose, questions, briefs, evaluation
cases.

## The plan holds decisions only

`topicPlanSchema` in `forge-plan.ts` carries no path, no filename, and no `order`.
Every one of those is derived in the `paths` object or in the `*FromPlan` functions.
A field that can be derived is a field that can disagree with itself, so adding one
to the plan is a regression even when it is convenient.

## Two conventions the code depends on

`.hidden/solution/` mirrors `work/`, so `referenceEntrypoint` can map an entrypoint to
the file the reference has to occupy. `forge try` relies on that mapping to stage the
reference where the evaluation set imports it; break the convention and proving a
challenge solvable becomes impossible again.

A stub is any file containing `forge:stub`. `statusOf` treats the marker as "unwritten"
and `applyPlan` treats it as "safe to overwrite", so the marker is the only thing
separating a file an author owes from a file an author finished.

## What apply is allowed to overwrite

Plan-derived files are rewritten on every apply, because the plan is their only
source of truth. Authored files are never overwritten once they hold content — the
most `apply` does to a written chapter is refresh its frontmatter and leave the prose
alone. `generatedAt`, `topic.json.status`, and a chapter's `status` and `audit` block
are carried through from what is already on disk, because none of them are the plan's
to decide.

Files the plan no longer accounts for are reported as orphans and left in place.
Deleting authored prose because a map was revised is not a trade this code makes.

## Tests

`tools/test/forge.test.ts` derives its plan from `contract/fixtures/tiny-topic` and
asserts that a scaffolded tree plus the fixture's authored content satisfies the
contract with no findings. That test is why a mistake in `order`, a quiz path, or a
challenge manifest cannot ship quietly. Keep it derived rather than hand-copied, and
keep the overlay limited to what a model would actually write.

## The stage playbooks

Each stage file is written to be read alone, and the skill body says so. Detail
duplicated across two playbooks drifts; detail that belongs to one stage stays in
that stage's file. The skill's `description` loads at every session start, so it stays
one sentence.
