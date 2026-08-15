---
id: ch16
title: Measuring a deployed assistant
order: 16
requires: [ch03, ch10, ch14]
teaches: [llm-as-judge, judge-bias, judge-validation, reference-free-evaluation, offline-replay, live-traffic-measurement, ab-test, paired-comparison-evaluation, ground-truth-proxy]
quiz: quizzes/ch16.quiz.json
estimatedMinutes: 40
status: draft
audit:
  faithfulness:
    verdict: fail
    at: 2026-08-15
    claims: 45
    supported: 43
    unsupported: 1
    overstated: 0
    contradicted: 0
    unreachable: 1
  critique:
    verdict: pass
    at: 2026-08-15
    notes: 0 blocking, 3 advisory
---

## Two modes: a fixed set replayed, and traffic as it arrives

Fifteen chapters have measured pieces of a system: which documents come back, where the boundaries fall, what an extra loop costs. None of those numbers answers the question a deployed assistant raises, which is whether it helped anyone. Manning, Raghavan and Schutze put the difficulty in one sentence: user happiness is elusive to measure, and that is part of why the standard methodology uses the proxy of relevance of search results {{S39.a}}. Every measurement in this book has been a stand-in for something. This chapter is where that stops being background.

There are two ways to ask, and they are not variants of each other.

Offline replay fixes the corpus, fixes the question set, runs the system over both, and scores the output with something that stands in for a person. It is the test collection from ch03 with a generation stage bolted on the end. It reruns on demand, it isolates one change, and no user is involved at any point.

Live measurement watches the deployed system carrying real work. Nobody is asked what they thought; behaviour is the measurement. The same text names one such signal, satisfied users coming back to the same engine, and calls it an indirect measure {{S39.b}}. Indirect is doing real work in that sentence. A return visit is consistent with a good answer and consistent with several other things.

Hold the two apart for the rest of the chapter, because the last thing it has to teach is that the sources pinned here do not join them.

## Splitting live traffic, and the traffic that needs

The standard live method is the A/B test. Precisely one thing is changed between the current system and the proposed one, and a small proportion of traffic, put at 1 to 10 percent of users, is randomly directed to the variant while most users stay on the current system {{S40.a}}. Two constraints are carrying the design. One thing changed is what makes a difference attributable: swap the reranker and rewrite the prompt in the same release and a win names no cause. Random assignment is what makes the two groups comparable, so a behavioural gap between them is a gap the change produced rather than a gap between the kinds of people who ended up in each arm.

The same text is blunt about why the method is used so widely. A/B tests are easy to deploy, easy to understand, and easy to explain to management {{S40.b}}. That is a fact about how evaluation methods get chosen rather than about how well they work, and it is worth knowing in that form. A method that survives a meeting gets run.

The price is in the mechanics. Most users stay on the current system by construction {{S40.a}}, so the arm you care about draws a slice of an already finite stream, and the comparison waits for that slice to accumulate.

## Showing one user both, and reading the preference off their clicks

Airbnb's search team wrote up what the wait costs them. A/B testing alone is often insufficient there, because of the long running times experiments require on an e-commerce platform of that kind {{S41.a}}, and the reason they give is specific: their users generally travel only twice a year, so experiment traffic is far lower than a search engine's {{S41.b}}. Read that as a property of the product rather than a flaw in the method. An assistant a support team hits forty times a day and an assistant consulted during an annual renewal have different experiment budgets for identical code.

Their cheaper instrument is interleaving. Rather than splitting users between variants, the same user is given both, and their preference is inferred from the actions they take {{S41.c}}. The comparison lives inside one session instead of across two populations.

On their traffic the gain was measured at roughly a 50X speedup over A/B {{S41.d}}. Fix the domain in place before that number travels anywhere. This is search ranking on an accommodation marketplace: ranked listings, clicks, bookings. Nothing in this chapter measures interleaving for a retrieval-augmented assistant, where the two variants are two paragraphs of prose and the question of which action reveals a preference is wide open.

Interleaving does not retire the A/B test in that write-up either. Both of the cheaper techniques are used for selecting treatment candidates for A/B testing {{S41.e}}, which makes the arrangement a cheap filter feeding an expensive confirmation.

One sentence in that paper matters more here than the rest, because it says why the cheapest mode was not trusted even as a filter. Purely offline evaluation was not accurate enough, and the reason given is that the ranker being evaluated only has visibility of what the logging ranker already showed, not of all the candidate items {{S41.f}}. Offline, the system is scored on a world a previous version of the system selected. That is the closest thing in this entire topic to a measured connection between offline scoring and live behaviour, it comes from search ranking rather than from generated answers, and it points the discouraging way.

## Scoring an answer with a model, and defining agreement first

Replay needs a scorer, and for free-text answers the scorer under discussion is another language model. The MT-Bench and Chatbot Arena paper is where the practice got measured, and the first thing it does is define what agreement means, before reporting a single number: the agreement between two types of judges is the probability that two randomly selected, non-identical individuals of each type agree on a randomly selected question {{S36.a}}.

Read that definition twice, because it constrains everything downstream. It is a probability over pairs, not a percentage of correct answers. It needs a pool of judges of each type, so a single human's labels cannot produce it. And the non-identical clause keeps a judge from being compared with itself. A headline like "85 percent agreement" is uninterpretable until someone tells you which pairs were drawn and what counted as agreeing.

With the definition fixed, the headline: under setup S2 without ties, agreement between GPT-4 and humans reaches 85 percent, which is higher than the agreement among humans themselves at 81 percent {{S36.b}}. Both halves of that sentence are the finding. Ch14 taught that inter-annotator agreement sets the realistic target, and this is that idea arriving with numbers on it. The judge is not being scored against perfection; it is being scored against people who disagree with each other about one question in five, under one setup on one benchmark.

## The biases somebody went and measured

Position bias is a judge's propensity to favour certain positions over others {{S36.c}}. The test for it is mechanical: present the same two answers in both orders and see whether the verdict survives the swap. Only GPT-4 produced consistent results in more than 60 percent of cases {{S36.d}}. Treat that as a requirement on your harness rather than as trivia. Score A against B once, in one order, and the number you write down contains an artefact of that order.

Verbosity bias is a judge favouring longer, verbose responses even when they are not as clear, high-quality, or accurate as shorter alternatives {{S36.e}}. For a retrieval-augmented assistant this one bites early, because pulling in more context and restating more of it is the easiest thing a variant can do.

The third failure they name is self-enhancement bias, a term the authors adopt from the social cognition literature {{S36.f}}. The passage cited here gives the name and where it came from, not a magnitude, so take the failure mode as named in that work and go to the paper itself for how large it was.

Then the limit that matters most for a technical assistant. Language models have limited math and reasoning capability, which results in failure to grade such questions, because the judges do not know the correct answers {{S36.g}}. A judge cannot certify an answer to a question it could not have answered. If your assistant's hard cases are exactly the cases a strong model gets wrong unaided, the judge is confidently scoring the part of the distribution you built the system for.

Two mitigations come with measured effects. A few-shot judge raised GPT-4's consistency from 65.0 to 77.5 percent {{S36.h}}, and reference-guided grading moved a failure rate from 70 percent to 15 percent {{S36.i}}. Notice what the second one costs: handing the judge a reference answer means having a reference answer, which is the thing the next section does without.

## Validating a judge before you deploy it

Judge-Bench put the question on a large footing, releasing over 70,000 test instances with associated human judgments {{S37.a}}. The finding is neither an endorsement nor a rejection. Models are reliable evaluators on some tasks, and overall they display substantial variability depending on the property being evaluated, the expertise level of the human judges, and whether the language is human or model-generated {{S37.b}}.

Look at what those three sources of variability have in common: none of them is a property of the model you picked. They are properties of the evaluation you set up. That is why the paper's recommendation is phrased the way it is, that at the current stage of development, LLM judges should be validated against task-specific human annotations before being deployed for any particular task {{S37.c}}. Task-specific is the load-bearing word, and it puts ch14's bill back on the table: guidelines, qualified annotators, independent labels, redundancy, and an agreement number you can look at.

A validated judge also has a range, and ARES reports where the range ends. Judges do not generalise across more drastic shifts in domain: switching languages, switching from text to code, and switching from retrieving text to extracting entities, webpages, or citations {{S43.g}}. A judge validated on English prose question answering is outside its validated range the day your assistant starts returning code or citation lists, and the validation does not follow it there.

## Scoring without a gold answer at all

Reference-guided grading needs a gold answer per question. Production question sets rarely have one, which is the gap RAGAS aims at with metrics that are fully self-contained and reference-free {{S42.a}}.

The mechanism is worth understanding rather than naming. To estimate faithfulness, a model first extracts a set of statements from the answer {{S42.b}}, and the stated aim of that step is to decompose longer sentences into shorter and more focused assertions {{S42.c}}. The reason this matters: a three-clause paragraph where two clauses are grounded in the retrieved context and one is invented is neither true nor false as a unit. Split into assertions, each one can be checked against the retrieved context on its own, and the score becomes a count rather than an impression. Answer relevance runs a different route, and part of it is obtaining embeddings for all questions with the text-embedding-ada-002 model {{S42.d}}. The metric is therefore defined partly by a named embedding model rather than by a specification alone.

The dataset behind those numbers is small and specific, and you can see exactly how it was built. Fifty Wikipedia pages covering events that have happened since the start of 2022 were selected {{S42.e}}, ChatGPT was used to answer the generated questions when given the corresponding introductory section as context {{S42.f}}, and all questions were annotated along the three quality dimensions by two annotators {{S42.g}}.

On results, be careful about what the citation carries. The paper's prose says the proposed metrics are much closer aligned with the human judgements than the predictions from the two baselines {{S42.h}}, which supports the direction of the claim and no figure for any single dimension, since the per-dimension numbers live in a table rather than in that sentence. The paper also concedes where it is weakest: for answer relevance the agreement is lower, largely because the differences between the two candidate answers are often very subtle {{S42.i}}.

ARES takes the same job and reorganises it around a small human anchor. It reports three scores: context relevance, answer faithfulness, and answer relevance {{S43.a}}. It requires three inputs, an in-domain passage set, a human preference validation set of approximately 150 annotated datapoints or more, and few-shot examples of in-domain queries and answers {{S43.b}}. That validation set is what makes the statistics work, through prediction-powered inference, which gives tighter confidence intervals on the small annotated set by using a judge's predictions on a much larger unannotated set {{S43.c}}.

The comparison between the two frameworks comes from one side of it. ARES reports beating RAGAS by 59.3 and 14.4 percentage points on average across context relevance and answer relevance evaluation accuracy, over six knowledge-intensive datasets in KILT and SuperGLUE {{S43.d}}, with Kendall's tau 0.065 and 0.132 higher on average for the same two dimensions {{S43.e}}. Read those as a claim made by one method's authors about a competitor, on datasets they chose.

The same paper is equally direct about its own limit. Scores computed over entirely unlabelled data, from a judge trained on synthetic data, are not guaranteed to be accurate {{S43.f}}:

> However, these scores reflect entirely unlabeled data with predictions from a synthetically-trained LLM judge, and hence they may not be entirely accurate.

Read both sentences together or neither. A paper's margin over a competitor and a paper's concession about itself are the same kind of evidence, and taking the first without the second is how a framework gets adopted on its abstract.

## What each mode can establish, and what nothing here connects

Line the two modes up and the division is clean.

Offline replay establishes what a system does on a fixed corpus and a fixed question set, scored by a stand-in whose agreement with people was defined and measured somewhere else {{S36.a}}. It reruns, it isolates a change, and it costs no users. It cannot tell you that a person got what they came for, because no person was there.

Live measurement establishes what people did after a change was shipped to a random slice of them {{S40.a}}. It cannot tell you why they did it, and the signals available are indirect {{S39.b}}. It also costs real exposure and real time, and the time is set by the product's traffic rather than by your patience {{S41.b}}.

Ch10 gave you baseline-mismatch: two results are not comparable when each was measured against a different baseline. Mode-mismatch is its sibling. A faithfulness score from a replayed dataset and a click-through difference from an A/B arm are not two readings of one quantity, and averaging them or trading them off is arithmetic on unlike units. When you read a claim about an assistant being better, the first question is which mode produced it.

Now the finding this chapter is built around. None of the sources cited in this chapter establishes what a reference-free score on a replayed dataset predicts about live outcomes. RAGAS validates against annotator judgements on WikiEval {{S42.g}}, ARES validates against a human preference set and reports rank correlations {{S43.b}} {{S43.e}}, and neither follows a scored system into production. The nearest thing to a bridge is Airbnb's observation that offline evaluation was not accurate enough for candidate selection because the ranker only sees what the logging ranker showed {{S41.f}}, and that is a ranking system on a travel marketplace, telling you offline was insufficient rather than telling you how the two relate. Their answer was to keep the live test and use the cheap methods to feed it {{S41.e}}.

So the honest engineering position is that a reference-free score is a fast regression detector on a dataset you control, and a live measurement is evidence about users, and the inference from the first to the second is yours to make and yours to defend.

## Whose stand-in for the truth are you scoring against

Go back to the sentence this chapter opened with. Relevance is used because user happiness is elusive to measure {{S39.a}}. That is not a remark about search engines in 2008. It is the structure of every number in this book.

Ch03 scored retrieval against relevance judgements somebody wrote. Ch04 scored chunking against a corpus somebody assembled. Ch14 scored labels against other labels, and taught you that agreement between people is the ceiling. This chapter scored answers against a judge whose agreement with humans was defined and then measured {{S36.a}} {{S36.b}}, against annotations from two people on fifty Wikipedia pages about events since 2022 {{S42.e}} {{S42.g}}, and against roughly 150 human-annotated preference datapoints {{S43.b}}. Every one of those is a stand-in, and somebody chose it.

Trace what a choice decides. WikiEval's answers were produced by ChatGPT given the introductory section of a Wikipedia page as context {{S42.f}}. A system that scores well there is a system that does well on short answers about recent encyclopaedia events grounded in an introductory paragraph. Nothing in that setup can register a failure on a fifteen-page policy document with contradictory sections, because no such case is in it. The stand-in did not decide that case was unimportant. It simply never made the case available to fail on, which has the same effect on your dashboard.

Judge-Bench found variability by the expertise level of the human judges {{S37.b}}, which is the same point from the other side: change whose judgement counts as truth and the measured quality of the same system moves. There is no view from nowhere here. There is a chosen stand-in, and either you know what it is or you do not.

That is the habit to carry out of these sixteen chapters, because it outlasts every technique in them. Before you believe a number about an assistant, name three things: the stand-in it was scored against, who chose that stand-in, and which real failures the stand-in has no way to express. The number will not volunteer any of them.
