---
paths:
  - "topics/**/*.md"
  - "topics/**/*.json"
  - "contract/fixtures/**/*.md"
description: How to write chapter prose, citations, and quizzes inside a topic.
---

# Writing topic material

The full schema is `contract/TOPIC-CONTRACT.md`. This rule is the working detail for
prose and citations, the two places where mistakes are easy and expensive.

## Citations

A marker is `{{S07.a}}` — source id, dot, excerpt key. It goes after the sentence's
closing punctuation. Several may sit together when a claim rests on more than one
source.

The order of work is source first, prose second. Find the passage, copy it verbatim
into `sources.json` as an excerpt with its locator, then write the sentence that
paraphrases it and attach the marker. Writing the sentence first and then hunting for
something that supports it is how unfaithful chapters get made — the search becomes
motivated, and a nearby passage that almost fits will look like it fits.

Quote enough to stand alone. A four-word fragment can be made to support almost
anything, so when a claim needs surrounding context, quote the surrounding sentences.
Never reconstruct a quote from memory. If the source cannot be reached, the claim does
not go in the chapter.

Every excerpt must end up cited by some chapter, and every marker must resolve. The
validator enforces both directions.

## Prose

State facts. The banned hedges are `may`, `might`, `perhaps`, `possibly`, `probably`,
`arguably`, `some argue`, `some say`, `it is believed`, `is thought to`, `seems to`,
`tends to`, `it could be argued`, `generally considered`, `widely considered`.

Watch the failure this rule creates: a source that says "often" becoming a chapter
that says "always". Removing a hedge from a sentence whose source is hedged does not
make the sentence true, it makes it wrong, and the faithfulness auditor is pointed
specifically at that shape of error. When the source hedges and the claim matters,
either state the narrower fact the source actually supports, or state that the
question is open and cite both sides.

Contested material is stated as contested and cited on both sides. That is a fact
about the field, not a hedge.

Floors, per chapter: 400 words, two `##` headings, one citation marker per 150 words.
The density floor is there because a long chapter with two markers is unsourced
material with a citation stapled on.

## Quizzes

One question per taught concept, at least one question that is not `recall`, and
`accept` entries that name the points a passing answer contains rather than the exact
words. `discrimination` questions ask the learner to tell two things apart, which is
the shape that catches a confusion recall questions sail past.

## Check before finishing

```
npm run validate -- topics/<slug> --strict
```
