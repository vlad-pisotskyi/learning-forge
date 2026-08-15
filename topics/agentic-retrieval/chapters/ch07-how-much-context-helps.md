---
id: ch07
title: How much context helps, and where the evidence is contested
order: 7
requires: [ch03, ch06]
teaches: [reader-saturation, top-k-selection, distractor-cost, input-length-degradation, contested-evidence]
quiz: quizzes/ch07.quiz.json
estimatedMinutes: 25
status: verified
audit:
  faithfulness:
    verdict: pass
    at: 2026-08-15
    claims: 17
    supported: 17
    unsupported: 0
    overstated: 0
    contradicted: 0
    unreachable: 0
  critique:
    verdict: pass
    at: 2026-08-15
    notes: 0 blocking, 1 advisory
---

Chapter 6 held the set of documents fixed and moved the answer around inside it. This chapter asks the other half of the question: how many passages go in beside the answer, and what each additional one costs. Numbers exist for this. They were measured on particular models with particular query sets, they do not all point the same way, and learning to carry that disagreement without flattening it is as much the subject of this chapter as the numbers themselves.

## Retriever recall keeps climbing after the reader stops improving

Take an open-domain QA pipeline and plot two curves against the number of retrieved documents. The first is retriever recall, the fraction of questions whose answer is somewhere in the returned set. The second is the accuracy of the model reading that set. The first curve cannot fall as the number grows, since adding a document to the list never removes a relevant one already in it. The interesting question is what the second curve does, and the answer is that it flattens first. Model performance saturates long before retriever recall, which the authors of Lost in the Middle read as the models having difficulty making use of the extra retrieved documents. {{S09.d}} Stated in the body of the paper, the same observation reads as reader model performance saturating long before retriever performance, with the readers not effectively using the extra context. {{S09.c}}

That gap between the two curves is the thing that caps how many passages are worth sending. Everything past the point where the reader flattens is recall you paid for and did not collect. The paper puts a number on the tail: using more than twenty retrieved documents improves reader performance only marginally, around 1.5 percent for GPT-3.5-Turbo and around 1 percent for Claude-1.3, while significantly increasing the input context length and therefore latency and cost. {{S09.b}}

Read that as an argument from measurement rather than an argument from taste. Nobody is saying long contexts are inelegant. Two specific readers were measured on a specific task, and past a specific point the accuracy they returned stopped repaying the tokens they consumed. The number twenty belongs to that setup, not to yours.

## How many passages, treated as a measurement

A second paper answers the same question with a different number. The Power of Noise reports that for the queries examined in that study, retrieving between three and five documents is the most effective choice. {{S12.a}} Note the clause the authors put in front of their own recommendation. It is scoped to their queries, and they wrote it that way.

Three to five, and a knee around twenty. {{S12.a}}{{S09.b}} These do not contradict each other, because they are measurements of different readers on different query sets, and neither is a constant to copy into your configuration. What transfers is the procedure. You already have the retrieval side of it from chapter 3: sweep the cutoff, record recall at each k. Record answer accuracy on the same sweep, put the two curves side by side, and read off the point where the second one goes flat while the first is still rising. {{S09.c}} That point is your k, and it is a property of your reader, your corpus and your queries jointly.

## What an irrelevant passage costs

The obvious model of a wasted passage is that it does nothing: the reader ignores it, and you paid tokens for silence. The measurement says otherwise. The Power of Noise reports a clear pattern of progressive accuracy degradation across all the language models it tested as the number of related documents in the context increases. {{S12.b}} More on-topic context, less accurate answers, across every model in that study.

The same study also reports a configuration that runs against intuition. Optimal trade-off and accuracy, in its own words, were attained when a minimal set of documents is retrieved first and then supplemented with irrelevant documents until the context limit is reached. {{S12.c}} That is what that study found under its conditions, reported here because dropping a surprising result is how a literature review turns into an argument. It is not advice to pad your prompts with noise, and this chapter is not extending it past the setup it was measured on.

Hold the two results apart, because they use two different labels. The degradation result is about documents the study calls related. {{S12.b}} The padding result is about documents it calls irrelevant. {{S12.c}} Those are separate categories in the paper's own vocabulary with a separate finding attached to each, and the takeaway is that what an added passage costs depends on what kind of passage it is. That is a question for your evaluation set, not for a rule of thumb.

## Length hurts even with position held still

Chapter 6's design changed position while holding length constant. Same Task, More Tokens does the mirror image. Each base reasoning question is expanded to input lengths of roughly 250, 500, 1000, 2000 and 3000 tokens by adding background text that is irrelevant to the question, which the authors call padding. {{S17.b}} The question is identical at every length. Only the volume of surrounding text changes.

Reasoning accuracy degrades quickly, even at an input length of 3000 tokens, far below the technical maximum of the models tested, with an average drop across all tested models from 0.92 to 0.68. {{S17.a}} The models were GPT4, GPT3.5, Gemini-Pro, Mistral 70B and Mixtral 8x7B. {{S17.d}}

The sentence that makes this a separate effect from the one chapter 6 taught is this one: accuracy decreases as input length grows regardless of where the answer-bearing paragraphs are placed within the input. {{S17.c}} Move the relevant text to the front and the degradation is still there. So a pipeline has two distinct things to worry about, and fixing the arrangement of the context does not address the size of it.

## A study that fails to reproduce the position effect, and why

Counting-Stars evaluated long-context models and reports that its findings cannot strongly corroborate the lost-in-the-middle phenomenon, the result chapter 6 covered. {{S16.a}} What its authors saw instead is that the bad cases usually appeared in the tail rather than the middle of the long context, which they name the lost-in-the-tail phenomenon. {{S16.b}}

Before treating that as a refutation, read the conditions. Counting-Stars selected two models on the basis of handling extremely long context: GPT-4-Turbo-128K, the gpt-4-1106-preview model with a 128K context window, and Kimi-Chat, the Moonshot-v1-128K model with a 128K context window. {{S16.d}} The earlier work was not run on those. The Counting-Stars authors offer their own account of the divergence and mark it as one possible reason rather than as a finding: the earlier study located the phenomenon in tests at contexts of at most 16K, which these authors judge not long enough. {{S16.c}}

## Reporting a contested finding honestly

The method is three steps and no fourth. State that the sources disagree. Name the conditions each one measured under. Cite both. Then stop, because adjudicating between two experiments you did not run is the part that is not yours to do.

Applied here: on where failures cluster inside a long context, the primary sources disagree. Counting-Stars could not strongly corroborate the lost-in-the-middle result and located failures in the tail instead {{S16.a}}{{S16.b}}, measuring two models with 128K context windows {{S16.d}}, and its authors point at the earlier work's ceiling of 16K contexts as a candidate explanation for the difference {{S16.c}}. Chapter 6 carries the other side with its own citations. A separate effect sits alongside both: input length degrades reasoning accuracy independently of where the relevant paragraphs sit, measured across five models at lengths up to 3000 tokens. {{S17.c}}{{S17.d}}{{S17.b}}

Notice what that framing buys you. Any single one of those results, quoted alone, licenses a confident and wrong design rule: always rerank to the front, or never exceed 16K, or stop worrying about the middle. The set of them together licenses something narrower and more useful, which is that context length and context arrangement both move accuracy, the direction and size are model-specific, and your own numbers come from your own sweep.

Lost in the Middle closes by naming two directions for future work: effective reranking of retrieved documents, meaning pushing relevant information closer to the start of the input context, and ranked list truncation, meaning retrieving fewer documents when appropriate. {{S09.u}} That sentence proposes where to look rather than reporting a measured gain, and the excerpt behind it names no experiment testing either idea. Truncation is what this chapter has been about. Reordering is chapter 8.
