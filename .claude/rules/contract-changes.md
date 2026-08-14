---
paths:
  - "contract/TOPIC-CONTRACT.md"
  - "contract/fixtures/**"
  - "tools/src/contract.ts"
  - "tools/src/validate.ts"
  - "tools/src/validate-topic.ts"
  - "tools/src/forge-plan.ts"
  - "tools/test/**"
  - ".claude/agents/*.md"
  - ".claude/skills/**/*.md"
  - "docs/reference/*.md"
description: The order to change the topic contract in, what a version bump means, and why restating a threshold in prose is the thing that drifts.
---

# Changing the contract

Five places hold one idea, and they drift apart in exactly this order if changed in
any other:

1. `contract/TOPIC-CONTRACT.md`: the spec. Prose is the source of truth.
2. `tools/src/contract.ts`: the zod schemas, the regexes, the hedge list.
3. `tools/src/validate.ts`: the cross-file checks that no schema can express.
4. `contract/fixtures/tiny-topic/`: the fixture, plus `tools/test/validate.test.ts`.
5. The instruction set: `.claude/agents/`, `.claude/skills/`, and `docs/reference/`.

The fixture moves last of the mechanical four and it always moves. A contract change
that leaves the fixture untouched has not been demonstrated to work.

The instruction set is fifth because it should describe behaviour that already works,
and it is on the list at all because leaving it off cost four stale sites and one real
defect in generated material. Two commits moved the primary-source warning from firing
per secondary source to firing on a majority and added the `report` kind, and three
playbook paragraphs plus the researcher's own brief went on describing what came
before. The researcher then avoided a source the topic needed, because it had been told
a single secondary entry holds a topic at `draft`.

Every new rule needs a test that fails without it. `tools/test/validate.test.ts` copies
the fixture, breaks one thing, and asserts the report names it. Add the negative case
in the same commit as the check, because a checker only ever run on material that
passes is a checker whose state nobody knows.

## Do not restate a threshold

An instruction file may say that a rule exists and what to do about it. It should not
restate the rule's threshold or scope. Where it needs one, point at the contract
section.

Every one of those four sites was a threshold restatement. "Every non-primary source."
"Warned for `paper`." "While one remains." None of them was the existence of a rule,
which is the part that does not change. A file that says "secondary sources are a
validator warning, see the sources section of the contract for when it fires" survives
the next threshold change. A file that names the number does not.

This is deliberately not a rule against inlining. Rules are inlined in agent files so a
running agent does not pay for a file read mid-generation, and that trade is still
right. The line is between what a rule is and what its cutoff happens to be today.

## The vocabulary is guarded, the prose is not

`tools/test/docs-drift.test.ts` reads the members of every contract-facing enum and
fails unless each one appears in `contract/TOPIC-CONTRACT.md` and
`docs/reference/GLOSSARY.md`. Adding a member to `sourceKind` or `evalRunner` therefore
means adding a glossary row in the same commit, and the failure names the literal and
the file. It also counts `report.warn(` call sites in the validator against a table of
warnings, so a new warning fails until it is listed and its wording is checked against
the contract.

That covers vocabulary and nothing else. A rule whose threshold moves while its words
stay put is invisible to it, which is exactly the case that caused the drift, and is why
the section above exists as prose. The reasoning behind the whole arrangement, including
what was deliberately not built, is in `docs/plans/DRIFT-GUARDS.md`.


## Versioning

`contractVersion` appears in every generated file. Adding a required field, removing a
field, tightening a rule, or changing a filename convention bumps it, and the validator
then refuses older topics until they are migrated.

Loosening does not bump. Adding an optional field, adding a member to an enum, relaxing
a check so that material it used to reject now passes, and extending a filename
convention to a case it did not cover are all compatible, because no topic that was
valid before becomes invalid. The `python` runner was all four at once and stayed at
version 3. The test is not how large the change is, it is whether anything already on
disk stops validating.

Bumping means every existing topic under `topics/` needs a migration pass. Before
bumping, check whether the rule can be expressed as a warning instead. Warnings are
promoted to errors under `--strict`, which the generator runs anyway, so a warning
already blocks new material without invalidating what exists.

## Running things

```
npm run validate -- <topic-dir> --strict     # one topic
npm run validate:all                          # everything under topics/
npm test                                      # the validator's own tests
npm run typecheck
```

The validator runs on plain `node`, which strips types natively. That rules out
parameter properties, enums, and namespaces in `tools/`; `erasableSyntaxOnly` in
`tsconfig.json` catches them at typecheck time.
