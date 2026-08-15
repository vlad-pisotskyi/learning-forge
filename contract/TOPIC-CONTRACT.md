# The topic contract

Version 3.

Every topic the Forge generates satisfies this contract. The contract exists so a
generated topic can be checked by a program instead of by reading it, and so that
the generator, the three roles, and the two verification agents all agree on where
things are and what shape they have without coordinating through prose.

Anything the validator can check, it checks. Where a rule needs judgment, this
document says which agent makes the call.

Run the checker with:

```
npm run validate -- topics/<slug>
npm run validate:all
```

Errors fail the run. Warnings print and pass, unless `--strict` is passed, which
promotes every warning to an error. A topic is not finished while `npm run validate`
reports anything.

---

## 1. Directory shape

```
topics/<slug>/
  topic.json                     manifest: order, identity, status
  concepts.json                  the concept registry
  sources.json                   every source, with the exact quoted excerpts
  chapters/
    ch01-<slug>.md               one chapter, YAML frontmatter + prose
    ch02-<slug>.md
  quizzes/
    ch01.quiz.json               the questions, and the bar. The learner may read this.
    .hidden/
      ch01.key.json              expected answers and accept points. The grader only.
  challenges/
    c01-<slug>/
      challenge.json             manifest: position, concepts, interface, eval
      brief.md                   the learner-facing problem statement
      rubric.md                  what the Judge scores against
      starter/                   committed scaffolding
      work/                      the learner's attempt (local-only, gitignored)
      .hidden/
        eval/                    held-out evaluation set
        solution/                reference solution
  corpus/                        data the challenges run against
  .state/
    progress.json                learner progress (local-only, gitignored)
    help-log.md                  the Helper's continuity log (local-only, gitignored)
  .claude/skills/
    teach/SKILL.md               the topic's Teacher
    help/SKILL.md                the topic's Helper
    judge/SKILL.md               the topic's Judge
```

`<slug>` is kebab-case, `^[a-z][a-z0-9-]{1,48}$`, and the topic directory name equals
`topic.json`'s `slug`.

Chapter files are named `<id>-<slug>.md` where the id matches `^ch\d{2}$`. Challenge
directories are named `<id>-<slug>` where the id matches `^c\d{2}$`. Quiz files are
named `<chapterId>.quiz.json` and their keys `.hidden/<chapterId>.key.json`. The
validator reads ids from frontmatter and manifests,
then confirms the filenames agree, so a renamed file cannot silently detach from its
metadata.

### What is committed

Everything above is committed except `work/` and `.state/`, which are gitignored.
Hidden evaluation sets, answer keys, and reference solutions **are** committed. They
are the material, and the repo is only useful with them. The guarantee is not that a
human cannot find them; it is that no agent surfaces them.

There are two `.hidden/` directories, serving the same purpose at different scales.
`quizzes/.hidden/` holds answer keys and is readable only by the quiz grader.
`challenges/<id>/.hidden/` holds evaluation sets and reference solutions and is
readable only by the Judge. Both graders run in isolated contexts that return a
verdict and nothing else. The Teacher and the Helper read neither.

The Teacher asks the questions without holding the answers. That split exists because
a role that just spent half an hour explaining a concept is the worst available judge
of whether the explanation worked, and because an answer key sitting in the context of
a conversation leaks into the phrasing of the next hint.

Nothing outside a `.hidden/` directory may reveal hidden material. `brief.md`,
`rubric.md`, `starter/`, and the visible quiz files must not contain the string
`.hidden`, and the validator enforces that.

---

## 2. `topic.json`

```json
{
  "contractVersion": 3,
  "slug": "wiki-retrieval",
  "title": "Retrieval over Wikipedia",
  "summary": "Building and evaluating retrieval systems over encyclopedic text, from lexical scoring through reranking.",
  "generatedAt": "2026-08-12",
  "generator": { "skill": "forge-generate", "version": "0.1.0" },
  "language": "typescript",
  "status": "draft",
  "chapters": ["ch01", "ch02"],
  "challenges": ["c01"]
}
```

| Field | Rule |
|---|---|
| `contractVersion` | Must be `3`. |
| `slug` | Kebab-case; equals the directory name. |
| `title` | 4 to 80 characters. |
| `summary` | 1 to 2 sentences, 20 to 400 characters. |
| `generatedAt` | `YYYY-MM-DD`, not in the future. |
| `generator` | Which skill produced this, and at what version. |
| `language` | The default language for challenges. A challenge may override it. |
| `status` | `draft` → `validated` → `verified`. See section 9. |
| `chapters` | Ordered list of chapter ids. This is the canonical order. |
| `challenges` | Ordered list of challenge ids. |

The `chapters` and `challenges` arrays must match the files on disk exactly in both
directions: every listed id has a file, and every file is listed. An unlisted
chapter file is an error, not a draft. Park drafts outside the topic directory.

---

## 3. `concepts.json`

The registry that ties chapters, quizzes, and challenges together. Without it,
"does this challenge exercise what the preceding chapters taught" is a question only
a human can answer. With it, that check is arithmetic.

```json
{
  "contractVersion": 3,
  "concepts": [
    { "id": "term-frequency", "label": "Term frequency", "blurb": "How often a term occurs in a document." },
    { "id": "idf", "label": "Inverse document frequency", "blurb": "How much a term's rarity across the corpus raises its weight." }
  ]
}
```

Ids are kebab-case and unique. `label` is 3 to 60 characters, `blurb` is one sentence,
10 to 200 characters.

Every concept must be taught by at least one chapter. A concept nothing teaches is
an error: either a chapter is missing or the concept is noise.

---

## 4. Chapters

A chapter is one markdown file: YAML frontmatter, then prose.

```markdown
---
id: ch03
title: Ranking with BM25
order: 3
requires: [ch01, ch02]
teaches: [term-frequency, idf, bm25]
quiz: quizzes/ch03.quiz.json
estimatedMinutes: 25
status: draft
---

## Why term frequency alone ranks badly

...prose with citation markers like {{S07.a}}...
```

| Field | Rule |
|---|---|
| `id` | `^ch\d{2}$`, unique, matches the filename prefix. |
| `title` | 4 to 80 characters. |
| `order` | Positive integer; matches this chapter's index in `topic.json.chapters`, 1-based. |
| `requires` | Chapter ids that must come earlier in the order. May be empty. No cycles, no forward references. |
| `teaches` | Non-empty list of concept ids from `concepts.json`. |
| `quiz` | Path from the topic root to this chapter's quiz. Must exist. |
| `estimatedMinutes` | Integer, 5 to 120. |
| `status` | `draft` or `verified`. `verified` requires a passing `audit` block. |
| `audit` | Optional; written by the verification agents. See section 9. |

A concept may be taught by more than one chapter, but the first chapter that
teaches it is the one the Teacher and Helper point at. The validator warns when a
concept is claimed by more than two chapters, which usually means the chapter map
never decided where it belongs.

### Body rules

**Citation markers.** A marker looks like `{{S07.a}}`: a source id, a dot, an
excerpt key. Several may sit together, `{{S07.a}}{{S12.b}}`, when a claim rests on
more than one source. Every marker must resolve to an excerpt that exists in
`sources.json`. Every excerpt in `sources.json` must be cited by at least one
marker, in some chapter. An uncited excerpt means research was done and then not
used, which the faithfulness auditor cannot distinguish from research that was
misplaced.

A marker goes after the closing punctuation of the sentence it supports, separated
by one space: `Term frequency alone ranks badly. {{S07.a}}` The paraphrase is in the
prose, the exact wording is in the source entry. Do not quote long passages inline;
that is what the excerpt is for.

**No hedging.** The validator rejects these outside fenced code blocks and
blockquotes: `may`, `might`, `perhaps`, `possibly`, `probably`, `arguably`,
`some argue`, `some say`, `it is believed`, `is thought to`, `seems to`,
`tends to`, `it could be argued`, `generally considered`, `widely considered`.

Two escapes exist. Quoted source text inside a blockquote is exempt, since it is
someone else's wording. And a paragraph may carry `<!-- allow-hedge: reason -->`
when the hedge is the point, such as reporting that a question is genuinely open.
The reason is required and the auditor reads it.

Contested material is stated as contested: "X and Y disagree on Z. X argues A
{{S04.a}}; Y argues B {{S11.c}}." That is a fact about the field, not a hedge.

Unmeasured practice is the third case, and it is the one the escape exists for.
Some subjects are full of numbers everybody uses and nobody has measured. A chapter
teaching retrieval has to say something about chunk size and about how many passages
to retrieve, and there is no primary source that settles either. Writing "chunking at
512 tokens works well" asserts a finding nobody published, and the auditor rules it
unsupported. Writing "chunk size may affect quality" is a hedge and the validator
rejects it. Both outcomes are wrong, because the honest statement is neither.

The sanctioned form states the practice, cites who recommends it, and says plainly
that it was never measured:

```markdown
<!-- allow-hedge: unmeasured practice, the cited recommendation carries no measurement -->
Retrieval pipelines are commonly built with passages of roughly 500 tokens, which is
what the reference implementations ship with {{S12.a}}. That recommendation is published
without a measurement behind it {{S12.a}}. The one study that compared semantic chunking
against fixed-size chunking found the extra cost was not repaid by consistent gains
{{S12.d}}.
```

Three things make that legal rather than a loophole. The recommendation is cited, so
the claim being made is "these people recommend this", which is checkable. The absence
of evidence is stated outright instead of being smuggled in as a qualifier. And the
reason on the escape names the gap, so the auditor knows what it is ruling on.

Note what the example does not say. It does not say that nobody has measured chunk
size. That is a claim about the entire literature, no excerpt can carry it, and the
auditor rules it unsupported, so a sentence written to be honest fails the chapter. Say
what the cited source does and does not contain, which is a claim about a document
somebody can open. The scope of an absence claim is the source, never the field.

The escape suppresses the hedge scan for its paragraph and nothing else. Every other
rule still applies, citation density included. A paragraph that uses it to avoid
sourcing a claim is the defect this section exists to prevent, and the auditor rules on
it like any other.

Reach for this only when the research genuinely came back empty. A writer who cannot
find a source is not the same as a field that does not have one, and the difference is
a research question, not a drafting decision.

**Structure.** At least 400 words. At least two `##` headings. At least one
citation marker per 150 words of prose, which is a floor on sourcing density rather
than a style rule: a chapter with one marker and 2000 words is unsourced material
with a citation stapled to it.

**Prose style.** Three tells of machine-written text are checked as warnings, in
chapters and in `brief.md` and `rubric.md`: em or en dashes, curly quotation marks,
and emoji. Blockquotes and fenced code are exempt, since a quote must not be edited
and code is not prose. Warnings become errors under `--strict`, which the generator
and `forge promote` both run, so they block new material without invalidating
anything already written.

The rest of that standard cannot be checked by a program and is written down in
`.claude/skills/forge-generate/references/prose.md`: no announcing, no inflated
significance, no participle padding, no forced triads, and no closing flourish. The
critique agent rules on it.

---

## 5. Quizzes

Two files per chapter. The questions are visible; the answers are not.

### `quizzes/<chapterId>.quiz.json`

What the Teacher reads and the learner may read.

```json
{
  "contractVersion": 3,
  "chapter": "ch03",
  "questions": [
    {
      "id": "q1",
      "concept": "idf",
      "kind": "application",
      "prompt": "A term appears in every document in the corpus. What does IDF do to its weight, and why is that the behaviour you want?"
    }
  ],
  "passing": { "atLeast": 3 }
}
```

| Field | Rule |
|---|---|
| `chapter` | The owning chapter id. Must match the filename and an existing chapter. |
| `questions` | 3 to 10 questions, and never fewer than the number of concepts the chapter teaches. |
| `questions[].id` | `^q\d+$`, unique within the file. |
| `questions[].concept` | A concept id that the owning chapter `teaches`. |
| `questions[].kind` | `recall`, `application`, or `discrimination`. |
| `questions[].prompt` | 15 to 500 characters, ends with `?`. |
| `passing.atLeast` | Integer, at least 2, at most the number of questions. |

The passing bar is visible on purpose, for the same reason a challenge's thresholds
are: the learner is told what they are being held to. What they are not told is what
a right answer looks like.

### `quizzes/.hidden/<chapterId>.key.json`

What the quiz grader reads, and nothing else does.

```json
{
  "contractVersion": 3,
  "chapter": "ch03",
  "answers": [
    {
      "id": "q1",
      "answer": "IDF drives the weight toward zero, because a term present everywhere cannot discriminate between documents.",
      "accept": ["weight goes to zero or near zero", "because the term does not discriminate"],
      "sourceRefs": ["S07.a"]
    }
  ]
}
```

| Field | Rule |
|---|---|
| `chapter` | Must match the visible quiz and the filename. |
| `answers` | Exactly one entry per question in the visible file, same ids, no extras. |
| `answers[].answer` | The expected answer as prose, 10 to 800 characters. |
| `answers[].accept` | 1 to 5 points a passing answer must contain. The grader scores against these, not against exact wording. |
| `answers[].sourceRefs` | Optional excerpt refs (`S07.a`) backing the answer. Must resolve. |

Every concept the chapter `teaches` is covered by at least one question, and at
least one question is `application` or `discrimination`. Those two rules together
put a ceiling on a chapter: it cannot teach more concepts than a quiz has room for
questions, because one question names exactly one concept. The map stage checks
that, so a chapter overreaching is caught before any prose is written rather than
after sixteen chapters exist. A quiz made only of
`recall` questions tests whether the chapter was read, not whether it was
understood.

`discrimination` questions ask the learner to tell two things apart, which is the
shape of question that catches a confusion a recall question sails past.

The split is what lets the Teacher quiz without being able to lead. It asks the
prompts, collects the answers, and hands both to a grader that never saw the lesson.
Grading against `accept` points rather than wording is the same rule as before; only
who applies it has moved.

---

## 6. Sources

One file, `sources.json`, for the whole topic.

```json
{
  "contractVersion": 3,
  "sources": [
    {
      "id": "S07",
      "kind": "paper",
      "title": "The Probabilistic Relevance Framework: BM25 and Beyond",
      "authors": ["Stephen Robertson", "Hugo Zaragoza"],
      "published": "2009",
      "url": "https://www.staff.city.ac.uk/~sbrp622/papers/foundations_bm25_review.pdf",
      "identifier": "doi:10.1561/1500000019",
      "retrieved": "2026-08-12",
      "primary": true,
      "excerpts": [
        {
          "key": "a",
          "locator": "§3.1, p. 17",
          "quote": "the exact sentence or passage, copied verbatim from the source, that the claim rests on"
        }
      ]
    }
  ]
}
```

| Field | Rule |
|---|---|
| `id` | `^S\d{2,3}$`, unique. |
| `kind` | `paper`, `report`, `docs`, `spec`, `book`, `dataset`, `code`, or `standard`. |
| `title` | 4 to 300 characters. |
| `authors` | Non-empty for `paper` and `book`; optional otherwise. |
| `published` | `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`. Record the precision the source states and no more. |
| `url` | Absolute `http`/`https`. |
| `identifier` | Optional DOI, arXiv id, RFC number, ISBN. Warned for `paper` and `book`, which are the kinds that have one. |
| `retrieved` | `YYYY-MM-DD`, not in the future. |
| `primary` | Whether this is a primary source. |
| `excerpts` | Non-empty. |
| `excerpts[].key` | `^[a-z]{1,3}$`, unique within the source. |
| `excerpts[].quote` | 20 to 1500 characters, verbatim. |
| `excerpts[].locator` | Where in the source: section, page, heading, or line range. |

`report` is for work that measures something and publishes it outside a venue: a
company technical report, a lab write-up, an evaluation posted to a project site. It
is not `paper`, because there is no venue, no peer review, and no DOI or arXiv id to
record. It is not `docs`, because documentation tells you how to use a thing and a
report tells you what somebody found. The distinction is load bearing in exactly one
place: the validator warns when a `paper` or a `book` carries no identifier, since
one exists and was not recorded, and it does not warn for a `report`, because none
exists to find. Marking a self-published report as `paper` to look more authoritative
is the misuse to watch for, and marking one as `docs` to dodge the identifier warning
is the other.

A subject whose defaults come from practitioners will have several of these, and
that is not a weakness in the topic. It is what the subject looks like.

`primary: false` on one source is not a finding at all. A blog post explaining a
paper is sometimes the clearest thing to point a learner at, and a subject whose
defaults come from practitioners rather than papers has to cite the practitioners
to teach honestly. The question is asked of the topic instead: when more than half
the sources are secondary, the validator warns once, reports how many of them are
not primary and names which, because a topic built mostly on secondary material has
not done its reading.

The per-source form of this was a warning on every secondary entry, and `promote`
runs `--strict`, so it made `primary: false` unusable. A flag that cannot be set
without blocking the topic is not a flag.

The excerpt is the entire basis of the guarantee. It must be copied verbatim, not
reconstructed from memory, and it must be long enough to stand on its own. A
four-word fragment can be made to support almost anything. When a claim needs
context that one sentence does not carry, quote the surrounding sentences too.

`npm run forge -- sources <slug> --verify` re-fetches every source and reports which
excerpts are still in it. It is advisory rather than a validator rule, because a
rendered page differs from its own text in ways an honest quotation cannot avoid:
list numbering comes from a stylesheet, tables carry rules a quotation omits, and a
quote copied from a rendered page carries typographic marks the source never had. It
is worth running anyway, because the failure it does catch cleanly, a quote pinned to
a URL whose document does not contain it, is the one failure that survives every
other check in this repo.

---

## 7. Challenges

```
challenges/c02-bm25-from-scratch/
  challenge.json
  brief.md
  rubric.md
  starter/
  work/          created by the learner, gitignored
  .hidden/
    eval/
    solution/
```

### `challenge.json`

```json
{
  "contractVersion": 3,
  "id": "c02",
  "title": "BM25 from scratch",
  "afterChapter": "ch05",
  "exercises": ["term-frequency", "idf", "bm25"],
  "language": "typescript",
  "estimatedHours": 3,
  "brief": "brief.md",
  "rubric": "rubric.md",
  "interface": {
    "entrypoint": "work/src/index.ts",
    "exports": [
      {
        "name": "buildIndex",
        "signature": "(docs: Document[]) => Index",
        "description": "Tokenise, count, and store whatever ranking needs."
      },
      {
        "name": "search",
        "signature": "(index: Index, query: string, k: number) => Result[]",
        "description": "Return the k highest-scoring documents, best first."
      }
    ]
  },
  "eval": {
    "runner": "vitest",
    "spec": ".hidden/eval/c02.eval.ts",
    "metrics": [
      { "name": "recall@10", "threshold": 0.8, "direction": "gte" },
      { "name": "mrr", "threshold": 0.5, "direction": "gte" }
    ]
  },
  "reference": ".hidden/solution"
}
```

| Field | Rule |
|---|---|
| `id` | `^c\d{2}$`, matches the directory prefix and `topic.json.challenges`. |
| `afterChapter` | The chapter the learner must finish first. Must exist. |
| `exercises` | Non-empty concept ids. **Every one must be taught by a chapter at or before `afterChapter`.** |
| `language` | This challenge's language. Defaults to `topic.json.language`. |
| `estimatedHours` | Number, 0.5 to 40. |
| `brief`, `rubric` | Paths relative to the challenge directory. Must exist and be non-empty. |
| `interface.entrypoint` | Path under `work/` that the eval set imports. |
| `interface.exports` | Non-empty. Name, signature, and one-line description for each. |
| `eval.runner` | `vitest`, `node`, or `python`. |
| `eval.spec` | Path under `.hidden/`. Must exist. |
| `eval.metrics` | Non-empty. Each has a name, a numeric threshold, and `gte` or `lte`. |
| `reference` | Path under `.hidden/`. Must exist and contain at least one file. |

The `exercises`-before-`afterChapter` rule is the mechanical version of "the
challenge exercises what the chapters taught". It catches the failure where a
challenge quietly needs an idea the learner has not met yet. It does not catch the
opposite failure, a challenge that exercises nothing the chapters bothered to
teach; that one is the critique agent's call.

`interface.exports` is a public contract on purpose. The hidden evaluation set
imports the learner's entrypoint, so the signatures have to be pinned somewhere the
learner can read. Pinning them here means the eval set can be strict about the API
without the learner having to guess it.

A topic may mix languages. `topic.json.language` is the default its chapters are
written against, and a challenge that sets its own `language` overrides it, because a
subject taught in one language sometimes has to be practised in another: document
layout extraction and retrieval evaluation live in Python whatever the surrounding
material is written in. The validator does not compare the two fields. It compares the
challenge's language against its own runner, and only for Python, which is the one
pairing it can rule on: `vitest` and `node` both run TypeScript and JavaScript, so a
disagreement there is not knowable from the runner alone.

The evaluation set's filename follows the runner: `<id>.eval.ts` for `vitest` and
`node`, `<id>.eval.py` for `python`. The reference solution mirrors the entrypoint, so
it inherits the entrypoint's extension without a separate rule.

### `brief.md`

The problem statement, written for someone who has read the preceding chapters and
nothing else. States what to build, the interface to implement, the corpus to run
against, and the metrics that will be measured with their thresholds. Learners are
told the bar. They are not told the test cases.

No frontmatter. Must not mention `.hidden`. Must not contain a working
implementation. A type signature or a two-line usage example is fine, a function
body is not.

### `rubric.md`

What the Judge scores against, beyond the numbers. Written as criteria with weights
that sum to 100. Each criterion names what a full-credit answer contains, so the
Judge's "here is what you left out" has something concrete to point at.

The rubric is committed outside `.hidden/` and the learner may read it. That is
intended: a rubric the learner can read is a specification, and hiding the criteria
would only teach them to guess.

### `.hidden/eval/`

The held-out evaluation set: test files plus whatever fixtures and labelled
judgements they need. It imports the learner's entrypoint and produces the metrics
named in `challenge.json`. Only the Judge runs it.

It reports each metric by printing one line to stdout:

```
metric <name> <value>
```

The name matches a `eval.metrics[].name` exactly and the value is a number, with an
optional minus sign and an optional decimal part. One line per declared metric. This
is the whole interface between an evaluation set and whatever is scoring it, which is
what lets `eval.runner` be `vitest`, `node`, or `python` without the scorer caring.

The three runners differ only in what gets spawned. `vitest` runs the spec under a
generated config that pins the include pattern and the root; `node` and `python` spawn
the spec directly and read its stdout. A language reaches this contract by being able
to print a line, which is why adding one is a loosening rather than a new subsystem.

`python` spawns `python3` and needs nothing installed beyond it. Deliberately not
pytest: the metric protocol is stdout, so a test framework's assertions and reporting
sit outside the only channel the scorer reads, and requiring one would mean a fresh
clone of this repo could not run its own fixture.

Thresholds are not the evaluation set's business. It prints the numbers and the runner
compares them to `challenge.json`, so the bar exists in exactly one place. An
evaluation set that asserts its own thresholds has put the bar in two places, and they
will disagree.

The validator checks that the spec reaches the learner's code and that it names each
declared metric somewhere in its source. Reaching the code is read as `work` appearing
as a path segment, not as an import statement, because languages disagree about what an
import looks like: a TypeScript spec writes `from "../work/src/index.ts"` and a Python
one puts `"work"` on `sys.path` and imports a module by name. Both name the directory,
and that is the most any language-agnostic reading can ask for. It deliberately does not look for the literal
`metric <name>` text, because an evaluation set that prints its lines through a helper
taking the name as an argument is correct and would fail that reading. Whether the
lines are printed at all is settled by running the thing, which is what the dry run
below does: `forge eval` fails a challenge whose evaluation set reports no value for a
declared metric. Neither check can tell whether the numbers mean anything.

### `.hidden/solution/`

A working reference implementation, mirroring `work/`: an entrypoint of
`work/src/index.ts` puts the reference at `.hidden/solution/src/index.ts`.

It exists so the Judge can compare approaches, and so the Forge can prove the
challenge is solvable within the interface it specified. A challenge whose reference
solution does not pass its own evaluation set is broken.

That proof is a command, not an assertion:

```
npm run forge -- eval <slug> <challengeId> --reference
```

It stages a copy of the challenge under `.forge-cache/`, because the evaluation set
imports `work/` and `work/` belongs to the learner. The staged `work/` is the starter
with the code under test laid over it, in that order, which is what a learner's work
tree is once they have followed the brief. So a reference may rely on a module the
starter provides, and only the entrypoint has to be duplicated.

The reference is never staged when a learner's submission is being scored. Nothing
forces an evaluation set to import `work/` rather than whatever sits nearest to it, so
the answer is simply not present in the tree.

### `corpus/`

Shared data the challenges run against, at the topic root rather than inside any one
challenge, because a corpus built for an early challenge is usually the same corpus a
later one needs.

A corpus is optional. Some subjects hand a challenge its input as an argument: a
function that classifies an integer, parses a string, or implements an algorithm over
values the evaluation set constructs has nothing to load from disk, and an empty
`corpus/` is the correct state for that topic. Requiring a file there would only
produce one written to satisfy a checker.

What the validator does check is that a challenge pointing at corpus data finds it. A
brief, a starter file, or an evaluation set that names a path under `corpus/` when no
such file exists is an error, because the challenge cannot be attempted. The check is
on the reference, not on the directory: a corpus nobody names is silent, and a name
that resolves to nothing is a defect no matter how full the directory is.

Corpus files are committed. When one challenge builds a corpus another will reuse, the
second reads it rather than rewriting it, and a challenge building its own names the
files `<challengeId>-*.json` so that two authors working at once cannot collide.

---

## 8. Progress state

`topics/<slug>/.state/progress.json`. Local-only, gitignored, written by the
Teacher and the Judge, read by all three roles.

```json
{
  "contractVersion": 3,
  "topic": "wiki-retrieval",
  "updated": "2026-08-12T09:31:00Z",
  "chapters": {
    "ch01": {
      "status": "passed",
      "quizScore": 4,
      "quizOf": 4,
      "missedConcepts": [],
      "at": "2026-08-11T18:02:00Z"
    },
    "ch02": { "status": "needs-review", "quizScore": 2, "quizOf": 4, "missedConcepts": ["idf"], "at": "2026-08-12T09:31:00Z" }
  },
  "weakConcepts": ["idf"],
  "challenges": {
    "c01": {
      "status": "submitted",
      "attempts": 2,
      "best": { "recall@10": 0.72 },
      "rubricScore": 68,
      "rubricGaps": ["no stopword handling", "index rebuilt on every query"],
      "at": "2026-08-12T08:10:00Z"
    }
  }
}
```

Chapter status is `unread`, `in-progress`, `passed`, or `needs-review`. Challenge
status is `not-started`, `in-progress`, `submitted`, or `passed`.

`weakConcepts` is the union of `missedConcepts` across chapters, minus anything
since re-quizzed clean. It is the only cross-chapter state the Teacher loads, which
is what keeps a session from having to read the whole book to know where the learner
is.

The file is optional. A topic with no progress file is a topic nobody has started,
and the Teacher creates it on first use.

### `.state/help-log.md`

Every exchange with the Helper for this topic, oldest first, each entry the challenge
id, an instant, and the two lines the Helper ended its reply with. Also local-only and
gitignored.

The Helper runs in a forked context that is discarded when it replies, so this log is
the only way it knows what it already said. It does not write the log itself; a
SubagentStop hook does, from the Helper's own closing summary. That is not a detail of
convenience. The Helper has no write tools so that it cannot write the learner's code,
and a role that could append to a file could append to theirs.

The validator does not check this file. It is prose written by a hook, it holds nothing a
generated topic owes, and a topic with no help log is a topic where nobody got stuck.

---

## 9. Status and verification

Three statuses, and they move in one direction.

**`draft`**: generated, not yet checked. The generator writes this.

**`validated`**: `npm run validate -- topics/<slug> --strict` passes with no errors
and no warnings. This is mechanical and says nothing about whether the material is
any good.

**`verified`**: both verification agents have passed every chapter. The critique
agent rules on pedagogical quality: ordering, prerequisite gaps, whether challenges
exercise what preceded them. The faithfulness auditor rules claim by claim on
whether each cited excerpt actually supports the claim it is attached to.

Chapters carry their own audit record:

```yaml
audit:
  faithfulness:
    verdict: pass
    at: 2026-08-12
    claims: 34
    supported: 34
    unsupported: 0
    overstated: 0
    contradicted: 0
    unreachable: 0
  critique:
    verdict: pass
    at: 2026-08-12
```

A chapter with `status: verified` must carry both verdicts as `pass`. A topic with
`status: verified` requires every chapter verified. The validator enforces both, so
"verified" cannot be set by hand on material that was never audited.

Neither verdict is the auditing agent's to write. An agent hands over rulings, one per
claim, and `npm run forge -- verify <slug>` derives the verdict and every count from
them. Faithfulness passes when every claim is `supported`. Critique passes when no
finding is `blocking`. A dimension nobody has audited yet is `pending`, which is a
third verdict rather than a `fail`, because a chapter that was never checked and a
chapter that failed its check are different situations and collapsing them loses the
one piece of information that says what to do next. This is the same arrangement as the quiz split: an agent cannot
report a pass over a chapter it also reported three unsupported claims in, because it
never gets to write the word.

### The five rulings

`supported`: the cited excerpt carries the claim.

`overstated`: the excerpt supports a weaker version of it. The source says "often"
and the chapter says "always", or the source rates one case and the chapter
generalises. This is a separate ruling and not a shade of `supported` because a house
style that forbids hedging manufactures exactly this error, and because the graders
that fold it into `supported` are measurably the ones that never catch it.

`unsupported`: the excerpt says nothing on the point.

`contradicted`: the excerpt says the opposite. Worth stating plainly that this is the
ruling models are worst at, and that the documented failure is grading a contradiction
as support, so an auditor reporting zero contradictions across a whole topic has not
demonstrated there are none.

`unreachable`: the source could not be read. It exists so that unchecked is recorded
as unchecked rather than being pushed into whichever of pass or fail is more
comfortable.

### The eight finding kinds

A critique finding carries a kind and a severity. The kinds are fixed, for the same
reason the rulings are: a critic writing free-form prose produces findings nobody can
count, and a fixed set makes "six of these are unexercised concepts" a fact rather than
an impression.

`prerequisite-gap`: the chapter needs a concept that no earlier chapter taught.

`ordering`: a concept is used before the chapter introduces it.

`concept-not-taught`: the frontmatter claims a concept the prose never covers.

`concept-not-exercised`: a concept is taught and no challenge ever makes the learner
use it. This is the one that catches a topic teaching more than it tests.

`unexplained-term`: a term appears cold, with no definition and no citation.

`example-missing`: a claim that needs a worked case to land does not get one.

`quiz-mismatch`: a question tests something the chapter did not teach.

`prose`: it reads as machine output. The three mechanical tells are the validator's;
this covers what only a reader can see.

Severity is `blocking` or `advisory`, and it comes last in the schema for the same
reason `ruling` comes after `quote`. Naming the problem before grading its weight is
the one mitigation in the judge literature with a clean measured effect.

### Every quoted span is checked

A ruling names the marker it rests on and quotes, verbatim, the nearest thing that
excerpt actually says, or the literal `NOTHING FOUND`. The quote is written before the
ruling, not after it.

`forge verify` then resolves the marker and confirms the quote appears in that
excerpt, ignoring only whitespace and case. A quote that does not appear is rejected
and the chapter is not stamped at all.

That check is the load-bearing one, and it is arithmetic rather than judgement for a
reason. A model asked to quote a supporting passage will supply a fluent one whether or
not it exists, and a fabricated citation is documented to flip a large minority of
judge verdicts. Instructing an auditor to be strict does not fix this; the published
attempts at strictness-by-instruction move the numbers barely or in the wrong
direction. Resolving the marker and looking does fix it.

---

## 10. Changing this contract

The contract is versioned by `contractVersion`, which every file carries. Adding an
optional field is a compatible change and does not bump the version. Adding a
required field, removing a field, tightening a rule, or changing a filename
convention bumps it, and the validator then refuses topics at the older version until
they are migrated.

Version 2 split the quiz in two: `quizzes/<chapterId>.quiz.json` kept the prompts and
the passing bar, and the answers and `accept` points moved to
`quizzes/.hidden/<chapterId>.key.json` so the Teacher no longer holds the key to the
quiz it administers.

Version 3 added `overstated` to the faithfulness rulings and to the audit block's
counts, after a research pass on how graders of this kind actually fail. The finding
that forced it: the single largest documented error category for judges of this type is
insensitivity to a claim that overreaches its source, and every shipped framework
examined folds that case into "supported" and so cannot see it. A required count is a
version bump, and this was the cheapest moment to take one, with no topic yet generated
to migrate.

The order of work when the contract changes: edit this document, then the schemas in
`tools/src/contract.ts`, then the validator's checks, then the fixture in
`contract/fixtures/tiny-topic/`. The fixture is what proves the validator still
works, so it moves last and it always moves.
