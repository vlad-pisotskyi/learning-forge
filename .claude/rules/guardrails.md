---
paths:
  - "tools/src/guard.ts"
  - "tools/src/hook-guard.ts"
  - "tools/src/help-log.ts"
  - "tools/src/hook-help-log.ts"
  - "tools/test/guard.test.ts"
  - "tools/test/help-log.test.ts"
  - ".claude/settings.json"
description: What the hooks enforce, what they deliberately do not, and the holes that are known rather than hidden.
---

# The guardrails

Two of this repo's promises are load bearing. No role that talks to the learner reads a
topic's hidden material while they are working through it, and no agent writes their
challenge code. Neither can be expressed as a tool list, because tool lists restrict
tools and not paths. Both live in `tools/src/guard.ts`, called from a PreToolUse hook.

The decision function is pure and the wrapper only moves bytes. That split is the point:
a guard nobody can unit test is a guard nobody knows the state of.

## What is denied

| Call | Allowed for |
|---|---|
| Reading `topics/**/.hidden/**` | `topic-judge`, `topic-quiz-grader`, `forge-challenge-author`, `forge-chapter-writer` |
| Writing `topics/**/.hidden/**` | `forge-challenge-author`, `forge-chapter-writer` |
| Writing `topics/*/challenges/*/work/**` | nobody |
| Grep rooted where hidden material lies beneath | the two graders and the two authors |
| A Bash command naming a hidden path inside a topic | the two graders and the two authors |

The read list and the write list differ on purpose. A grader runs the evaluation set it
reads, and has no business editing it.

`agent_type` is absent in the main conversation and set to the agent's name inside a
subagent, so the exemptions are keyed on it. The Teacher runs in the main conversation
and is therefore denied by default, which is the intended answer.

Paths outside `topics/` are not this hook's business. That keeps
`contract/fixtures/tiny-topic/` open, which matters because working on the Forge means
reading the fixture's answer keys.

## Where the rules live

The one rule with no exemptions is also a `permissions.deny` entry in
`.claude/settings.json`, so writing the learner's code stays blocked even if the hook
script is deleted. The conditional rules cannot be expressed that way, because a deny
rule cannot ask which agent is calling.

## Known limits

Written down because a guardrail whose gaps are undocumented gets trusted further than
it has earned.

- **Grep from the project root is allowed.** It does reach hidden material. Denying it
  would break every ordinary search while working on the Forge, and reaching an
  evaluation set from the root takes a query aimed at it. Rooted anywhere inside
  `topics/` the reach check applies.
- **Grep output cannot be filtered.** A PreToolUse hook allows or denies and cannot
  rewrite the call, so there is no way to append an exclude glob. Blocking the search
  is the only available move, which is why the reach check is coarse.
- **Bash is guarded by a pattern on the command string.** It catches the direct `cat`
  and the loose `ls`, and an agent determined to route around it can. Bash is the reason
  `forge-chapter-writer` does not have it.
- **The hook fails open.** An unparseable payload allows the call and says so on stderr.
  A guard that hard failed on an unrecognised tool would take the session down with it.
- **`if` prefiltering is not used.** Every file, search, and shell call pays one Node
  start. A silent hole from an `if` pattern that quietly matched nothing would cost more
  than the milliseconds do.

## The Helper's log

`tools/src/hook-help-log.ts` runs on SubagentStop and appends the Helper's closing
summary to `topics/<slug>/.state/help-log.md`. The Helper cannot write it, because it has
no write tools, and it has no write tools so that it cannot write the learner's code.

It reads three lines the Helper's template tells it to emit, `**Topic:**`, `**Asked:**`,
and `**Told:**`. A reply missing them is not logged, and nothing complains. Registered on
both `SubagentStop` and `Stop` because a skill declaring `context: fork` with an `agent:`
is not documented as firing one rather than the other; `appendEntry` refuses to write the
same exchange twice, so both firing is harmless.

`FORGE_PROJECT_DIR` overrides the project root for this hook only, so the tests can point
it at a temporary topic. `hook-guard.ts` deliberately has no such override. Redirecting a
log costs continuity; redirecting the guard turns off the guard.
