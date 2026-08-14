# Internal docs

Written for people, not loaded by any agent at session start. Everything here is
categorised, and the category decides how the file is treated.

**Read this index before adding a file.** Put it in an existing category. If none fits,
add one and register it in the table below, with a line saying whether it is maintained
or frozen. A directory that is not in this table should not exist.

| category | what belongs here | how it is treated |
|---|---|---|
| [reference/](reference/) | What the repo is, what its terms mean, how the pipeline runs. Describes what exists now. | **Maintained.** Drift is a defect. Adding, renaming, or removing a term or a technique means updating these in the same commit as the code. |
| [plans/](plans/) | Plans of record, design proposals, handoffs. Describes what was intended at a point in time. | **Frozen.** Never edited to match what was later built. A stale plan is the record working correctly. |

## The distinction that matters

These two categories fail in opposite directions, so they cannot share a shelf.

A reference document that lags the code is actively harmful, because people trust it and
agents act on it. This repo has already paid for that: a rule changed from firing on every
secondary source to firing only on a majority, three instruction files kept describing the
old behaviour, and the research agent avoided sources it should have used.

A plan that lags the code is doing its job. `plans/HANDOFF.md` describes the repo before any
code existed and its status line is wrong on purpose. Editing it to match the present would
destroy the only record of what was decided and why, and rereading it later is how you find
out which locked decisions actually held.

So before touching anything here, check which shelf it is on. Correcting a reference
document is maintenance. Correcting a plan is vandalism.

## What is here

**reference/**

- [GLOSSARY.md](reference/GLOSSARY.md). Every term the repo uses, one line each. Start here.
- [CONCEPTS.md](reference/CONCEPTS.md). The terms where knowing what a thing is does not tell you why it exists.
- [HOW-IT-WORKS.md](reference/HOW-IT-WORKS.md). The two layers, the stage pipeline, how one course gets forged, and the rules that hold throughout.

**plans/**

- [HANDOFF.md](plans/HANDOFF.md). The original plan of record, from the planning session that preceded any code. Lists every phase. Frozen.

## Not here

Three kinds of writing live outside this directory on purpose.

`contract/TOPIC-CONTRACT.md` is the topic contract. It is a specification rather than
documentation: the schemas and the validator are derived from it, and the fixture proves it.

`.claude/rules/*.md` are path-scoped notes that load only when a matching file is touched.
They are written for whichever agent is editing that code, and they cost nothing until then.

`.claude/skills/` and `.claude/agents/` hold the instruction set, which tells agents how to
do the work. It is prose, it restates contract rules, and it is the part of the repo with no
mechanical guarantee behind it. Treat a claim there the way you would treat a comment:
useful, and capable of being out of date.
