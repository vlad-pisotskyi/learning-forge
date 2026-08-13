---
paths:
  - ".claude/agents/forge-auditor.md"
  - ".claude/agents/forge-critic.md"
  - ".claude/skills/forge-generate/stages/verify.md"
  - "tools/src/forge-plan.ts"
  - "tools/src/forge-scaffold.ts"
  - "tools/src/source-check.ts"
description: Which parts of the verification design rest on measured evidence, which are folk practice, and the failure modes the design is aimed at.
---

# Why the verification layer is shaped this way

A research pass ran before this layer was built, because the plan of record said prompt
design is the one place where quality determines whether the truth guarantee holds. The
findings are worth keeping, and so is the separation between what was measured and what was
merely recommended. A design that cannot tell those apart adopts folk practice and believes
it has a guarantee.

Full notes with quoted passages and retrieval dates are in
`.forge-cache/verification-research/`, which is gitignored. What survives here is the part
the design depends on.

## Measured, and acted on

**A sentence is the wrong unit.** FActScore found a single sentence mixes supported and
unsupported facts in 40% of cases. This is the whole justification for decomposing at all.

**Claims should be decontextualised and specific, not minimal.** Granularity in the
literature has moved up since 2023, roughly 7 to 12 to 15 words. Molecular Facts reports
74.7% against 68.7% verification accuracy for decontextualised over bare atomic claims. The
opposite error is also measured: adding specificity a source never had flips 4 to 13% of
claims from supported to unsupported.

**Rationale before verdict.** The cleanest measured result in the whole set. Reordering
alone moved a reported agreement score from 0.06 to 0.23. This is why `quote` precedes
`ruling`, and why `detail` precedes `severity`. Field order in the emitted JSON is the
intervention, since a model writing JSON writes it in field order.

**Reference-guided grading.** Failure rate 70% to 15%. Both agents grade against supplied
references rather than taste: the auditor against pinned excerpts, the critic against
`concepts.json`, the earlier chapters, and the quiz.

**Overreach needs its own label.** The largest documented error category for graders of this
kind, 30.6%, is insensitivity to a claim that overstates its source. Every shipped framework
examined folds it into "supported" and therefore cannot see it. Hence the `overstated`
ruling and the contract v3 bump.

**Contradiction is the weak ruling.** Reported F1 of 45.0, and the failure runs one way:
contradictions get graded as support. Both the contract and the auditor say so explicitly,
and the stage playbook says a topic reporting zero contradictions is a result to be
suspicious of.

**Anchoring on fabricated citations.** Fabricated citations flip 12 to 29% of judge
verdicts. This is the auditor's exact attack surface, and it is the reason
`recordVerdicts` resolves every marker and confirms the quoted span appears in that
excerpt. That check is arithmetic, not judgement, and it is the load-bearing part of this
layer.

## Measured, and deliberately not acted on

**Few-shot calibration.** Raises self-consistency 65% to 77.5% and does not move agreement
with human judgement. Not worth the tokens.

**Position swapping.** Helps on natural data, costs 4 to 13 points on adversarial data where
one side is clearly right, and is inapplicable to single-item auditing anyway.

**Rubric alone.** Reached significance for no model tested, and hurt one. Rubrics here are
paired with structure, which is a different claim.

## Folk practice, kept or dropped on purpose

**Default to failure.** Nothing measures it, and the evidence mildly cuts against the
wording form of it: judges instructed to be strict went lenient instead, and prompt-level
debiasing instructions are close to inert. So the *structural* default is kept, since it
costs nothing and is enforced by the schema and the derivation, and the exhortation is not
leaned on. Neither agent is told to be harsh. The auditor is told what the span check will
do, which is a consequence rather than an instruction.

**Quoting the span before ruling.** Recommended by Anthropic, structurally required by
TruLens, measured by nobody. Kept because it is free and because the general
rationale-before-verdict result points the same way.

**Withholding the generator's reasoning.** Every implementation examined excludes it via
input schema and none tested it. Kept for the same reason.

**A different judge model than the generator.** Recommended without evidence, though
self-preference is causally established and tracks self-recognition, which anonymising the
source does not remove. Not implemented, because the agents do not pin a model. Worth doing
if it ever becomes cheap.

## Two cautions this layer does not resolve

**The third label dies at the scorer.** DeepEval ships a three-way label set and then counts
anything that is not "no" as faithful unless a flag is set. The label exists in the prompt
and evaporates in the arithmetic. This design avoids it by deriving the verdict as "every
claim supported", so `overstated`, `contradicted`, and `unreachable` all fail, but the
lesson generalises: whenever a label is added, check what the derivation does with it.

**Raw agreement is the wrong headline number.** The widely cited "85%, better than humans"
corresponds to a chance-corrected agreement of about 0.48, and judges with 0.99 test-retest
stability have scored 0.41. If this layer is ever measured against human judgement, report
the chance-corrected figure, or a stable and biased checker will certify itself.

Related: bias is markedly worse on subjective comparison than on fact-checking, so the
critic is the less reliable of the two agents and its own instructions say so. They are not
interchangeable and should not be presented to the owner as equally trustworthy.

## The root of the chain

The span check in `recordVerdicts` confirms an auditor quoted an excerpt correctly. It
cannot confirm the excerpt was ever in the source, and for a long time nothing did.
That is the one link where a fabrication enters and is then trusted by everything
downstream, including the check that exists to catch fabrication.

`forge sources --verify` closes it, in `tools/src/source-check.ts`: re-fetch each
source, rule on each excerpt as `verbatim`, `verbatim apart from formatting`, or
`not found`. It is advisory, and deliberately so. The first run against a real topic
produced misses on quotes that were perfectly honest — ordered-list numbers that a
stylesheet generates and the document text never contains, the rule line inside an
ASCII table, entity-encoded punctuation. A gate with that false-alarm rate would be
switched off within a week, and a check nobody reads is worth nothing.

What it catches cleanly is the case worth catching: a quote pinned to a URL whose
document does not contain it. On its first run that was a source pinned to a 2.4KB
summary page which could not have held the passage quoted from it.

## The one load-bearing guess

That decomposing first and ruling second beats doing both at once. Nobody has measured it.
The nearest controlled study held prompt richness constant and found a holistic judge
matched or beat a self-decomposing atomic one on two of three benchmarks, winning
specifically on detecting incompleteness. It explicitly excludes multi-stage
extract-then-verify pipelines, which is what this is, so it does not refute the design. It
does remove the confound that made decomposition look good, namely that atomic prompts are
longer and richer.

Treat it as unproven. If the auditor turns out to miss things a chapter obviously gets
wrong, the shape of the pass is the first thing to suspect, not the wording.
