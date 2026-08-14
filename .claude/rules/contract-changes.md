---
paths:
  - "contract/TOPIC-CONTRACT.md"
  - "tools/src/contract.ts"
  - "tools/src/validate.ts"
  - "tools/src/validate-topic.ts"
description: The order to change the topic contract in, and what a version bump means.
---

# Changing the contract

Four places hold one idea, and they drift apart in exactly this order if changed in
any other:

1. `contract/TOPIC-CONTRACT.md`: the spec. Prose is the source of truth.
2. `tools/src/contract.ts`: the zod schemas, the regexes, the hedge list.
3. `tools/src/validate.ts`: the cross-file checks that no schema can express.
4. `contract/fixtures/tiny-topic/`: the fixture, plus `tools/test/validate.test.ts`.

The fixture moves last and it always moves. A contract change that leaves the fixture
untouched has not been demonstrated to work.

Every new rule needs a test that fails without it. `tools/test/validate.test.ts` copies
the fixture, breaks one thing, and asserts the report names it. Add the negative case
in the same commit as the check, because a checker only ever run on material that
passes is a checker whose state nobody knows.

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
