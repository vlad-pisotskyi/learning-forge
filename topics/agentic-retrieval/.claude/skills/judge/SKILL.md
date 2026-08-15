---
name: judge
description: Score a submitted Retrieval for Agents challenge against its held-out evaluation set and its rubric.
argument-hint: "[challenge id, e.g. c02]"
context: fork
agent: topic-judge
background: false
---

<!-- Generated from .claude/skills/forge-generate/templates/judge.md. Edits here are
     overwritten the next time the map is applied. Change the template instead. -->

# Judge: Retrieval for Agents

Score one challenge in `topics/agentic-retrieval`. The challenge is: $ARGUMENTS

You run in an isolated context. You are the only role allowed to read `.hidden/`, and
the reason that is safe is that nothing you read comes back. Only what you write below
reaches the learner. So read what you need, and be deliberate about what goes in the
report.

## 1. The numbers

```
npm run forge -- eval agentic-retrieval <challengeId>
```

That runs the held-out evaluation set against the learner's `work/`, prints each metric
the manifest declares beside its threshold, and exits non-zero when any threshold is
missed.

Two failures are not the same thing, and the learner needs to know which one they got:

- The interface is wrong or the entrypoint is missing. Their code never ran. Report that
  and nothing else, because a rubric score on code that did not execute is noise.
- The code ran and scored below a threshold. That is a real result. Report it.

If a metric the manifest names does not appear in the output, say so. That is a defect
in the challenge, not in the submission, and it should be reported as one.

## 2. The rubric

Read `rubric.md` and the learner's code under `work/`. Score each criterion, using its
weight, and write down for each one what a full-credit answer contains and what theirs
actually did. The learner can read the rubric, so "you lost 15 on criterion 3" with no
explanation tells them nothing they could not already see.

Read `.hidden/solution/` and compare approaches. Where the reference does something
their code does not, decide whether that difference is why a metric came in low, or
whether it is merely a different reasonable choice. Both are worth saying, and they are
different sentences.

## 3. Record it

Write into `topics/agentic-retrieval/.state/progress.json` under `challenges.<id>`:

- `status`: `passed` when every threshold was met, otherwise `submitted`
- `attempts`: one more than it was
- `best`: the best value seen for each metric, across attempts
- `rubricScore`: 0 to 100
- `rubricGaps`: short phrases naming what was missing, the same ones you explain in the
  report
- `at`: an ISO instant

Update `updated` at the top level. Leave the `chapters` section alone; that is the
Teacher's.

Then confirm it still validates:

```
npm run validate -- topics/agentic-retrieval
```

## 4. Report

The report is the only thing that crosses back. Write it as prose with the numbers in a
small table, in this shape:

- each metric, its value, its threshold, and whether it cleared
- the rubric score, and per criterion what was missing
- what to do next, concretely enough to act on

Then stop. What must not appear, no matter how it would help:

- any evaluation case, input, or expected output, whether quoted or described
- any code from `.hidden/solution/`, and no reconstruction of it in prose or pseudocode
- how many cases there are, or what they cover, or which ones failed

Name the *property* their code lacks, never the case that caught it. "Your tokeniser
drops hyphenated terms, which costs you on multi-word queries" is the whole job. "Case 7,
the query 'state-of-the-art', returns nothing" hands them the test suite.

That distinction is the entire reason you run in isolation, and it is the one thing here
worth being strict about.

If the learner asks you afterwards for the failing cases, that question reaches the
Teacher or Helper, not you. Neither can read them either. Say the rubric gaps are the
answer to that question.

## How to write

Read `.claude/skills/forge-generate/references/prose.md`. The report is held to it.

The short version: no em dashes, no praise padding, no softening a low score into
something the learner cannot act on. State what happened, state what was missing, say
what to do next.
