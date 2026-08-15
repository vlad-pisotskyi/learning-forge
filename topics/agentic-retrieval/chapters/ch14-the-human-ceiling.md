---
id: ch14
title: The human ceiling, and how one gets built
order: 14
requires: [ch03, ch13]
teaches: [inter-annotator-agreement, human-ceiling, redundant-annotation, ground-truth-ambiguity, annotation-guideline, annotator-qualification, annotation-independence]
quiz: quizzes/ch14.quiz.json
estimatedMinutes: 30
status: draft
audit:
  faithfulness:
    verdict: fail
    at: 2026-08-15
    claims: 34
    supported: 30
    unsupported: 0
    overstated: 0
    contradicted: 0
    unreachable: 4
  critique:
    verdict: pass
    at: 2026-08-15
    notes: 0 blocking, 1 advisory
---

## Labelling the same page twice on purpose

Chapter three described a test collection as documents, information needs, and
relevance judgements, and then used the judgements as though they were facts about the
world. They are not. Every judgement is one person's decision, written down once, and
the file format keeps no record of how confident that person was or whether a second
person would have decided the same way. The only way to recover that missing
information is to pay for the same item to be labelled more than once.

DocLayNet does exactly that, and although the labels are document layout boxes, nothing
in this chapter depends on that. The dataset ships a subset of pages annotated twice
and a smaller subset annotated three times, and the stated purpose of that subset is to
determine the inter-annotator agreement. {{S23.c}} The authors list the redundancy as a
contribution of the dataset in its own right: a fraction of the pages carry more than
one human annotation, which is what makes experimentation with annotation uncertainty
and quality control analysis possible at all. {{S23.j}} The dataset card compresses the
payoff into one sentence, saying the double- and triple-annotated pages allow annotation
uncertainty to be estimated along with an upper bound on achievable prediction accuracy.
{{S24.a}}

The redundancy is not a rounding error in the budget. 7059 pages carry two instances of
human annotation and 1591 carry three, which brings the corpus to 91104 annotation
instances. {{S23.n}} Thousands of pages were paid for twice, and one thousand five
hundred of them three times, to produce a number that describes the labellers rather
than the data. The released dataset also records what kind of document each page came
from, in a field whose permitted values are financial_reports, scientific_articles,
laws_and_regulations, government_tenders, manuals, and patents. {{S24.b}} A
redundantly annotated page therefore arrives with the stratum it was drawn from
attached to it.

## Scoring people with the metric you score the model with

Here is the move worth stealing. The agreement figure is computed as the mAP at 0.5 to
0.95 metric between pairwise annotations from the triple-annotated pages, which yields
accuracy ranges rather than a single number. {{S23.ap}} Read that mechanically. Take one
page that three different people annotated. Hold one person's boxes as if they were a
model's prediction, hold another person's boxes as if they were the ground truth, and
run the same scoring function the models are run through. A page with three annotations
supplies more than one such pair, which is where the range comes from.

The point of using that metric rather than some purpose-built agreement statistic is
that it puts the humans and the models on one axis. Section 5 of the paper subtracts one
from the other directly, reporting that the variation in mAP between the models is low
but that all of them sit below the mAP computed from the pairwise human annotations on
the triple-annotated pages. {{S23.aq}} A ceiling expressed in a different unit from the
model's score cannot be subtracted from it, and a difference you cannot compute is a
ceiling you cannot use.

## The number that turns out to be the real target

Once you have that figure, the target on the leaderboard stops being 100. The paper
calls the agreement between annotators a natural upper bound for segmentation accuracy,
found by annotating the same pages multiple times with different people and evaluating
the inter-annotator agreement. {{S23.o}} That reframes what a training run is trying to
do. A baseline consistency evaluation of this kind is useful for defining expectations
for a good target accuracy in trained networks and for avoiding overfitting. {{S23.q}}
Without it, a team that pushes a model past the agreement figure has no way to tell
whether it learned the task better than people do or learned the idiosyncrasies of
whichever annotator happened to label the test split.

The cost is real and the paper says so rather than pretending otherwise: human
annotation is cost-intense and far less scalable than automation, and it has several
benefits over automated ground-truth generation. {{S23.r}} That is the trade stated
without varnish, and the redundant subset is the part of the bill that buys a number
obtainable no other way.

## Pages with more than one defensible answer

Part of what the gap between 100 and the agreement figure contains is not error at all.
Certain documents with complex layouts have different but equally acceptable
interpretations. {{S23.p}} During early trial runs inside the core team the authors
observed many cases where annotators used different annotation styles, particularly on
challenging layouts. {{S23.z}} The paper's own example is worth keeping in mind whenever
you write a rubric:

> if a figure is presented with subfigures, one annotator might draw a single figure
> bounding-box, while another might annotate each subfigure separately.

{{S23.aa}}

Neither annotator has made a mistake. Both readings answer the question that was asked.
An evaluation that admits exactly one correct answer per item will score one of them
wrong anyway, and the resulting penalty is a property of the evaluation rather than of
the system being evaluated. Measuring agreement is what makes that penalty visible,
since it shows up as the distance between the ceiling and a perfect score instead of
hiding inside every model's error bar.

## A hundred pages of written rules, and what they fixed

The response to divergent annotation styles was a written guideline, and the authors are
candid about its limits: perfect consistency across 40 annotation staff members is not
achievable, but they saw a large improvement in annotation consistency after the
guideline was introduced. {{S23.ab}} What makes a rule effective here is that it removes
a decision rather than advising on one. Two of the published highlights show the shape.
Every list item is an individual object instance labelled List-item, which differs from
PubLayNet and DocBank, where all list items are grouped into a single List object.
{{S23.ac}} And for every caption there must be exactly one corresponding picture or
table. {{S23.ad}} Both are checkable by someone who has never seen the page before, and
neither leaves room for a house style.

Rules of that precision do not fit on a page. The complete annotation guideline runs to
over 100 pages, which the paper notes is too long to describe in the paper itself.
{{S23.ae}} When you write instructions for the people labelling your evaluation set,
that is the order of magnitude the work actually takes if you want the ambiguity handled
in the document rather than in each labeller's head.

## Screening labellers, and the ones who do not pass

Writing the guideline is not the same as knowing that anyone has absorbed it, so the
campaign tested that separately. 974 pages were reference-annotated by one proficient
member of the core team. {{S23.af}} Annotation staff were then asked to annotate those
same subsets, blinded from the reference. {{S23.ag}} Only after passing two exam levels
with high annotation quality were staff admitted into the production phase. {{S23.ah}}

The attrition is the part to notice. Practice iterations ran over twelve weeks, and at
the end of them 8 of the 40 initially allocated annotators did not pass the bar.
{{S23.ai}} A fifth of the allocated workforce, after twelve weeks of practice, was not
admitted to the work. Production annotation was then carried out by 32 annotators
{{S23.aj}}, which is the forty minus the eight, and took around three months to
complete. {{S23.ak}} Report that fraction when you build your own screening step,
because it is the evidence that the step did something: a bar the whole cohort clears
has produced no information about the cohort.

## Keeping annotators from seeing each other's work

An agreement number is only worth reading if the two annotations were produced
independently. The campaign enforced that: annotation staff were not able to see each
other's annotations, and this was enforced by design specifically to avoid bias in the
annotation that could skew the inter-annotator agreement numbers. {{S23.am}} Drop that
constraint and the quantity you compute changes identity without changing its name. Two
people who can see each other converge, and the resulting figure measures how readily
the second labeller deferred to the first rather than how far two independent readings
of the guideline coincide. A ceiling built from conformity sits higher than the real one,
which means every model measured against it looks worse than it is.

Two other rules shaped what an annotation could be. Only non-overlapping, vertically
oriented, rectangular boxes were allowed. {{S23.al}} And there was a way to flag a page
as rejected for cases where no valid annotation under the guideline could be achieved.
{{S23.an}} The second one matters more than it looks: without an exit, an annotator
facing an unlabellable page has to guess, and a guess entered as a label is
indistinguishable from a judgement. With all these measures in place, experienced staff
annotated a single page in a typical span of 20 to 60 seconds, depending on its
complexity. {{S23.ao}} Independence, a hundred-page rulebook, and a screening exam did
not make the work slow.

## Reading the gap: what the abstract says against what section five says

This paper reports the human-model gap twice, and the two figures are not the same. The
abstract says the baseline models fall approximately 10% behind the inter-annotator
agreement. {{S23.d}} Section 5 says the models are between 6 and 10% lower than the mAP
computed from the pairwise human annotations. {{S23.aq}} The body gives a range and the
abstract reports the top of that range as a single approximate number.

Neither statement is wrong, and the correct response is not to average them or to pick
one quietly. Quote the range, because the results section is where the measurement is
reported and the abstract is a compression of it. That habit generalises past this
paper: when an abstract and a results section disagree about a number, the results
section is the one to carry into your own writing, and the discrepancy itself is worth
noting rather than smoothing over. The paper's conclusion states the finding without a
figure at all, saying that a significant gap remains between human and ML accuracy on
the layout interpretation task, and inviting the research community to close it.
{{S23.ar}}
