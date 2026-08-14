# Glossary

One line per term. The terms that need more than a line get a section in
[CONCEPTS.md](CONCEPTS.md). How the pieces fit together is in
[HOW-IT-WORKS.md](HOW-IT-WORKS.md).

**Maintenance.** Adding, renaming, or removing a term or a technique means editing this
file in the same commit. A glossary that lags the code is worse than none, because
people trust it.

## The two layers

| term | definition |
|---|---|
| the Forge | Layer 1. The topic-agnostic machine that turns a subject name into a course. Lives in `.claude/`, `contract/`, and `tools/`. |
| topic instance | Layer 2. One directory under `topics/` holding a single subject's generated material. |
| topic | A subject taught as one course: chapters, quizzes, challenges, sources, and three roles scoped to it. |
| slug | A topic's kebab-case identifier, `^[a-z][a-z0-9-]{1,48}$`. It is both the directory name and `topic.json.slug`. |
| owner | Whoever runs the Forge. Approves the map, decides what gets generated. |
| learner | Whoever works through a generated topic. Assumed to be a strong TypeScript engineer, learning Python, new to the subject. |

## The contract

| term | definition |
|---|---|
| the contract | The rules every generated topic satisfies. Prose in `contract/TOPIC-CONTRACT.md`, schemas in `tools/src/contract.ts`, cross-file checks in `tools/src/validate.ts`. |
| `contractVersion` | The integer every generated file carries. Currently 3. |
| loosening | A contract change that lets previously rejected material pass. Does not bump the version. |
| tightening | A contract change that makes previously valid material fail. Bumps the version, and every topic on disk then needs migrating. |
| fixture | `contract/fixtures/tiny-topic/`, a minimal topic that satisfies the contract. It is the proof the validator still works, so it moves last in every contract change and it always moves. |
| the validator | `npm run validate`. Reads a topic off disk and reports errors and warnings. |
| error | A validator finding that fails the run. |
| warning | A validator finding that prints and passes, unless `--strict` is given. |
| `--strict` | Promotes every warning to an error. `forge promote` always runs strict, so a warning blocks new material without invalidating old material. |

## Research and sources

| term | definition |
|---|---|
| shard | One research question, narrow enough for one agent to answer in a single pass and checkpoint on its own. The unit of loss. |
| `shards.md` | The run's record of the research plan: one line per shard, with a status of `planned`, `running`, `done`, or `unresolved`. |
| source | One document the topic cites, carrying a URL, a kind, a publication date, and the date it was retrieved. |
| source id | `S01` through `S999`. Handed out by the merge in shard order, never by hand. |
| excerpt | A passage copied verbatim out of a source, with a key and a locator. The entire basis of the citation guarantee. |
| excerpt key | One to three lowercase letters, unique within a source: `a`, `b`, and on past `z` to `aa`. |
| locator | Where in the source the excerpt sits: a section, a page, a heading, a line range. Precise enough to find the passage again. |
| excerpt ref | An excerpt named in JSON: `S07.a`. |
| citation marker | An excerpt ref as written in chapter prose: `{{S07.a}}`. |
| primary source | A source reporting its own findings. `primary: false` marks one that describes somebody else's work. |
| kind | What sort of document a source is: `paper`, `report`, `docs`, `spec`, `book`, `dataset`, `code`, or `standard`. |
| `report` | Measured work published outside a venue, such as a company technical report. Separate from `paper` because there is no identifier to record, and from `docs` because a report says what somebody found rather than how to use something. |
| identifier | A DOI, arXiv id, RFC number, or ISBN. The validator warns when a `paper` or a `book` carries none. |
| the merge | `forge sources <slug>`. Folds every shard into `sources.json` and hands out source ids. Writes nothing if it finds a problem. |
| folding | Collapsing two source entries that name the same document by construction, such as an arXiv abstract page and its ar5iv render. |
| `sourceKey` | What the merge folds on: host without `www.`, path without a trailing slash or a `.txt`/`.html` extension, fragment dropped, every arXiv mirror keyed to `arxiv:<id>`. |
| reconcile | How the merge settles two shards disagreeing about one source: the more precise date, the later retrieval, the less flattering `primary`. |
| quote re-check | `forge sources <slug> --verify`. Re-fetches every source and rules each excerpt `verbatim`, `verbatim apart from formatting`, or `not found`. Advisory by design. |

## The map

| term | definition |
|---|---|
| the map | A topic's design: chapter sequence, concepts, excerpt allocation, challenges. Written to `.forge-cache/<slug>/map.json`. |
| plan | The map as a data structure, `topicPlanSchema` in `tools/src/forge-plan.ts`. Holds decisions and nothing derivable. |
| `planVersion` | The Forge's version for its own checkpoint shapes. Unrelated to `contractVersion`, and not part of the contract. |
| the approval gate | The copy from `map.json` to `map.approved.json`. Only the owner makes it, and only the approved file is ever applied. |
| `cites` | The excerpts a chapter is responsible for citing. Every excerpt goes to exactly one chapter. |
| `teaches` | The concepts a chapter introduces. |
| `requires` | Chapters that must come earlier. No cycles, no forward references. |
| outline | The `##` headings a chapter writer has to cover, in order. |
| concept | One named idea the topic teaches: an id, a label, and a one-sentence blurb. |
| concept registry | `concepts.json`. What turns "does this challenge exercise what preceded it" into arithmetic. |

## Stages and the CLI

| term | definition |
|---|---|
| stage | One invocation's worth of generation. In order: `init`, `research`, `map`, `apply`, `chapters`, `challenges`, `verify`, `validated`. |
| playbook | The instructions for one stage, under `.claude/skills/forge-generate/stages/`. Written to be read alone. |
| `run.json` | One topic's stage cursor and history. The cursor names the stage that is finished. |
| `.forge-cache/` | Where intermediate generation work lives. Gitignored. Resumable, but not history. |
| checkpoint | Writing a finished unit of work to disk before starting the next one, so a dead agent costs one unit rather than the run. |
| apply | `forge apply <slug>`. Projects the approved map onto disk. Safe to re-run after a map revision. |
| plan-derived file | A file the CLI rewrites from the map on every apply: `topic.json`, `concepts.json`, chapter frontmatter, challenge manifests, the three role skills. Never hand-authored. |
| stub | A file the scaffold created for an author to replace, carrying the string `forge:stub`. `forge status` counts it as unwritten. |
| orphan | A file on disk the plan no longer accounts for. Reported, never deleted. |
| role template | `templates/{teach,help,judge}.md`, stamped into each topic with only the slug and title substituted. |
| `UNSTAMPED` | The check for a template placeholder nobody substituted, which is otherwise a silent bug in generated material. |
| status | `forge status <slug>`. Reads off disk where a topic is and what it still owes. |
| check | `forge check <slug>`. Rules on a map without applying it. |
| promote | `forge promote <slug>`. Moves a topic from `draft` to `validated`, if it passes strict. |

## Chapters and quizzes

| term | definition |
|---|---|
| chapter | One markdown file: YAML frontmatter, then prose carrying citation markers. At least 400 words and two `##` headings. |
| chapter id | `ch01` through `ch99`, matching the filename prefix. |
| frontmatter | A chapter's YAML header: id, title, order, requires, teaches, quiz, estimatedMinutes, status, and an optional audit block. |
| citation density | At least one marker per 150 words of prose. A floor on sourcing, not a style rule. |
| quiz | Three to eight questions for one chapter, split across two files. |
| quiz key | `quizzes/.hidden/<chapterId>.key.json`. Expected answers and accept points. Read only by the quiz grader. |
| accept point | One thing a passing answer has to contain. The grader scores against these rather than against exact wording. |
| question kind | `recall`, `application`, or `discrimination`. At least one question must be application or discrimination. |
| discrimination question | One that asks the learner to tell two things apart, which catches confusions a recall question sails past. |

## Challenges

| term | definition |
|---|---|
| challenge | A practical exercise sitting after a named chapter, with a brief, a rubric, a starter, a hidden evaluation set, and a reference solution. |
| challenge id | `c01` through `c99`, matching the directory prefix. |
| `afterChapter` | The chapter a learner has to finish first. Every concept the challenge exercises must be taught at or before it. |
| brief | `brief.md`. The learner-facing problem statement, naming the interface, the corpus, and the metrics with their thresholds. |
| rubric | `rubric.md`. What the Judge scores beyond the numbers. Criteria with weights summing to 100, and deliberately readable by the learner. |
| interface | The entrypoint plus every exported name, signature, and one-line description. A public contract, because the evaluation set imports it. |
| entrypoint | The file under `work/` that the learner writes and the evaluation set imports. |
| `work/` | Where the learner's attempt lives. Gitignored, and no agent may write there. |
| starter | Committed scaffolding the learner builds on. |
| evaluation set | The held-out tests under `.hidden/eval/`. Run only by the Judge. |
| runner | What spawns an evaluation set: `vitest`, `node`, or `python`. It also decides the spec's file extension. |
| metric | A named number the evaluation set prints, compared against a threshold in a direction of `gte` or `lte`. |
| the metric protocol | The whole interface between an evaluation set and whatever scores it: one line of `metric <name> <value>` on stdout per declared metric. |
| threshold | The bar a metric has to clear. It lives in `challenge.json` and nowhere else, so an evaluation set never asserts its own. |
| reference solution | A working implementation under `.hidden/solution/`, mirroring `work/`. Proof the challenge is solvable inside the interface it specified. |
| corpus | Shared data at the topic root that challenges run against. Optional, and checked by reference rather than by existence. |

## The three roles

| term | definition |
|---|---|
| Teacher | Works through one chapter at a time. Answers questions, administers the quiz, records progress. Does not hold the quiz answers. |
| Helper | Available during a challenge. Explains, reframes, asks leading questions, points at chapters. Runs with the write tools removed, so it cannot write code. |
| Judge | Runs after a submission. Executes the evaluation set, reports the numbers, scores the rubric, names what should have been there. Runs isolated so only the verdict returns. |
| quiz grader | `topic-quiz-grader`. Scores quiz answers against the hidden key, having never seen the lesson that preceded them. |
| progress | `topics/<slug>/.state/progress.json`. Chapter and challenge state, quiz scores, missed concepts. Local-only and gitignored. |
| `weakConcepts` | Concepts the learner missed and has not since re-quizzed clean. The only cross-chapter state the Teacher loads. |
| help log | `.state/help-log.md`. The Helper's continuity record, written by a hook because the Helper has no write tools. |

## Verification

| term | definition |
|---|---|
| the auditor | `forge-auditor`. Rules on every claim in a chapter against the excerpt it cites. Has no web access, so it rules on what was actually pinned. |
| the critic | `forge-critic`. Rules on whether a chapter teaches: ordering, prerequisite gaps, unexplained terms, whether the quiz matches the lesson. |
| faithfulness | The auditor's dimension. Passes only when every claim is `supported`. |
| critique | The critic's dimension. Passes only when no finding is `blocking`. |
| claim | One assertion decomposed out of a chapter, standing alone without its surrounding sentence. |
| ruling | The auditor's verdict on one claim: `supported`, `overstated`, `unsupported`, `contradicted`, or `unreachable`. |
| `overstated` | The excerpt supports a weaker version of the claim. Its own ruling, not a shade of `supported`. |
| `unreachable` | The source could not be read. It exists so unchecked gets recorded as unchecked. |
| `NOTHING FOUND` | The sentinel an auditor writes when the cited excerpt says nothing on the point. A sentinel rather than an empty string, because an empty field reads as one somebody forgot. |
| span | The passage from the cited excerpt that carries the claim, quoted verbatim. Required for `supported` and refused for every other ruling. |
| the span check | `forge verify` resolving each marker and confirming the quoted span really appears in that excerpt. Arithmetic, and the load-bearing part of the layer. |
| finding | One thing the critic says is wrong, carrying a kind and a severity. |
| severity | `blocking` or `advisory`. One blocking finding fails the critique. |
| verdict | `pass`, `fail`, or `pending`. Derived by the CLI from rulings and findings, never written by the agent that produced them. |
| verdict file | Where an agent leaves its rulings: `.forge-cache/<slug>/verdicts/<chapterId>.{audit,critique}.json`. One per chapter per agent. |
| audit block | The stamped record in a chapter's frontmatter: both verdicts, the date, and the ruling counts. |
| `recordVerdicts` | The function that derives the verdicts, runs the span check, and stamps the audit block. |
| field order | Which field comes first in a verdict schema. `quote` precedes `ruling` and `detail` precedes `severity`, because a model emitting JSON emits it in field order. |

## Status

| term | definition |
|---|---|
| `draft` | Generated, not yet checked. |
| `validated` | Passes the validator under `--strict`. Mechanical, and says nothing about whether the material is any good. |
| `verified` | Every chapter carries a passing faithfulness verdict and a passing critique verdict. |

## Enforcement

| term | definition |
|---|---|
| the guard | `tools/src/guard.ts`, called from a PreToolUse hook. Denies reads of hidden material and writes under `work/`, keyed on which agent is calling. |
| `.hidden/` | Hidden from agents, not from people. Committed, and readable by anyone who opens the repo. |
| `agent_type` | Absent in the main conversation and set to the agent's name inside a subagent, which is how the guard's exemptions are keyed. |
| fails open | The guard's behaviour on a payload it cannot parse: allow the call and say so on stderr, rather than take the session down. |
| `permissions.deny` | The entry in `.claude/settings.json` that blocks writing the learner's code even if the hook script is deleted. |

## Writing standards

| term | definition |
|---|---|
| the prose standard | `.claude/skills/forge-generate/references/prose.md`. What everything a learner reads is held to. |
| hedge | A word the validator rejects in chapter prose: `may`, `might`, `perhaps`, and eleven others. |
| `allow-hedge` | The sanctioned escape, `<!-- allow-hedge: reason -->`, for stating practice nobody measured. The reason is required and the auditor reads it. |
| contested claim | A disagreement in the field, stated as a disagreement with both sides cited. A fact about the field, and not a hedge. |
| the three mechanical tells | Em or en dashes, curly quotation marks, and emoji. Checked as warnings, which `--strict` turns into errors. |

## Repo discipline

| term | definition |
|---|---|
| token discipline | The stated requirement that context cost is designed rather than discovered. `CLAUDE.md` stays under 200 lines because it loads in full at every session start. |
| path-scoped rule | A file in `.claude/rules/` with a `paths:` glob. Loads only when a matching file is touched, so it costs nothing until then. |
| per-topic skill | A skill under `topics/<slug>/.claude/skills/`. Loads the first time a file in that topic is touched, so ten topics cost what one does at startup. |
