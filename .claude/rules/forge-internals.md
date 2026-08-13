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

## The role templates

The three role skills are stamped, not authored per topic:
`.claude/skills/forge-generate/templates/{teach,help,judge}.md` with `<<SLUG>>` and
`<<TITLE>>` substituted by `stampTemplate`, written on every apply. Keep the
substitution set tiny. A template that embedded the chapter list would go stale the
first time the map changed, so the roles read `topic.json` at runtime instead.
`UNSTAMPED` catches a placeholder nobody substituted, which is otherwise a silent bug
in generated material.

The Helper and the Judge are `context: fork` skills bound to root-level agent types
(`topic-helper`, `topic-judge`, plus `topic-quiz-grader` for quizzes). They have to be
root-level: project agents are discovered by walking up from the working directory, so
an agent under `topics/<slug>/.claude/agents/` never loads for a session started at the
repo root.

## The verification handoff

The two verification agents write JSON, the CLI writes frontmatter. `chapterAuditSchema`
and `chapterCritiqueSchema` are that handoff, checkpointed one file per chapter per agent
under `.forge-cache/<slug>/verdicts/`, and `recordVerdicts` stamps the audit block from
them.

Neither schema carries a verdict or a count, and that is not an oversight. Both are derived
in `recordVerdicts`: faithfulness passes when every claim is `supported`, critique passes
when no finding is `blocking`. An agent that cannot write the word cannot write a pass over
its own contrary evidence, which is the same reason the quiz answers moved out of the
visible quiz file.

Field order in those schemas is load bearing. `quote` precedes `ruling` and `detail`
precedes `severity`, because a model emitting JSON emits it in field order, and writing the
evidence before the verdict is the one judge mitigation with a clean measured effect. Do not
reorder them for tidiness.

`recordVerdicts` also resolves every marker an audit names and confirms the quoted span
appears in that excerpt. That check is the reason this layer is worth anything, so it fails
loudly: one invented quote discards the whole chapter's audit rather than that one claim.

## Source identity is the document, not the URL string

`sourceKey` in `forge-scaffold.ts` is what the merge folds on: host without `www.`,
path without a trailing slash or a `.txt`/`.html` extension, fragment dropped. Two
shards reaching one RFC through `/rfc/rfc3629` and `/rfc/rfc3629.txt`, or one living
standard through two anchors, found one source. Before this the merge compared URL
strings, and a real run produced four entries for two documents.

Keep it narrow. Folding two genuinely different sources into one is a worse failure
than leaving a duplicate visible on the page, so only spellings that name the same
document by construction collapse. `reconcile` then settles the disagreements
mechanically, taking the more precise date, the later retrieval, the less flattering
`primary`, so that a shard disagreeing about whether a source is primary surfaces as
the validator warning it should be, rather than being decided by which shard sorted
first.

## Two conventions the code depends on

`.hidden/solution/` mirrors `work/`, so `referenceEntrypoint` can map an entrypoint to
the file the reference has to occupy. `forge eval --reference` relies on that mapping to stage the
reference where the evaluation set imports it; break the convention and proving a
challenge solvable becomes impossible again.

A stub is any file containing `forge:stub`. `statusOf` treats the marker as "unwritten"
and `applyPlan` treats it as "safe to overwrite", so the marker is the only thing
separating a file an author owes from a file an author finished.

## What apply is allowed to overwrite

Plan-derived files are rewritten on every apply, because the plan is their only
source of truth. Authored files are never overwritten once they hold content. The
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
