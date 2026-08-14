# Handoff — "Learning Forge" repo

> Kept as written, as the plan of record. It describes the repo before any code
> existed, so its status line is historical: Phases 0 through 3 are now built. See
> [README.md](README.md) for where things actually stand.

**For:** a fresh Claude Code session (Sonnet is fine for most phases; see the model notes per phase).
**From:** an Opus planning session that ran the requirements interview and one successful research pass before hitting a session limit.
**Status:** requirements locked, architecture decided, phases outlined. No code written yet. Three research passes are still owed — they are listed at the bottom as debts, and none of them block Phase 0 through Phase 7.

Read this whole file before doing anything. Do not start generating until the "Before you build anything" section is satisfied.

---

## 1. What this repo is

Two layers, and keeping them separate is the whole point.

**Layer 1 — the Forge.** A general-purpose machine for turning a topic name into a complete self-teaching program. The owner types something like "generate materials for RAG" and the repo already knows what that means: run deep research, produce a cited chapter sequence, produce practical challenges with hidden evaluation sets, and wire up the Teacher, Helper, and Judge roles for that topic. The Forge is topic-agnostic. Nothing about information retrieval belongs in it.

**Layer 2 — a topic instance.** A directory produced by the Forge, holding one subject's chapters, quizzes, challenges, hidden eval sets, sources, and its own scoped Teacher, Helper, and Judge. The first instance will be `wiki-retrieval`, but the owner expects to run the Forge again on unrelated subjects later.

Build order is Layer 1 first, then use it to produce Layer 2. Do not build the wiki-retrieval content by hand and retrofit a generator around it. If the Forge cannot produce the wiki topic without manual patching, the Forge is wrong and that is the bug to fix.

## 2. Who this is for

The owner is a strong TypeScript engineer, comfortable in JavaScript, actively learning Python. New to information retrieval as a field. They want to genuinely understand the material, which means the repo's job is to teach and to grade, never to solve. They are explicit that they know Claude can write the code for them, and that is exactly what they do not want.

## 3. Locked decisions

These came out of a requirements interview. Treat them as settled. If one of them turns out to be unworkable, stop and say so rather than quietly substituting something else.

| Decision | Choice |
|---|---|
| Theory delivery | Claude Code native. Chapters are markdown, a Teacher skill delivers them and quizzes, progress lives in a small state file. No app to build, no server, no web UI. |
| Practical language | TypeScript primary. |
| Corpus strategy | Start on a small authored synthetic wiki where ground truth is fully known, then graduate to a real Wikipedia subset in later chapters. |
| Model and embeddings runtime | OpenAI, for both embeddings and generation. |
| Grading | Hidden held-out eval set producing hard numbers, plus a separate rubric review naming what the learner left out. Both, not either. |
| Scale of first topic | Roughly 12 chapters and 6 challenges. |
| Sourcing rule | Primary sources, quoted and pinned. Every non-obvious claim carries an inline marker resolving to a sources entry with URL, the exact quoted passage the claim rests on, and the retrieval date. |

Two hard content rules the owner stated directly:

- Chapters state facts, not hedges. No "may", no "might", no "some argue". If a thing is genuinely contested, the chapter says it is contested and cites both sides — that is a fact about the state of the field and is allowed. Vagueness used to paper over ignorance is not.
- Every lesson claim traces to an exact source. The owner asked for this specifically: "If you are making a lesson, I'd like to have a reference to exact source."

## 4. The three roles

Every topic gets these three. They are different roles with genuinely different permissions, and the permission differences are the mechanism that makes the whole thing work.

**Teacher.** Delivers one chapter at a time, quizzes at the end, answers follow-up questions about the chapter, records progress. Loads only the current chapter plus the learner's recorded weak spots — never the whole book.

**Helper.** Available during challenges. Explains concepts, reframes the problem, asks leading questions, points at which chapter covers the confusion. Must never write code and must never hand over a full answer. This is a hard constraint, not a stylistic preference, and it needs to be enforced at the harness level rather than by asking nicely in a prompt. See the enforcement ranking in section 6.

**Judge.** Runs after the learner submits a challenge. Executes the hidden eval set, reports the numbers, then scores the submission against a written rubric and names specifically what should have been added. Must not leak the eval set or the reference solution back into the main conversation.

## 5. Phases

Phase-level only, as requested. Each phase gets generated in its own session, one at a time. Do not expand these into step-by-step task lists here — the detail gets worked out when the phase is actually built.

### Stage A — build the Forge

**Phase 0 — Repo skeleton and conventions.**
Directory layout, package setup, gitignore, the split between what is committed and what is local-only learner state. Decide here where topics live and what a topic directory is named. Nothing clever, but getting the layout right makes every later phase cheaper.

**Phase 1 — Root CLAUDE.md and the context budget.**
The repo-wide instructions: what this repo is, the two-layer model, the sourcing rule, the no-hedging rule, and the roles. Keep it short — the doc guidance is under 200 lines, and everything in it costs tokens at every session start. Anything longer or narrower belongs in a path-scoped rule or a skill body instead. This phase is also where the token-discipline policy for the whole repo gets written down.

**Phase 2 — The topic contract.**
The single most important phase in Stage A. Define the schema every generated topic must satisfy: what files exist, what frontmatter each carries, how chapters declare prerequisites, how a citation marker resolves to a sources entry, how a challenge declares its hidden eval set and rubric, how progress state is shaped. Write it as a spec document plus a validator, so a generated topic can be checked mechanically rather than by eyeballing it. Everything downstream — the generator, the three roles, the verifier — reads this contract.

**Phase 3 — The topic generator skill.**
The repo-level skill the owner invokes as something like "generate materials for RAG". It runs the research pass, drafts the chapter map, produces chapters with pinned citations, produces challenges with hidden evals and rubrics, and instantiates the topic's own scoped roles from templates. This is where the fan-out research pattern lives, and it must be built to survive partial failure — the session that wrote this handoff lost three research agents to a token limit, and the generator needs to checkpoint to disk so a dead agent costs one shard rather than the whole run.

**Phase 4 — Role templates.**
Teacher, Helper, and Judge as reusable templates that the generator stamps into each new topic. The topic-specific parts (subject vocabulary, chapter list, rubric emphasis) come from the topic contract; the behavioral rules stay in the template so all topics behave consistently.

**Phase 5 — Guardrails.**
The enforcement layer. Tool restrictions on the Helper, path protection on solution and eval files, permission rules, and the progress state file. This phase is what makes the Helper's "never write code" and the Judge's "never leak the eval set" real rather than aspirational.

**Phase 6 — The verification layer.**
Two separate checkers, both of which run over generated topic material before it is considered done.

The first is a *critique* agent: reads a generated topic against the contract and against pedagogical quality, and reports gaps, bad ordering, missing prerequisites, challenges that do not exercise what the preceding chapters taught.

The second is a *faithfulness auditor*: reads each chapter claim by claim, resolves every citation marker to its source entry, and rules on whether the quoted passage actually supports the claim. This is the mechanism that makes the "100% truth" rule enforceable. Design notes for this agent are in section 7 — it is the one place where prompt design quality genuinely determines whether the guarantee holds.

**Phase 7 — Forge dry-run.**
Point the Forge at a small throwaway subject with two or three chapters and one challenge. The goal is to validate the machine, not to produce useful material. Every defect found here is a defect that would otherwise have been found twelve chapters deep into the real topic.

### Stage B — produce the first topic

**Phase 8 — Research pass for wiki-retrieval.**
Run the Forge's research stage on the real subject. Produce the verified source map before any chapter prose exists. Nothing gets written that does not have a source waiting for it.

**Phase 9 — Chapters.**
Twelve chapters with quizzes, generated against the contract, then run through both verifiers from Phase 6.

**Phase 10 — Challenges.**
Six challenges, each with a hidden eval set and a rubric, each positioned after the chapters it depends on. The synthetic corpus is authored here; the Wikipedia subset acquisition lands here too.

**Phase 11 — Publish.**
README, licensing and attribution (a Wikipedia subset carries CC BY-SA obligations that a public repo must honor), setup instructions, and the "how to use this repo on a new topic" guide.

## 6. Verified Claude Code mechanics

This came from a research pass against the official docs and is the one piece of expensive knowledge that survived the token limit. Treat the cited items as verified; treat the flagged items as needing a check before you rely on them.

**CLAUDE.md loading.** Root and parent CLAUDE.md files load in full at session start. Subdirectory CLAUDE.md files load on demand, the first time Claude reads a file in that subdirectory. The `@path/to/file` import syntax exists, resolves relative to the importing file, and supports a maximum of four hops. Imported content is *not* deferred — it loads at launch alongside its parent, so imports do not save startup tokens. Under 200 lines is the stated target per file. Source: https://code.claude.com/docs/en/memory.md

**Path-scoped rules.** Files in `.claude/rules/*.md` carrying a `paths:` glob in frontmatter load only when Claude touches a matching file. This is the correct home for anything narrow — it costs nothing until it is relevant. Source: https://code.claude.com/docs/en/memory.md

**Skills and progressive disclosure.** A skill lives at `.claude/skills/<name>/SKILL.md`. Only the skill *description* loads at startup; the body loads when the skill is invoked. Supporting files referenced from the body (`reference.md`, `examples/`, `scripts/`) are read on demand. Relevant frontmatter fields include `name`, `description`, `allowed-tools`, `disallowed-tools`, `model`, `effort`, `paths`, `disable-model-invocation`, and `context: fork` with a companion `agent` field for running the skill in a forked subagent context. `${CLAUDE_SKILL_DIR}` and `${CLAUDE_PROJECT_DIR}` are available for path-independent references. Source: https://code.claude.com/docs/en/skills.md

**Directory-scoped skills.** Skills in nested `.claude/skills/` directories below the starting directory are not loaded at startup; they load the first time Claude reads or edits a file inside that subdirectory and stay available for the rest of the session. On a name collision between a root skill and a nested one, both remain available and the nested variant is addressed by a directory-qualified name such as `/topics/wiki-retrieval:teach`. Source: https://code.claude.com/docs/en/skills.md

This is the mechanism that makes the two-layer design work cleanly: per-topic Teacher, Helper, and Judge skills cost nothing until the learner is actually working inside that topic's directory.

**Subagents.** Defined in `.claude/agents/*.md`. Frontmatter includes `name`, `description`, `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`, `memory`, `effort`, and `isolation`. Each runs in its own context window. The parent sees only the subagent's final text response plus a small token and duration trailer — no intermediate reads, tool calls, or reasoning. Source: https://code.claude.com/docs/en/sub-agents.md

That isolation property is exactly what the Judge needs. The Judge can read the hidden eval set and the reference solution, and only its verdict crosses back into the learner's conversation.

**Enforcing the Helper's "never write code" rule**, ranked by actual reliability:

1. A subagent with `disallowedTools: Write, Edit, NotebookEdit`. The harness removes the tool before the model ever sees it, so the model cannot call it regardless of what it decides to do. This is the only mechanism that is enforcement rather than persuasion.
2. A `permissions.deny` entry in `.claude/settings.json`. Enforced by the permission system before the prompt.
3. A `PreToolUse` hook returning a deny decision. Effective but depends on the hook executing correctly.
4. A skill's own `disallowed-tools` field. Scoped to the skill's turn and cleared on the next user message.
5. Prompt wording alone. Not enforcement. Use it as documentation of intent, never as the guarantee.

Build the Helper on mechanism 1, and use mechanism 5 on top purely so the model understands *why* it cannot write, which produces better teaching behavior.

**Hooks.** The event list includes `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `SubagentStart`, `SubagentStop`, `Stop`, `SessionEnd`, and others. For `PreToolUse`, exit code 2 blocks the action and sends stderr back to Claude as feedback; alternatively exit 0 with a JSON body carrying `hookSpecificOutput.permissionDecision` set to `deny`. Source: https://code.claude.com/docs/en/hooks-guide.md

**Startup context cost.** Roughly 8k tokens before the conversation starts, split across the system prompt, environment info, memory, skill descriptions, and CLAUDE.md files. Skill descriptions are a real recurring cost, so descriptions should be tight. Source: https://code.claude.com/docs/en/context-window.md

**Progress persistence.** No dedicated feature for this. A plain JSON or markdown file in the topic directory, read and written by the Teacher, is the supported approach. Subagent `memory:` scoping exists as an alternative but binds progress to an agent rather than to a topic, which is the wrong shape here.

**Flagged, verify before relying on it.** Two claims from the research pass were not independently confirmed and should be checked against current docs when the relevant phase arrives: the `if:` field on hook matchers for path-pattern matching, and the claim that `.claude/commands/` has been merged into the skills mechanism such that new work should always use skills.

## 7. Design notes for the faithfulness auditor

The research pass on verification-prompt design died before it reported, so this section is direction rather than findings. Phase 6 should reacquire the evidence before finalizing the auditor. What is known well enough to plan around:

The auditor should decompose a chapter into atomic claims first, as a separate pass from judging them, because a judge that finds and rules simultaneously tends to find only the claims it can already defend. Each claim then gets ruled independently against its cited source, with the ruling required to quote the specific supporting span before delivering a verdict. The verdict set needs at least three values — supported, unsupported, contradicted — plus an explicit "source unreachable" escape, because collapsing to a binary pushes uncertain cases into whichever label the model finds more comfortable.

The auditor must default to failure. A claim is unsupported until a quoted span proves otherwise. It must also flag the subtle failure that matters most for teaching material: a source saying "often" and a chapter saying "always". That is the exact shape of error the no-hedging rule will tend to produce, so the auditor has to be specifically pointed at it.

The auditor must not see the generator's reasoning about why a claim is correct. It sees the chapter and the sources file, nothing else.

## 8. Research debts

Three research passes were commissioned and did not complete. None block Stage A. Run each one *inside* the phase that needs it, as a checkpointed fan-out rather than as one long agent, so a token limit costs one shard instead of the run.

1. **Verification and faithfulness prompt design.** Claim decomposition methodology, entailment-style grading as actually implemented by the established eval frameworks, documented LLM-as-judge failure modes and which mitigations have evidence behind them. Needed for Phase 6.
2. **The wiki-retrieval source map.** Canonical papers with verified identifiers across lexical retrieval, chunking, dense retrieval, late interaction, fusion, reranking, query transformation, agentic multi-hop retrieval, wiki-specific structure, evaluation, and the known negative results worth teaching explicitly. Needed for Phase 8. A partial pass got as far as verifying several items before dying; it flagged that the distinction between genuinely agentic methods and fixed pipelines needs to be drawn precisely, and that at least one paper name collision exists in the long-context literature.
3. **The TypeScript and OpenAI stack.** Current embedding and generation model identifiers with pricing and limits, the SDK's current recommended call surface, local vector storage options that work in Node without a server, BM25 availability in TypeScript, tokenizer options, Wikipedia corpus acquisition and its licensing obligations, and the test-runner choice for a hidden eval harness. Needed for Phase 10. A partial pass surfaced two signals worth chasing: that the OpenAI model landscape has moved since the planning session's assumptions, and that Wikimedia's XML dump route may be deprecated. Verify both at the source rather than inheriting them.

## 9. Working agreement

The owner runs `/caveman` for conversational replies and expects terse, compressed chat with all technical substance intact. Written deliverables — documents, READMEs, chapter prose, PR bodies, commit messages — get written as normal prose and run through `/humanizer` before delivery. Questions asked back to the owner are written as normal prose too, not compressed.

Before generating any phase, understand it fully. Interview the owner if a decision would materially change the output. Do not guess and proceed on a fork that matters.

Token discipline is a stated requirement of this repo, not a nice-to-have. The session that produced this handoff burned a session limit in ten minutes by fanning out four unbounded research agents at once. Concretely: keep CLAUDE.md short and push narrow instructions into path-scoped rules, keep skill descriptions tight because they are the recurring cost, keep skill bodies lean and push detail into on-demand reference files, use per-topic nested skills so inactive topics cost nothing, delegate anything that reads a lot of material to a subagent so only the conclusion returns, and checkpoint fan-out work to disk.

## 10. Before you build anything

Confirm with the owner:

- Where the repo lives and what it is called. The planning session never established this.
- Whether Phase 0 through Phase 2 can be done in one sitting, since they are tightly coupled and splitting them tends to produce a contract that does not match the layout.
- Whether the throwaway dry-run subject in Phase 7 is wanted, or whether they would rather accept the risk and go straight at wiki-retrieval.

Then start at Phase 0. One phase per session.
