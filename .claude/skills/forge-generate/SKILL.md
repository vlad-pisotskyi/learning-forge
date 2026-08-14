---
name: forge-generate
description: Generate a topic under topics/<slug>, one stage per invocation, research through verification, checkpointed and resumable.
---

# forge-generate

Turns a subject name into a topic instance that satisfies `contract/TOPIC-CONTRACT.md`.

Generation runs in stages, one per invocation. A twelve-chapter topic does not fit
in one context, so the run is designed to be picked up cold: everything the next
invocation needs is on disk, and `npm run forge -- status <slug>` reads it back.

## Running a stage

```
npm run forge -- status <slug>      # where the topic is, what it still owes
```

The stage named in `next` is the stage to run. Read that stage's playbook and
nothing else. The playbooks are written to be read one at a time.

| Stage | Playbook | Ends when |
|---|---|---|
| research | `stages/research.md` | `sources.json` holds every source the topic will cite |
| map | `stages/map.md` | `map.json` exists, checks clean, and the owner has been asked to approve it |
| apply | none | `npm run forge -- apply <slug>` has projected the approved map onto disk |
| chapters | `stages/chapters.md` | every chapter and quiz is written and the validator names no chapter problems |
| challenges | `stages/challenges.md` | every challenge has a brief, a rubric, starter code, an evaluation set, and a reference solution that passes it |
| verify | `stages/verify.md` | every chapter carries a faithfulness and a critique verdict, both passing, and the topic is `verified` |

When a topic does not exist yet, `npm run forge -- init <slug>` creates its tree.
Stop after each stage and report what happened. Do not start the next one in the
same invocation.

## The rules that hold in every stage

**The CLI owns structure; you own content.** Two kinds of file come out of
`npm run forge -- apply`, and they are treated differently.

*Plan-derived* files are rewritten from the map every time apply runs: `topic.json`,
`concepts.json`, chapter frontmatter, challenge manifests, and the topic's three role
skills, which are stamped from `templates/`. Never hand-write these. To change one,
change the map or the template and apply it again.

*Stub* files carry a `forge:stub` marker and exist to be replaced: chapter bodies,
quiz files and their answer keys, `brief.md`, `rubric.md`, the eval set, the reference
solution. These are yours. Replacing one means removing the marker along with the
placeholder text. `forge status` counts a file that still carries the marker as
unwritten.

**Sources come before prose.** Only the research stage reaches the web. The chapter
writer has no web search or fetch tools, so the ordinary path to an unsourced claim
is closed: the excerpt has to be in `sources.json` already.

**One excerpt, one chapter.** The map allocates every excerpt to exactly one chapter,
and that chapter is responsible for citing all of it. `forge check` rejects a map
that allocates an excerpt twice or leaves one unowned, and `forge status` names any
chapter that did not cite what it was given. Both checks are worth reading, because
the validator only asks whether an excerpt was cited by *someone*.

**Three subagents at a time, and each one checkpoints before the next batch
starts.** A dead agent costs one shard, one chapter, or one challenge. An earlier
planning session lost a session limit to four unbounded research agents at once,
which is the failure this cap exists to prevent.

**The owner approves the map.** After the map stage, stop. Write `map.json`, ask,
and wait. Never write `map.approved.json` yourself. The copy from one to the other
is the approval, and it is the owner's to make.

**Nothing outside `.hidden/` points at what is inside it.** Briefs, rubrics, and
starter code must not mention `.hidden` or leak an evaluation case. The validator
checks the string; the judgement is yours.

**Read what you need and no more.** Delegate anything that reads a lot of material
to a subagent so only its conclusion returns. Do not read finished chapters to
write a new one; the map carries what you need to know about them.

## Finishing

A stage is finished when the validator agrees, not when the writing feels done:

```
npm run validate -- topics/<slug> --strict
npm run forge -- promote <slug>          # draft → validated, if it passes clean
```

`validated` is mechanical and says nothing about quality. `verified` belongs to the
verification agents and is not this skill's to hand out.

A `validated` topic is still not audited: the faithfulness auditor and the critique
agent have not run. Say that when reporting a finished run.

`--strict` promotes warnings to errors, and `promote` always runs strict. Two warnings
bite here in particular. A `paper` or a `book` carrying no DOI or arXiv identifier is one;
record the identifier, or when the work genuinely has none, file it as the kind it actually
is. The other is asked of the topic rather than of each source: when more than half the
sources are secondary, the validator warns once and names them, so a topic built mostly on
secondary material cannot be promoted until it has done its reading. A single
`primary: false` entry is not a finding.

## Where the work is kept

```
.forge-cache/<slug>/
  run.json              stage cursor and history
  shards.md             the research plan: one line per shard
  research/<shard>.json one shard's findings, the unit of loss
  map.json              the proposed map
  map.approved.json     the map the owner approved; only this one is applied
```

`.forge-cache/` is gitignored. It is intermediate work, resumable but not history.
