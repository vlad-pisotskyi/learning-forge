# Plan: guards against instruction-set drift

Written 2026-08-14, after four stale sites were fixed by hand in `7451552`. This is a
plan of record and is frozen. If what got built ended up different, that difference is
the useful part and belongs in `docs/reference/`, not in edits here.

## The defect

Prose that describes code goes stale silently. Code that contradicts code fails a test.
That asymmetry is the whole problem, and this repo has roughly twenty-five prose files
under `.claude/` that steer every generation run.

Two commits caused four stale sites. `f773933` moved the primary-source warning from
firing on every secondary entry to firing only when secondary sources are a majority.
`88045dc` added the `report` source kind and scoped the missing-identifier warning to
`paper` and `book`. Neither touched the instruction set, so three playbook paragraphs and
the researcher's own brief kept describing a rule that no longer existed.

The consequence was not cosmetic. The researcher had been told that one secondary source
holds a topic at `draft` until it is replaced by the primary it describes. Acting on that,
it avoided a practitioner evaluation the topic needed, then filed a self-published one as
`paper` and inherited a warning that can never be cleared, because it was never told
`report` exists. A stale sentence in a brief produced a defect in the material.

The documented discipline did not fail. It was followed. `.claude/rules/contract-changes.md`
names four places to change in order, ending at the fixture, and says nothing about the
instruction set. Following it perfectly still produces this.

There is a sharper piece of evidence. `19edee8` was an explicit consistency pass: its own
message says it found nine misleading places after the python-runner change. While fixing
them it added the versioning rule to `contract-changes.md` and did not add itself to the
step list. The fix landed and the lesson did not, and the next two commits drifted in
exactly the same way. A repo that can notice a class of defect, correct nine instances of
it, and still not record the class is a repo relying on whoever happens to be paying
attention.

## Why no single guard is enough, and how to sort them

Four options were on the table. A widened rule that names the instruction set as a fifth
place. A test asserting the contract's enum members are documented. A named catalogue of
validator messages, each asserted documented. And cutting the restatement surface so
instruction files point at the contract instead of paraphrasing it.

Each covers a different slice, and the slices do not nest. But the reason to combine them
is not coverage, it is that they belong at different strengths, and the repo already knows
how to decide which. `forge sources --verify` is advisory rather than a gate because a
published document is not a string: list numbering comes from stylesheets, tables carry
rules a quotation omits, and a gate with that false-alarm rate would be switched off
within a week. The same test applies here. False-alarm rate decides whether a guard fails
a build, merely loads into context, or is only written down.

That gives three layers, and the honest claim about cuffing is that exactly one of them
blocks, and it blocks on arithmetic rather than on judgement.

## Layer 1: two tests, both mechanical

A new file, `tools/test/docs-drift.test.ts`.

**Enum coverage.** For a named list of contract-facing enums, assert every literal appears
somewhere in `contract/TOPIC-CONTRACT.md` and in `docs/reference/GLOSSARY.md`. Substring
presence, nothing cleverer. A literal is documented or it is not, so the false-alarm rate
is zero, and the failure message names the missing literal and the file that lacks it.

The list is explicit rather than discovered by reflection. Every enum in the codebase is
the wrong scope: internal ones would trip the test for no gain, and the point is to guard
the vocabulary a topic and its agents actually speak. Adding a member to a contract-facing
enum means adding a glossary row, which is work that was already owed.

Measured before writing this, against the current tree, the test would fail on five sets:

| set | not documented |
|---|---|
| audit verdict | `pending` missing from the contract |
| stage | `init` and `apply` missing from the contract |
| chapter progress | all four missing from the glossary |
| challenge progress | all four missing from the glossary |
| critique finding kind | six of eight missing from both |

Those are real gaps, not test artifacts. Six of the eight things a critic is allowed to
find are undocumented in the two places a person would look, which is a fair explanation
for why the verification loop produced a critic asking for what the auditor then failed.
The plan is to document them rather than to narrow the test.

**Warning coverage.** `validate.ts` has ten warning call sites. Warnings are the drift-prone
half of the validator, because `--strict` promotes them and `promote` runs `--strict`, so a
warning decides whether a topic can reach `validated`, and every one of the four stale sites
was prose about a warning. The test carries an explicit table mapping each warning to a
distinctive phrase that has to appear in `contract/TOPIC-CONTRACT.md`.

This is the cheap eighty percent of the message-catalogue option. Full extraction would
mean refactoring `validate.ts` so messages are named values rather than interpolated
template strings, which is real work for accuracy this does not need yet. A hand-written
table costs one row per new warning and fails loudly when a row has no match. Defer the
refactor until `validate.ts` is open for another reason.

## Layer 2: make the existing rule load where it applies

`contract-changes.md` globs four paths: the contract document, `contract.ts`, `validate.ts`,
and `validate-topic.ts`. It therefore fails to load in three of the four places it governs.
The fixture is step four of its own list and does not match. The validator's tests are named
in its own text and do not match. The instruction set, which is where the drift actually
happened, does not match.

Widen the glob to cover `.claude/**/*.md`, `contract/fixtures/**`, and `tools/test/**`. This
is the cheapest item here and the one with the best ratio, because a path-scoped rule costs
nothing until a matching file is touched and then appears in context at the exact moment it
is relevant. It is the pattern the repo already uses, turned on the repo itself.

## Layer 3: what gets written down, kept short

Two changes to `contract-changes.md` beyond the glob.

A fifth place on the ordered list: the instruction set, meaning `.claude/agents/`,
`.claude/skills/`, `.claude/rules/`, and `docs/reference/`. It goes last, after the fixture,
because it should describe behaviour that has already been demonstrated.

And one line that is the actual lesson from the four sites:

> An instruction file may say that a rule exists and what to do about it. It should not
> restate the rule's threshold or scope. Where it needs one, point at the contract section.

All four stale sites were threshold restatements. "Every non-primary source." "Warned for
paper." "While one remains." None of them were the existence of a rule, which is the part
that does not change. This is the restatement-cutting option reduced from a sweep to a line,
which is what token discipline can afford: rules are inlined in agent files precisely so a
running agent does not pay for a file read, and sweeping that away would make generation
slower to save a maintenance cost that falls on a different budget.

## Deliberately not doing

**A pre-commit hook that sweeps the docs.** It would fire on every commit including the ones
that touch nothing relevant, and a slow hook on an unrelated commit is how hooks get
disabled.

**Widening the existing "dispatch a consistency agent after editing a skill" instruction.**
It exists and it did not fire for either drifting commit, because neither touched a
`SKILL.md`. Widening it to any doc edit means spawning an agent on most commits to catch a
defect two tests catch for free.

**Reflection over every enum in the codebase.** Discovers internal vocabulary nobody needs
documented and turns a zero-false-alarm test into a nagging one.

**The full validator-message catalogue.** Covered above. Not wrong, just not yet.

## Order of work

1. Write `tools/test/docs-drift.test.ts` with both checks. Expect it to fail.
2. Close the five documented gaps in `contract/TOPIC-CONTRACT.md` and
   `docs/reference/GLOSSARY.md`. This is where the actual value lands: the test is only the
   thing that will notice next time.
3. Widen the glob and add the fifth place and the threshold line to `contract-changes.md`.
4. `npm test` and `npm run typecheck` clean.

## What this still does not catch

A rule whose threshold changes while its vocabulary stays the same. That is precisely the
`f773933` case: no enum member moved and no warning was added or removed, only the condition
under which one fires. The warning-fragment table catches it if the phrasing changes enough
to break a row, and does not if the phrasing survives. The full message catalogue would
narrow this and would not close it either, because no test can read a paragraph and decide
whether it still describes a condition.

So the honest summary is that Layer 1 makes a whole class of drift impossible, Layer 2 puts
the rule in front of whoever is about to cause the rest of it, and Layer 3 is prose and is
therefore exactly as reliable as the prose that already drifted. Three layers, one of which
is a guarantee. That is the trade being accepted, and it is written here so nobody later
mistakes the guard for a proof.
