# Stage: challenges

Ends with every challenge holding a brief, a rubric, starter scaffolding, a hidden
evaluation set, and a reference solution that passes that evaluation set against the
thresholds the manifest pins.

## 1. Read the worklist

```
npm run forge -- status <slug>
```

Outstanding challenge ids are the worklist. The manifests already exist, because `apply`
wrote them from the approved map, so the interface, the metrics, and the thresholds
are settled and are not open for renegotiation here.

## 2. Author challenges, three at a time

Delegate each outstanding challenge to the `forge-challenge-author` subagent. Give it
the topic slug, the challenge directory, and the chapters the learner will have read
by then, as titles and taught concepts.

Launch at most three at once, and confirm each finished before starting the next
batch.

Corpus files are the one place parallel authors can collide. A challenge that needs a
corpus an earlier challenge already built reads it rather than rewriting it; a challenge
building its own names the files `<challengeId>-*.json` so two authors running at once
cannot land on the same name. Nothing enforces this, so state the convention when you
delegate.

## 3. The four files a challenge owes

`apply` left a stub at each of these paths, carrying a `forge:stub` marker. A
challenge stays on the worklist until all four exist with the marker gone, so an
author who invents a different filename produces a challenge that reports as
outstanding forever.

```
brief.md
rubric.md
.hidden/eval/<challengeId>.eval.ts
.hidden/solution/<entrypoint minus the leading work/>
```

The last one is a fixed mapping: `.hidden/solution/` mirrors `work/`, so an entrypoint
of `work/src/index.ts` puts the reference at `.hidden/solution/src/index.ts`. That is
what lets the evaluation set be run against the reference at all. See step 5.

`starter/` must also hold at least one file.

## 4. What each file contains

**`brief.md`**: written for someone who has read the preceding chapters and nothing
else. States what to build, the interface to implement, the corpus to run against,
and the metrics with their thresholds. The learner is told the bar. The learner is not
told the cases. A type signature or a two-line usage example is fine; a function body
is not.

**`rubric.md`**: weighted criteria summing to 100, each naming what a full-credit
answer contains. The learner may read this, and that is intended: a rubric the learner
can read is a specification, and hidden criteria would only teach them to guess.

**`starter/`**: types, fixtures, and a runnable shell. Enough that the learner starts
on the problem rather than on plumbing. No part of the solution.

**`.hidden/eval/`**: the held-out set, with its own labelled judgements. It imports
the learner's entrypoint and prints one `metric <name> <value>` line for each metric the
manifest names, no more and no fewer. That convention is how a score gets read back out
of any runner. It must
fail loudly on a missing or wrong-shaped entrypoint rather than scoring zero silently,
because a learner who wired the interface wrong deserves to be told that instead of
being told they scored nothing.

**`.hidden/solution/`**: a working reference implementation, written against the same
interface the learner gets.

## 5. Prove the challenge is solvable

```
npm run forge -- eval <slug> <challengeId> --reference
```

This stages a mini topic under `.forge-cache/<slug>/try/`, puts the reference solution
where the entrypoint belongs, and runs the evaluation set against it. Every relative
path inside the eval set resolves exactly as it will for a learner, and `work/` in the
real topic stays empty. Without `--reference` the same command scores the learner's
`work/`, which is what the Judge runs.

The numbers come from the `metric <name> <value>` lines the evaluation set prints, one
per metric the manifest declares. A declared metric that never gets printed is reported
as a defect in the challenge, because a threshold nobody measured is not a threshold.

The command fails when the reference does not clear the thresholds its own manifest
pins. A challenge in that state is broken. Finding it here costs an hour; finding it
when a learner submits costs their trust in the grading.

Report the numbers the reference scored. A reference that only just clears a threshold
means the threshold is set where the learner cannot reach it.

## 6. Check the boundary

Nothing outside `.hidden/` may point at what is inside it. The validator checks that
`brief.md`, `rubric.md`, and `starter/` do not contain the string `.hidden`, which
catches the careless case. The careful case is yours: a brief that describes the
evaluation cases in prose leaks them just as thoroughly as a path would.

## 7. Finish

```
npm run validate -- topics/<slug> --strict
npm run forge -- promote <slug>
```

Report each challenge's reference score against its thresholds, anything the validator
still warns about, and whether the topic promoted to `validated`.

One caveat belongs in that report every time: a `validated` topic has not been audited.
The faithfulness auditor and the critique agent have not run, and `verified` is theirs
to give.

Then stop.
