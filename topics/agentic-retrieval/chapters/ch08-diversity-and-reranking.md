---
id: ch08
title: Diversity in what you retrieve, and what it is worth
order: 8
requires: [ch03, ch05, ch07]
teaches: [reranking, marginal-relevance, diversity-relevance-tradeoff, lambda-parameter, retrieval-metric-versus-answer-metric, best-of-sweep-reporting, shared-dataset-dependence, evidence-gap]
quiz: quizzes/ch08.quiz.json
estimatedMinutes: 35
status: verified
audit:
  faithfulness:
    verdict: pass
    at: 2026-08-16
    claims: 60
    supported: 60
    unsupported: 0
    overstated: 0
    contradicted: 0
    unreachable: 0
  critique:
    verdict: pass
    at: 2026-08-16
    notes: 0 blocking, 3 advisory
---

Chapter seven closed on a direction its authors named without measuring: reorder the retrieved list, or truncate it, before the model reads it. Reordering is the cheaper half, because the documents are already in hand and nothing has to be fetched again.

## Reordering what came back, and why the position chapter demanded it

Reranking is a second ordering pass over a list you already have. The first pass gives you a ranked list of documents retrieved from a collection for a query, subject to a relevance threshold below which nothing is returned at all; the reranker then works inside that list, holding a subset of documents already selected and choosing the next one from the documents not yet selected. {{S44.c}} Nothing new enters at this stage: a reranker works only on documents the first pass already returned, which by construction means it cannot repair a recall failure. What it changes is order, and, once the list is truncated to fit a context budget, membership.

The reason to bother is that a pure relevance ranking repeats itself. Carbonell and Goldstein report that among the top ten passages returned for news story collections in response to a query, there is significant repetition of content across the passages, which often contain duplicate or near-duplicate sentences. {{S44.m}} Read as a mechanism rather than a second measurement, this chapter takes that repetition to follow from what the ranking optimises: documents are ordered by similarity to the query, and two documents both close to the same query tend to sit close to each other too, so the top of the list converges on one way of saying one thing.

Chapter six is what turns that from an aesthetic complaint into a cost. Accuracy sags for a passage placed in the middle of the context and is often highest at both ends {{S09.e}}, so the slots near the front and the back of the input are a budget. Ten slots spent on one fact restated ten times is a budget spent once.

## Scoring a document for what it adds rather than what it matches

The move in the 1998 paper is to stop scoring a candidate against the query alone. Carbonell and Goldstein measure relevance and novelty independently and take a linear combination of the two, which they call marginal relevance: a document has high marginal relevance when it is relevant to the query and also has minimal similarity to the documents already selected. {{S44.a}} The formula printed below makes the dependence explicit: the novelty term maxes a candidate's similarity against every document already in S, so a document's score depends on the set built so far and not only on the query, and the term it is compared against changes each time S grows by one. {{S44.b}}

That dependence is the whole idea, and it is what makes the algorithm greedy rather than a sort. An ordinary ranking score is computed per document against the query, so the score of the tenth document does not depend on which nine came before it. Marginal relevance breaks that independence deliberately: the same formula selects over R\S, the candidates not yet chosen, which is only well defined if picking one candidate moves it out of that set for the next round.

Later work restates the criterion the same way. ARAGOG describes MMR as evaluating candidate documents not only for closeness to the query's intent but for their uniqueness compared with the documents already selected, which reduces redundancy in the retrieved set. {{S45.b}} The Dartboard paper characterises MMR and its relatives as methods that encourage diversity by carrying an objective that explicitly trades diversity off against relevance. {{S46.a}} The word "explicitly" is doing real work there, and section six comes back to it.

## The 1998 criterion, its parameter, and its two endpoints

Here is the criterion as it is printed on page 335, transcribed from the typeset formula. {{S44.b}}

```
MMR def= Arg max [D_i in R\S] [ lambda(Sim_1(D_i, Q) - (1-lambda) max [D_j in S] Sim_2(D_i, D_j)) ]
```

Every symbol is defined by the paper. `C` is a document collection or stream, `Q` is a query or user profile, `R` is the ranked list an IR system retrieved for `C` and `Q` given a relevance threshold, `S` is the subset of `R` already selected, and `R\S` is the set difference, meaning the candidates not yet chosen. `Sim1` is the similarity metric used for relevance ranking between a document and the query, and `Sim2` is either the same metric or a different one. {{S44.c}} So the bracket is read as: among the candidates still available, take the one whose query similarity, discounted by its worst-case similarity to anything already picked, is largest.

The parameter is what makes it a family of rankers rather than one ranker. The paper states that MMR computes the standard relevance-ranked list when lambda equals 1, computes a maximal diversity ranking among the documents in `R` when lambda equals 0, and optimises a linear combination of the two criteria for intermediate values in between. {{S44.d}}

Substitute those endpoints into the equation above and only one of them comes out as described. At lambda equals 1 the `(1-lambda)` factor is zero, the novelty term vanishes, and the score is the query similarity, which is the relevance ranking the paper promises. At lambda equals 0 the entire bracket is multiplied by zero, every candidate scores zero, and no ordering survives at all, where the paper says a maximal diversity ranking should appear. {{S44.b}}{{S44.d}} Moving `(1-lambda)` outside lambda's parenthesis, so that it multiplies only the novelty term, is what makes both endpoints behave as the paper's own sentence describes. The transcription above is faithful to the printed page rather than to the arithmetic, so where a rendering of MMR you meet elsewhere differs from it, that placement is the difference to look at.

The paper's advice on choosing a value carries a second slip, and it is worth seeing as printed.

> Users wishing to sample the information space around the query, should set λ at a smaller value, and those wishing to focus in on multiple potentially overlapping or reinforcing relevant documents, should set λ to a value closer to λ.

That last clause compares lambda to itself, which fixes nothing. {{S44.e}} The direction is still unambiguous from the sentence around it: the first clause takes the smaller value, and the endpoint sentence puts pure relevance at 1. {{S44.d}} The concrete strategy the same paragraph recommends is to start at a small lambda, for instance 0.3, to understand the information space around the query, then reformulate the query and focus with a larger value, for instance 0.7. {{S44.e}} Note the shape of that recommendation: sample, then reformulate the query and focus, which is two steps a person carries out in sequence rather than a single value a pipeline sets once. {{S44.e}}

## What the original paper actually measured, on five users

The document reordering evidence in the 1998 paper is a pilot experiment with five users, undergraduates from various disciplines, run to find out whether they could tell the difference between a standard ranking method and MMR. {{S44.g}} That sample size belongs in front of every number that follows.

The reported outcome is that the majority said they preferred the method that in their opinion gave the broadest and most interesting topics, which was MMR, and that 80 percent chose MMR when asked to select a method for a search task. {{S44.h}} Eighty percent of five users is four users. The same paragraph reports a differential preference, MMR for navigation and for locating relevant candidate documents quickly and pure relevance ranking for looking at related documents within a band, and that three of the five users clearly discovered that difference in utility. {{S44.h}} Three of five is the denominator doing its work again: the strongest qualitative finding in the study rests on three people.

The summarization half of the paper is measured differently. To price the relevance lost for a diversity gain in single document summarization, three assessors went through 50 of the 200 articles of a TIPSTER topic and marked each sentence relevant, somewhat relevant or irrelevant, with the assessor scores compared against the TREC relevance judgments for that topic. {{S44.i}} The resulting sentence precision table is the one place in this chapter where the 1998 paper puts numbers against lambda values. {{S44.k}}

| Summary length | lambda | TREC and CMU relevant | CMU relevant |
|---|---|---|---|
| 10% | 1 | .78 | .83 |
| 10% | .7 | .76 | .83 |
| 10% | .3 | .74 | .79 |
| 10% | lead sentences | .74 | .83 |
| 25% | 1 | .74 | .76 |
| 25% | .7 | .73 | .74 |
| 25% | .3 | .74 | .76 |
| 25% | lead sentences | .60 | .65 |

Read the columns before the rows. In the column scored against both the TREC and the CMU relevance judgments, at 10 percent length, the scores fall from .78 to .76 to .74 as lambda goes from 1 to 0.7 to 0.3, and at 25 percent length the same three values are .74, .73 and .74, which is not even monotonic. {{S44.k}} The authors read their own table as showing no significant statistical difference between the lambda equals 1, lambda equals 0.7 and lambda equals 0.3 scores, and explain the parity by cases where the lambda equals 1 summary failed to pick up a piece of relevant information that reranking at 0.7 or 0.3 recovered. {{S44.j}} On the paper's own reading, its own numbers do not separate pure relevance from diversity reranking.

The abstract is correspondingly modest. It calls the results preliminary and says they indicate some benefits for MMR diversity ranking in document retrieval and in single document summarization, and locates the clearest advantage in constructing non-redundant multi-document summaries. {{S44.f}} The strongest external result is from summarization rather than retrieval: at the 1998 SUMMAC conference, a government-run evaluation of 15 summarization systems, the MMR-based summarizer produced the highest-utility query-relevant summaries with an F-score of .73 and scored highest on informative summaries at 70 percent accuracy. {{S44.l}} The same passage adds that parameters such as summary length varied among systems, so the authors call the evaluation results indicative but not definitive measures of comparative performance. {{S44.l}} And the multi-document claim that the abstract calls clearest is reported as a description of redundancy removed, with no numbers attached. {{S44.m}}

None of that makes MMR a bad idea. It makes the 1998 paper a much more careful document than its reputation, and it means anyone citing it as proof that diversity reranking works is citing five undergraduates, three assessors and a null result on the table.

## Ranking diversity is not answer quality

Diversity has a measurable definition in this literature, and it is a property of the retrieved set. Dartboard measures the diversity of retrieved passages as one minus the average cosine similarity between pairs of those passages, and reports that MMR explicitly encourages diversity while Dartboard does not. {{S46.h}} Everything in that computation comes from the passages and their embeddings. The model has not run yet.

Answer quality is measured after the model runs, and the three later papers here each pick a different instrument. Dartboard scores retrieval with nDCG on retrieving any one of the positive passages for a query, and scores end to end by string matching the model's response against a set of correct answers, marking each response correct or incorrect. {{S46.b}} ARAGOG scores answer similarity against reference answers on a scale from 0 to 5. {{S45.c}} REBEL adopts answer similarity, judged by a rubric-based LLM on the same 0 to 5 scale, as its primary metric. {{S47.f}} A ranking metric and an answer metric are different quantities computed from different objects, and a method can move one without moving the other.

ARAGOG says so structurally. It treats answer similarity as complementary and secondary to its primary objective of evaluating retrieval techniques, on the grounds that answer similarity is influenced by the generative capabilities of the LLM and would confound an assessment of retrieval effectiveness. {{S45.c}} Its statistical tests follow that decision: an ANOVA confirmed significant differences across techniques and a Tukey HSD test broke them down, and the statistical testing covers only the primary metric of retrieval precision. {{S45.e}}

That scoping is what its MMR result means. The abstract reports that MMR and Cohere rerank did not exhibit notable advantages over a baseline naive RAG system. {{S45.a}} The boxplot analysis reports MMR with limited benefits and median precision scores comparable to or below the baseline. {{S45.d}} The conclusion restates it as a surprise. {{S45.i}} And the Tukey row for MMR against naive RAG reads: mean difference -0.0156, p-adjusted 0.3787, reject null False. {{S45.f}} For a reader who has not done this before: the null hypothesis is that the two systems have the same mean retrieval precision, the p-adjusted value is how ordinary a gap of that size would be if that were true, and the final column records the test declining to reject. The measured difference was slightly negative and not distinguishable from chance. It is not a finding that MMR hurt retrieval precision. It is the absence of a finding either way, on retrieval precision, on that dataset.

ARAGOG also watched the two metrics come apart within its own results. It reports a notable positive correlation between retrieval precision and answer similarity for Classic Vector Database techniques and the Document Summary Index, and a disparity for Sentence Window Retrieval, which had high retrieval precision and lower answer similarity scores. {{S45.g}} The same decoupling shows up in Dartboard's table. On the integrated question set, the Oracle row has the highest nDCG at .826 and scores 36 percent on QA, while D-CC scores .595 on nDCG and 42 percent on QA. {{S46.d}}{{S46.b}} The ranking with the best retrieval score is not the ranking that produced the best answers.

## Three later studies, and how much they really agree

Counting papers is not counting evidence, and this chapter cites four papers over noticeably fewer independent setups.

ARAGOG states its own limit first: the study used a singular dataset and a set of 107 questions, and the authors flag this as a threat to how far the findings generalize across different LLM applications. {{S45.h}} REBEL then reports that its setup and textual description are largely taken from ARAGOG, that its evaluation dataset comprises 107 question-answer pairs generated with the assistance of GPT-4, and that the dataset comes from the ARAGOG GitHub repository that originally proposed the experimental setup. {{S47.h}} So on the axis ARAGOG flagged, REBEL is a second result on the same corpus rather than a check of whether the first one generalises.

REBEL is still the counterweight to the section above, because it pushes in the other direction. It reports that in standard RAG pipelines, maximizing for context relevance alone can degrade downstream response quality. {{S47.a}} The concrete instance is named: Cohere and LLM Rerank achieved high retrieval relevance at the expense of answer quality, which the paper connects to ARAGOG's observation that the highest-performing systems on retrieval relevance often had the lowest answer quality. {{S47.b}} Its own method is a reranker whose prompt defines criteria beyond basic relevance, among them depth of content and diversity of perspectives. {{S47.d}} The one-turn version uses five fixed criteria, depth, diversity, clarity, authoritativeness and recency, and is reported to achieve both higher retrieval relevance and higher answer quality than vanilla RAG with no reranking. {{S47.e}} Read the denominator there too: diversity is one criterion of five, so that result is not a measurement of diversity by itself. The paper positions the whole approach in the line of classical multi-criteria retrieval methods that starts with MMR, alongside xQuAD and PM-2. {{S47.c}} The numbers are another matter. The results section directs the reader to Figure 1 for the experimental results, so there is no quotable value in the text of the paper for what those gains were. {{S47.g}}

Dartboard is the third setup, and it is a comparison rather than a single-method report. It proposes an optimisation metric based on relevant information gain, from which diversity emerges without being traded off explicitly, and reports state-of-the-art performance against methods that directly optimise relevance and diversity on the RGB benchmark. {{S46.a}} How that comparison was run matters more than the ranking it produced. Several of the methods, Dartboard included, have tunable parameters, MMR's diversity parameter among them, and the authors performed a grid search over those parameters and reported the best result for each method. {{S46.c}} The table caption says it again: for methods with tunable parameters, the best score over a parameter sweep is reported. {{S46.e}}

That makes Table 2 a comparison of optima. {{S46.d}} Each method appears at whatever parameter value scored highest on that benchmark, and the sweep is scored with the benchmark's correct answers in hand. {{S46.b}} It answers the question "how well can this method do here when tuned", which is the right question for a paper comparing algorithms. It does not answer "how well will this method do on my corpus at the parameter I picked", and reading a best-of-sweep row as if it answered the second is the standard way to be disappointed in production. Dartboard also names its own scope: the experimental results are limited to a single benchmark and a single LLM, ChatGLM, and the authors say it remains to be seen whether the results generalise to other benchmarks and LLMs. {{S46.i}}

Every limitation in this section is stated by the paper that carries it. Five users and three assessors in 1998, one dataset and 107 questions in ARAGOG, that same dataset again in REBEL, one benchmark and one model in Dartboard. Four papers, three setups, and a field that has been honest about it in print.

## The number nobody has: what the parameter does to the answer

Here is the question a working engineer arrives with, after chapters six and seven: I am about to set a diversity parameter, and I want to know what moving it does to the quality of the answers my system produces. The table caption behind the numbers in the previous section says the best score over a parameter sweep is what gets reported {{S46.e}}, and no excerpt pinned for this chapter reports that measurement outside a swept optimum, so it stands here as open rather than answered {{S46.c}}{{S46.e}}.

The closest thing here is a figure caption. Dartboard's Figure 2 plots performance on the end-to-end QA task as parameters vary, showing Dartboard as its sigma varies and MMR as its diversity parameter varies. {{S46.f}} That caption names exactly the right axes, and a caption is not a number: the curve is in a figure, and no excerpt pinned for this chapter transcribes a value from it. {{S46.f}} Everything else that touches the parameter reports one point on that curve, the best one. {{S46.c}}{{S46.e}} The 1998 table is the other partial answer, and it is a summarization precision score rather than an answer score, on three lambda values that the authors themselves could not separate statistically. {{S44.k}}{{S44.j}}

So the honest state of this chapter's evidence is: the diversity parameter has a clear definition, two well-specified endpoints, and no measured relationship to answer quality across its range in any source pinned here. That is a gap in what these sources establish, and naming it is more useful than filling it with a default value that would look like a finding.

What the sources do support is a warning about the parameter's cost. Dartboard's authors report two limitations of MMR: the diversity parameter is needed to control the balance between relevance and novelty, it is often dataset-specific and requires careful tuning, which they call impractical for real-world applications, and MMR can favour exact duplicates of previously retrieved documents, since a duplicate retains a high relevance score while minimally affecting the average novelty score. {{S46.g}} That second objection is framed against an average novelty score, while the criterion as printed in 1998 subtracts the largest similarity to any single already-selected document, a harsher penalty on a duplicate than an average-based score would apply. {{S44.b}}{{S44.c}} Before assuming the objection applies to your pipeline, find out which of the two your library implements.

The parameter cost is not unique to MMR either, and Dartboard says so. Its own method requires a hyperparameter affecting how much diversity is encouraged, the authors report their method is not sensitive to the choice of it, and they state that a method requiring no manual tuning would be preferable. {{S46.j}} That is where this leaves you. Diversity reranking is a real technique with a precise definition, its parameter is a real operating cost, and the effect of moving that parameter on what your model writes is something you will have to measure yourself, against an answer metric and not only a ranking one.
