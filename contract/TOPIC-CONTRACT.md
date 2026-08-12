# The topic contract

Version 1.

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
    ch01.quiz.json               questions, expected answers, passing bar
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
  .claude/skills/
    teach/SKILL.md               the topic's Teacher
    help/SKILL.md                the topic's Helper
    judge/SKILL.md               the topic's Judge
```

`<slug>` is kebab-case, `^[a-z][a-z0-9-]{1,48}$`, and the topic directory name equals
`topic.json`'s `slug`.

Chapter files are named `<id>-<slug>.md` where the id matches `^ch\d{2}$`. Challenge
directories are named `<id>-<slug>` where the id matches `^c\d{2}$`. Quiz files are
named `<chapterId>.quiz.json`. The validator reads ids from frontmatter and manifests,
then confirms the filenames agree, so a renamed file cannot silently detach from its
metadata.

### What is committed

Everything above is committed except `work/` and `.state/`, which are gitignored.
Hidden evaluation sets and reference solutions **are** committed — they are the
material, and the repo is only useful with them. The guarantee is not that a human
cannot find them; it is that no agent surfaces them. The Teacher and Helper are
denied read access to `.hidden/`, and the Judge reads it inside an isolated context
that returns a verdict and nothing else.

Nothing outside `.hidden/` may reveal hidden material. `brief.md`, `rubric.md`, and
`starter/` must not contain the string `.hidden`, and the validator enforces that.

---

## 2. `topic.json`

```json
{
  "contractVersion": 1,
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
| `contractVersion` | Must be `1`. |
| `slug` | Kebab-case; equals the directory name. |
| `title` | 4–80 characters. |
| `summary` | 1–2 sentences, 20–400 characters. |
| `generatedAt` | `YYYY-MM-DD`, not in the future. |
| `generator` | Which skill produced this, and at what version. |
| `language` | Primary language for challenges. `typescript` for now. |
| `status` | `draft` → `validated` → `verified`. See section 9. |
| `chapters` | Ordered list of chapter ids. This is the canonical order. |
| `challenges` | Ordered list of challenge ids. |

The `chapters` and `challenges` arrays must match the files on disk exactly in both
directions: every listed id has a file, and every file is listed. An unlisted
chapter file is an error, not a draft — park drafts outside the topic directory.

---

## 3. `concepts.json`

The registry that ties chapters, quizzes, and challenges together. Without it,
"does this challenge exercise what the preceding chapters taught" is a question only
a human can answer. With it, that check is arithmetic.

```json
{
  "contractVersion": 1,
  "concepts": [
    { "id": "term-frequency", "label": "Term frequency", "blurb": "How often a term occurs in a document." },
    { "id": "idf", "label": "Inverse document frequency", "blurb": "How much a term's rarity across the corpus raises its weight." }
  ]
}
```

Ids are kebab-case and unique. `label` is 3–60 characters, `blurb` is one sentence,
10–200 characters.

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
| `title` | 4–80 characters. |
| `order` | Positive integer; matches this chapter's index in `topic.json.chapters`, 1-based. |
| `requires` | Chapter ids that must come earlier in the order. May be empty. No cycles, no forward references. |
| `teaches` | Non-empty list of concept ids from `concepts.json`. |
| `quiz` | Path from the topic root to this chapter's quiz. Must exist. |
| `estimatedMinutes` | Integer, 5–120. |
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
marker, in some chapter — an uncited excerpt means research was done and then not
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
when the hedge is the point — reporting that a question is genuinely open, for
instance. The reason is required and the auditor reads it.

Contested material is stated as contested: "X and Y disagree on Z. X argues A
{{S04.a}}; Y argues B {{S11.c}}." That is a fact about the field, not a hedge.

**Structure.** At least 400 words. At least two `##` headings. At least one
citation marker per 150 words of prose, which is a floor on sourcing density rather
than a style rule — a chapter with one marker and 2000 words is unsourced material
with a citation stapled to it.

---

## 5. Quizzes

One file per chapter, at `quizzes/<chapterId>.quiz.json`.

```json
{
  "contractVersion": 1,
  "chapter": "ch03",
  "questions": [
    {
      "id": "q1",
      "concept": "idf",
      "kind": "application",
      "prompt": "A term appears in every document in the corpus. What does IDF do to its weight, and why is that the behaviour you want?",
      "answer": "IDF drives the weight toward zero, because a term present everywhere cannot discriminate between documents.",
      "accept": ["weight goes to zero or near zero", "because the term does not discriminate"],
      "sourceRefs": ["S07.a"]
    }
  ],
  "passing": { "atLeast": 3 }
}
```

| Field | Rule |
|---|---|
| `chapter` | The owning chapter id. Must match the filename and an existing chapter. |
| `questions` | 3–8 questions. |
| `questions[].id` | `^q\d+$`, unique within the file. |
| `questions[].concept` | A concept id that the owning chapter `teaches`. |
| `questions[].kind` | `recall`, `application`, or `discrimination`. |
| `questions[].prompt` | 15–500 characters, ends with `?`. |
| `questions[].answer` | The expected answer as prose, 10–800 characters. |
| `questions[].accept` | 1–5 points a passing answer must contain. The Teacher grades against these, not against exact wording. |
| `questions[].sourceRefs` | Optional excerpt refs (`S07.a`) backing the answer. Must resolve. |
| `passing.atLeast` | Integer, at least 2, at most the number of questions. |

Every concept the chapter `teaches` is covered by at least one question, and at
least one question is `application` or `discrimination`. A quiz made only of
`recall` questions tests whether the chapter was read, not whether it was
understood.

`discrimination` questions ask the learner to tell two things apart — the shape of
question that catches a confusion a recall question sails past.

---

## 6. Sources

One file, `sources.json`, for the whole topic.

```json
{
  "contractVersion": 1,
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
| `kind` | `paper`, `docs`, `spec`, `book`, `dataset`, `code`, or `standard`. |
| `title` | 4–300 characters. |
| `authors` | Non-empty for `paper` and `book`; optional otherwise. |
| `published` | `YYYY` or `YYYY-MM-DD`. |
| `url` | Absolute `http`/`https`. |
| `identifier` | Optional DOI, arXiv id, RFC number, ISBN. Recommended for papers. |
| `retrieved` | `YYYY-MM-DD`, not in the future. |
| `primary` | Whether this is a primary source. |
| `excerpts` | Non-empty. |
| `excerpts[].key` | `^[a-z]{1,3}$`, unique within the source. |
| `excerpts[].quote` | 20–1500 characters, verbatim. |
| `excerpts[].locator` | Where in the source: section, page, heading, or line range. |

`primary: false` is a warning, not an error. A blog post explaining a paper is
sometimes the clearest thing to point a learner at, but a topic where most sources
are secondary has not done its reading.

The excerpt is the entire basis of the guarantee. It must be copied verbatim, not
reconstructed from memory, and it must be long enough to stand on its own — a
four-word fragment can be made to support almost anything. When a claim needs
context that one sentence does not carry, quote the surrounding sentences too.

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
  "contractVersion": 1,
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
| `language` | Matches `topic.json.language` unless deliberately different. |
| `estimatedHours` | Number, 0.5–40. |
| `brief`, `rubric` | Paths relative to the challenge directory. Must exist and be non-empty. |
| `interface.entrypoint` | Path under `work/` that the eval set imports. |
| `interface.exports` | Non-empty. Name, signature, and one-line description for each. |
| `eval.runner` | `vitest` or `node`. |
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

### `brief.md`

The problem statement, written for someone who has read the preceding chapters and
nothing else. States what to build, the interface to implement, the corpus to run
against, and the metrics that will be measured with their thresholds. Learners are
told the bar. They are not told the test cases.

No frontmatter. Must not mention `.hidden`. Must not contain a working
implementation — a type signature or a two-line usage example is fine, a function
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
relevance judgements they need. It imports the learner's entrypoint and produces
the metrics named in `challenge.json`. Only the Judge runs it.

### `.hidden/solution/`

A working reference implementation. It exists so the Judge can compare approaches
and so the Forge can prove the challenge is solvable within the interface it
specified. A challenge whose reference solution does not pass its own evaluation
set is broken, and the dry-run phase exists to catch that.

---

## 8. Progress state

`topics/<slug>/.state/progress.json`. Local-only, gitignored, written by the
Teacher and the Judge, read by all three roles.

```json
{
  "contractVersion": 1,
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

---

## 9. Status and verification

Three statuses, and they move in one direction.

**`draft`** — generated, not yet checked. The generator writes this.

**`validated`** — `npm run validate -- topics/<slug> --strict` passes with no errors
and no warnings. This is mechanical and says nothing about whether the material is
any good.

**`verified`** — both verification agents have passed every chapter. The critique
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
    contradicted: 0
    unreachable: 0
  critique:
    verdict: pass
    at: 2026-08-12
```

A chapter with `status: verified` must carry both verdicts as `pass`. A topic with
`status: verified` requires every chapter verified. The validator enforces both, so
"verified" cannot be set by hand on material that was never audited.

The faithfulness auditor's verdict set is `supported`, `unsupported`,
`contradicted`, and `unreachable`, and a claim is `unsupported` until a quoted span
proves otherwise. `unreachable` exists so that a source the auditor could not fetch
is recorded as unchecked rather than being pushed into whichever of pass or fail the
model finds more comfortable.

---

## 10. Changing this contract

The contract is versioned by `contractVersion`, which every file carries. Adding an
optional field is a compatible change and does not bump the version. Adding a
required field, removing a field, tightening a rule, or changing a filename
convention bumps it to 2, and the validator then refuses version 1 topics until
they are migrated.

The order of work when the contract changes: edit this document, then the schemas in
`tools/src/contract.ts`, then the validator's checks, then the fixture in
`contract/fixtures/tiny-topic/`. The fixture is what proves the validator still
works, so it moves last and it always moves.
