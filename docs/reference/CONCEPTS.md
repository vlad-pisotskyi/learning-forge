# The ideas behind the terms

The one-line definitions are in [GLOSSARY.md](GLOSSARY.md). This file covers the terms
where the definition tells you what a thing is and not why it exists. Almost every design
here was forced by a specific failure, and the failure is usually the clearest
explanation.

## Why there are two layers

The repo is a machine and a thing the machine made, kept apart on purpose. The Forge is
Layer 1: `contract/`, `tools/`, and `.claude/`. It knows how to research a subject, design
a chapter sequence, write cited prose, build graded exercises, and audit its own output.
It knows nothing about any particular subject. Layer 2 is one directory under `topics/`,
holding a single subject's material, and it is generated rather than written.

The rule that keeps the split honest is that no subject knowledge belongs in Layer 1. The
harder rule is the consequence: if a topic cannot be generated without somebody hand
patching a file afterwards, the bug is in the Forge. Fix it there and regenerate. Patching
the topic produces a topic that works and a Forge that still does not, and the second
topic finds the same bug.

That is why `sources.json`, `topic.json`, `concepts.json`, chapter frontmatter, challenge
manifests, and the three role skills are never hand-authored. They are projections of
something upstream. Editing a projection makes it disagree with its source, and the
disagreement surfaces the next time anything is applied.

## The contract, and why its versioning is lopsided

Four places hold the same idea. The prose spec in `contract/TOPIC-CONTRACT.md` is the
source of truth. The zod schemas in `tools/src/contract.ts` are the machine-readable half.
`tools/src/validate.ts` holds the cross-file checks no schema can express. And
`contract/fixtures/tiny-topic/` is a minimal topic that satisfies all of it.

Changed in any order other than that one, the four drift. The fixture moves last and it
always moves: a contract change that leaves the fixture untouched has not been shown to
work on anything.

Versioning is deliberately asymmetric. Tightening a rule bumps `contractVersion`, and
every topic on disk then needs a migration pass before the validator will look at it.
Loosening does not bump. Adding a member to an enum, adding an optional field, relaxing a
check, extending a filename convention to a case it did not cover: none of those can
invalidate anything already written, so none of them costs a version.

The test is not how large the change feels. It is whether anything already on disk stops
validating. Adding the `python` runner was four loosenings at once and stayed at version 3.

Before bumping, the question to ask is whether the rule can be a warning instead.
`forge promote` runs the validator under `--strict`, which turns every warning into an
error, so a warning already blocks new material from being promoted while leaving existing
material valid. That is usually the whole benefit of the bump without the migration.

## The shard

A shard is one research question, scoped so a single agent can answer it well in one pass
and write the answer to its own file. Six to twelve shards for a twelve-chapter topic.

The scoping rule is that a shard is a question, not a heading. "How does the original BM25
formulation define term saturation, and what does the paper say about the k1 and b
parameters" is a shard. "BM25" is not. A heading produces a survey, and a survey cannot be
pinned to a quote, which means it cannot become a chapter.

The reason shards exist at all is cost. An earlier planning session burned a session limit
in ten minutes by fanning out four unbounded research agents at once. So no more than
three run concurrently, and each writes its file before the next batch starts. A dead
agent costs one shard. That is the whole point of the unit, and it is why `shards.md`
records status per shard: a resumed session has to be able to tell a shard that failed
from one that was never started.

Shard names carry a numeric prefix, as in `01-rag-formulation`, because source ids are
handed out in shard order and alphabetical order is how you make that match teaching
order. That convention broke the merge on the first real run, because the slug rule had
been written for chapter and challenge ids, which start with a letter by convention, and
every test used names like `a-anatomy`. The two conventions had never been in the same
room.

## The excerpt, and why the quote is the guarantee

Every non-obvious claim in a chapter carries a marker like `{{S07.a}}`. The marker
resolves to an excerpt: a URL, the exact passage the claim rests on, a locator precise
enough to find it again, and the date it was retrieved. The paraphrase goes in the prose.
The exact wording goes in the source entry.

The excerpt has to be copied, not remembered. A quote reconstructed from memory survives
every later check in this repo, because every later check trusts `sources.json`. It also
has to be long enough to stand on its own, since a four-word fragment can be made to
support nearly anything, and when a claim needs context that one sentence does not carry
the surrounding sentences get quoted too.

Two rules pull against each other here on purpose. Chapters state facts and are forbidden
from hedging. Every non-obvious claim needs a pinned quote. Together they mean the
confidence has to be earned before it is written, because a chapter cannot buy its way out
of thin research with a "may" or a "some argue".

There is one link this chain does not cover by itself. The span check confirms an auditor
quoted an excerpt correctly, and it cannot confirm the excerpt was ever in the source.
That is where a fabrication would enter and then be trusted by everything downstream,
including the check that exists to catch fabrication. `forge sources --verify` closes it by
re-fetching every source and ruling on each excerpt.

It is advisory rather than a gate, and that is a decision rather than an oversight. Its
first run against a real topic flagged quotes that were perfectly honest: ordered-list
numbers a stylesheet generates and the document text never contains, the rule line inside
an ASCII table, entity-encoded punctuation. A gate with that false-alarm rate gets
switched off within a week, and a check nobody reads is worth nothing. What it catches
cleanly is the case worth catching. On that same first run it found a source pinned to a
2.4KB summary page which could not have held the passage quoted from it.

## Folding, and why it stays narrow

Two shards researching the same subject reach the same paper by different URLs. The merge
folds spellings that name one document by construction: host without `www.`, path without
a trailing slash or a `.txt`/`.html` extension, fragment dropped. arXiv gets a rule of its
own, because a paper there is reachable through an abstract page, a PDF sibling, and two
full-text renders, all of which key to `arxiv:<id>` with the version suffix dropped.

This is not a guess about what shards do. Before `sourceKey` existed the merge compared URL
strings, and the first real research run produced four entries for two documents across two
shards, before a single chapter existed.

The rule stays narrow because the two failures are not symmetric. A visible duplicate on
the sources page is untidy. Folding two genuinely different documents into one pins a quote
to a document that does not contain it, and that defect passes every check downstream. The
same session nearly made exactly that mistake: an arXiv render and the version of record of
one paper turned out to have differently worded abstracts, and folding them would have
attributed a sentence to a document where it does not appear.

When two shards do disagree about one source, `reconcile` settles it mechanically rather
than by whichever shard sorted first. It takes the more precise date, the later retrieval,
and the less flattering `primary`, so a disagreement about whether something is a primary
source surfaces as the validator warning it ought to be.

## The map, and the one gate a human holds

The map is where a topic is actually designed: the chapter sequence, the concepts, which
chapter owns which excerpt, and what the challenges ask for. It is the only stage that
stops for a person.

The reason is arithmetic. A wrong chapter order found after twelve chapters exist costs
twelve chapters. Found at map time it costs a paragraph.

Approval is a file copy, from `map.json` to `map.approved.json`, and only the approved file
is ever applied. The generator must never make that copy. Expressing the gate as a copy
rather than as an instruction means an agent cannot approve its own design by deciding the
design is fine.

Excerpt allocation is the part of the map that does the most work. Every excerpt goes to
exactly one chapter, and that chapter is responsible for citing all of it. `forge check`
rejects a map that allocates one twice or leaves one unowned. This is what makes the
contract's two-way citation rule satisfiable by construction rather than by luck: the
validator only asks whether an excerpt was cited by somebody, and the map is what decides
who.

An unowned excerpt means research that was done and then dropped on the floor, which the
auditor cannot tell apart from research that was misplaced.

## Decisions and derivations

The plan carries no path, no filename, and no `order`. Every one of those is computed, in
the `paths` object or in the functions that project a plan onto disk.

The reason is that a field which can be derived is a field that can disagree with itself.
Putting `order: 3` in a plan alongside the chapter's position in the list creates two
answers to one question, and eventually they differ. So `order` comes from the index, quiz
paths come from the chapter id, and the evaluation spec's extension comes from the runner.

The same split runs through the whole generator. The CLI decides everything a program can
decide: the directory tree, source ids, chapter order, quiz paths, challenge manifests,
which files still owe content. The model decides everything that needs judgement: the
chapter sequence, concept boundaries, which excerpt supports which claim, prose, questions,
briefs, evaluation cases. If a model has to remember a convention, the convention is in the
wrong place.

Apply is safe to re-run because of one more distinction. Plan-derived files get rewritten
every time. Authored files are never overwritten once they hold content, so the most apply
does to a written chapter is refresh its frontmatter. A file the plan no longer accounts for
is reported as an orphan and left alone, because deleting authored prose because somebody
revised a map is not a trade this code makes.

A stub is any file containing `forge:stub`. That marker is the only thing separating a file
an author still owes from a file an author finished, which is why `forge status` reads it and
apply treats it as safe to overwrite.

## The hidden boundary, and what it actually buys

Answer keys, evaluation sets, and reference solutions live under `.hidden/` and are
committed. Anyone who clones this public repo can open them. That is fine. The material is
ordinary published knowledge and the learner owns the repo.

What the boundary buys is narrower and more useful than secrecy. No agent hands the material
over mid-challenge. Deciding to look at the answer stays a thing the learner does
deliberately, and never something that happens because a model was asked a leading question.

Tool lists cannot express this, because they restrict tools and not paths. So `tools/src/guard.ts`
runs on every file, search, and shell call from a PreToolUse hook, and denies reads of
`topics/**/.hidden/**` to everything except the two graders and the two authoring agents. It
denies writes under `topics/*/challenges/*/work/**` to everybody, which is the mechanical form
of "the repo never solves". The read list and the write list differ on purpose: a grader runs
the evaluation set it reads and has no business editing it.

The exemptions key on `agent_type`, which is absent in the main conversation and set to the
agent's name inside a subagent. So the Teacher, which runs in the main conversation, is denied
by default. That is the intended answer rather than a side effect.

The one rule with no exemptions is also a `permissions.deny` entry in `.claude/settings.json`,
so writing the learner's code stays blocked even if the hook script is deleted. The conditional
rules cannot be written that way, because a deny rule cannot ask which agent is calling.

Its limits are written down in `.claude/rules/guardrails.md` rather than left to be discovered,
because a guardrail whose gaps are undocumented gets trusted further than it has earned. Grep
from the project root reaches hidden material and is allowed, since denying it would break every
ordinary search while working on the Forge. Bash is guarded by a pattern on the command string,
which catches the direct `cat` and the loose `ls` and can be routed around by an agent
determined to do it. The hook fails open on an unparseable payload, because a guard that hard
failed on an unrecognised tool would take the session down with it.

## Why the Teacher does not hold the quiz answers

Each quiz is two files. The prompts and the passing bar are visible, and the learner may read
them. The expected answers and the accept points live in `quizzes/.hidden/` and are read only
by a grader that never saw the lesson.

Two reasons, and the second is the one that forced the split. A role that just spent half an
hour explaining a concept is the worst available judge of whether the explanation worked. And
an answer key sitting in the context of a conversation leaks into the phrasing of the next
hint, without anybody intending it and without anybody being able to see it happen.

The schema is what enforces it. The visible quiz file is a strict object, so a generator that
leaves `answer` or `accept` in it gets a schema error instead of a quiet leak.

The passing bar is visible for the same reason a challenge's thresholds are. The learner is
told what they are being held to. They are not told what a right answer looks like.

## The five rulings, and why one of them is separate

The auditor rules each claim `supported`, `overstated`, `unsupported`, `contradicted`, or
`unreachable`.

`overstated` exists because of a measured failure. The largest documented error category for
graders of this kind, at 30.6%, is insensitivity to a claim that overreaches its source: the
source says "often" and the chapter says "always", or the source rates one case and the chapter
generalises. Every shipped framework examined folds that case into `supported` and therefore
cannot see it. Worse, a house style that forbids hedging manufactures exactly this error, so
this repo produces the failure its graders would be blindest to. That is what earned the
contract version 3 bump.

`contradicted` is the weak ruling and the docs say so. Reported F1 around 45, and the failure
runs one direction: contradictions get graded as support. An auditor reporting zero
contradictions across a whole topic has not demonstrated there are none.

`unreachable` exists so that unchecked gets recorded as unchecked, rather than pushed into
whichever of pass and fail is more comfortable.

Neither agent writes a verdict. They hand over rulings, and the CLI derives the verdict and
every count from them: faithfulness passes when every claim is `supported`, critique passes
when no finding is `blocking`. An agent that cannot write the word cannot write a pass over its
own contrary evidence. It is the same trick as the quiz split, applied to a different
temptation.

There is a trap here worth naming, because a shipped framework fell into it. DeepEval has a
three-way label set and then counts anything that is not "no" as faithful unless a flag is set.
The label exists in the prompt and evaporates in the arithmetic. Whenever a label is added
here, the thing to check is what the derivation does with it.

## The span check

A ruling names the marker it rests on and quotes, verbatim, the nearest thing that excerpt
actually says, or the literal `NOTHING FOUND`. Then `forge verify` resolves the marker and
confirms the quote appears in that excerpt, ignoring only whitespace and case. A quote that
does not appear is rejected, and one invented quote discards that chapter's whole audit rather
than that single claim.

This is the load-bearing part of the verification layer, and it is arithmetic rather than
judgement for a documented reason. A model asked to quote a supporting passage will supply a
fluent one whether or not it exists, and fabricated citations are measured to flip somewhere
between 12 and 29 percent of judge verdicts. Instructing an auditor to be strict does not fix
that. The published attempts at strictness-by-instruction move the numbers barely or in the
wrong direction, and judges told to be harsh went lenient instead. Resolving the marker and
looking does fix it.

One related detail looks like tidiness and is not. `quote` is declared before `ruling`, and
`detail` before `severity`. A model emitting JSON emits it in field order, so writing the
evidence before the verdict is the intervention rather than a formatting preference. It is
also the cleanest measured result in the whole research pass behind this layer: reordering
alone moved a reported agreement score from 0.06 to 0.23. Do not reorder those fields.

## Hedging, and the one legal way out

Chapters state facts. The validator rejects `may`, `might`, `perhaps`, `possibly`, `probably`,
`arguably`, and nine more, outside fenced code and blockquotes. Quoted source text is exempt,
since it is somebody else's wording.

That rule creates a real problem, and the escape exists for it. Some subjects are full of
numbers everybody uses and nobody measured. A chapter on retrieval has to say something about
chunk size, and no primary source settles it. Writing "chunking at 512 tokens works well"
asserts a finding nobody published, and the auditor rules it unsupported. Writing "chunk size
may affect quality" is a hedge and the validator rejects it. Both are wrong, because the
honest statement is neither.

The sanctioned form carries `<!-- allow-hedge: reason -->` and does three things. It states
the practice and cites who recommends it, so the claim being made is "these people recommend
this", which is checkable. It says the recommendation carries no measurement, outright, rather
than smuggling that in as a qualifier. And the reason on the escape names the gap, so the
auditor knows what it is ruling on.

One boundary matters and is easy to cross by accident. The scope of an absence claim is the
source, never the field. Saying that nobody has measured chunk size is a claim about an entire
literature, no excerpt can carry it, and the auditor rules it unsupported, so a sentence
written to be honest fails the chapter. Say what the cited source does and does not contain,
which is a claim about a document somebody can open.

The escape suppresses the hedge scan for its paragraph and nothing else. Citation density
still applies. A paragraph using it to avoid sourcing a claim is the defect the mechanism
exists to prevent.

Contested material is the third case and needs no escape at all. "X and Y disagree on Z. X
argues A, Y argues B", with both cited, is a fact about the field.

## Token discipline

This is a stated requirement rather than a preference, and it has a cost attached: a session
limit burned in ten minutes by four unbounded research agents.

The design follows from what loads when. `CLAUDE.md` loads in full at every session start, so
it stays under 200 lines and `@path` imports are banned in it, since imported content loads
with its parent and would only pretend the file is shorter. Anything narrow goes in
`.claude/rules/` with a `paths:` glob, which costs nothing until a matching file is touched.
Skill descriptions are the recurring cost because every description loads at startup, so they
are one sentence each and the detail lives in the body, which loads on invocation. Heavy
reference material goes into files a body reads on demand.

Per-topic skills live under `topics/<slug>/.claude/skills/` and load the first time a file in
that topic is touched, which is why a repo with ten topics costs the same at startup as one
with a single topic.

Two operational rules come from the same place. Anything that reads a lot of material goes to
a subagent, so only the conclusion returns to the parent context. And fan-out work checkpoints
after each unit, so a dead agent costs one shard rather than the run.

## What the verification layer does not do

Worth reading before trusting a passing audit. One chapter went through three audit and
critique passes, revised between each on the findings the previous pass named, validating
clean under `--strict` every time. It failed all three.

The claim count rose from 32 to 36 to 40 across passes, on text that changed in one passage
each time. A chapter does not have a fixed number of claims in it. It has as many as a given
pass chooses to cut it into, which means any per-claim rate computed off a single pass
describes that pass rather than the chapter.

Two of pass two's three findings sat in places the revision had barely touched, so they were
most likely present and uncaught in pass one. Passing an audit is weak evidence. Failing one
is strong evidence.

The critic is the less reliable of the two agents, and its own instructions say so, because
bias is markedly worse on subjective comparison than on fact-checking. Pass one examined three
terms, said each was glossed in place by the sentence carrying it, and declined to raise them.
Pass three made those same terms its leading finding on the grounds that they arrive cold.
Same section, opposite rulings, no intervening edit.

The finding that matters most is structural rather than statistical. The two agents can demand
incompatible things. Pass two's critic asked for a correspondence to be stated because a quiz
question turned on it. A writer added it, citing the two nearest excerpts. Pass three's auditor
ruled the addition unsupported, because nothing pinned gives that boundary. The critic asked
for material the sources cannot carry, the writer wrote it, and the auditor failed it.

Nothing in the design arbitrates that, and the loop has no fixed point. The resolution is not
to pick a winner between the agents. A critic asking for new material is asking for a claim,
and a claim needs a source before it needs prose. Where the research never covered the point,
the honest outcomes are to go back to the research stage or to cut the quiz question.

Two consequences are now in the verify playbook. Revision rounds are capped, and a critic
finding that calls for new material gets checked against `sources.json` before a writer acts on
it.

One more caution about numbers. If this layer is ever measured against human judgement, report
the chance-corrected figure. The widely cited "85 percent, better than humans" corresponds to a
chance-corrected agreement of about 0.48, and judges with 0.99 test-retest stability have
scored 0.41. Raw agreement lets a stable and biased checker certify itself.
