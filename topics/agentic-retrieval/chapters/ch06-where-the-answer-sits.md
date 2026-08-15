---
id: ch06
title: Where in the context the answer sits
order: 6
requires: [ch01]
teaches: [position-effect, u-shaped-attention-bias, multi-document-qa-probe, key-value-retrieval-probe, query-aware-contextualization, architectural-account]
quiz: quizzes/ch06.quiz.json
estimatedMinutes: 30
status: draft
audit:
  faithfulness:
    verdict: fail
    at: 2026-08-15
    claims: 31
    supported: 30
    unsupported: 1
    overstated: 0
    contradicted: 0
    unreachable: 0
  critique:
    verdict: pass
    at: 2026-08-15
    notes: 0 blocking, 2 advisory
---

The previous chapter ended on an assertion offered without a measurement: that models have trouble finding information inside very long inputs. The measurement exists. Accuracy is often highest when the relevant information sits at the beginning or the end of the input context, and it degrades significantly when the model has to use information sitting in the middle of a long context, including in models sold explicitly as long-context models. {{S09.e}} The same work also produced evaluation protocols for testing long-context models, and that half is the part you can reuse on a system nobody has published a paper about. {{S09.a}}

## The experiment: hold the documents, move the answer

The task is multi-document question answering. The model receives a question and a set of documents, exactly one of which contains the answer, and the manipulation is a single variable: the order of the documents is adjusted so that the position of the answer-bearing document changes. {{S09.f}} Input context length is controlled by a separate knob, the number of documents in the context. {{S09.g}} Position and length are two variables, and the design keeps them apart.

That discipline is what makes the result mean anything. If two runs differ in the index of one document and in nothing else, then a difference in accuracy between them has one candidate cause. Swap in different distractors as well, or lengthen the context at the same time, and the number you get back is a number about three things at once.

The rest of the setup is ordinary on purpose. Documents are Wikipedia passages of at most 100 tokens each. {{S09.h}} The sweep runs over inputs of 10, 20, and 30 total documents. {{S09.i}} On the open side the models include MPT-30B-Instruct, whose maximum context length is 8192 tokens. {{S09.j}} On the closed side, GPT-3.5-Turbo and GPT-3.5-Turbo (16K) are reached through the OpenAI API. {{S09.k}}

## What the accuracy curve looked like

Plot accuracy against the answer's position and the curve is high at both ends and sags in the middle. {{S09.e}} The size of the sag is what makes it an engineering problem rather than a curiosity: GPT-3.5-Turbo's multi-document QA performance can drop by more than 20 percent depending on where the answer sits, and in the worst case, in the 20-document and 30-document settings, it falls below the model's performance with no input documents at all. {{S09.l}}

That last comparison deserves a number attached to it. Answering with no documents, purely out of the weights, scored 56.1 percent, and placing the relevant information in the middle of the input pushed the model below that. {{S09.m}} Retrieval, in that configuration, had negative value. The pipeline fetched the right passage, put it in front of the model, and ended up worse off than a pipeline that fetched nothing. A retrieval stage is not automatically a contribution, and "we improved recall" is not the same claim as "we improved answers".

## A synthetic probe with no meaning in it

A failure on multi-document QA has two explanations and the task cannot tell them apart. The model either failed to locate the relevant passage inside its own context, or located it and failed to reason from it to an answer. Wikipedia passages carry meaning, the distractors are about roughly the right subject, and comprehension is in play throughout.

The key-value retrieval task removes the second explanation by removing meaning. The input is a string-serialized JSON object holding k key-value pairs, where every key and every value is a unique, randomly generated UUID. {{S09.n}} Inputs are built with 75, 140, and 300 pairs. {{S09.o}} Given one key, the model returns its value. There is nothing to understand: a UUID says nothing, no distractor is more topically related than any other, and a correct answer is an exact copy of a string that is sitting in the prompt. A model that gets this wrong did not misunderstand anything. It failed to find a token it was given.

The result splits the models. Claude-1.3 and Claude-1.3 (100K) do nearly perfectly across all the evaluated input lengths, and other models struggle. {{S09.p}} Two things follow. Whatever "lost in the middle" is, on at least some models it survives the removal of all semantic content, which places part of it in retrieval rather than in comprehension. And it is not a property every model has, which is the thread section six picks up.

## One intervention, and the two different effects it had

The paper tests one intervention, which it calls query-aware contextualization, against both tasks, and the two tasks answer differently. On key-value retrieval it improves performance dramatically, with all models reaching near-perfect scores. {{S09.q}} On multi-document question answering the same intervention minimally affects the performance trends. {{S09.r}}

Resist averaging those into a verdict. One intervention producing two outcomes is information about the two tasks: whatever the synthetic probe was measuring, the intervention addresses it, and whatever else multi-document QA is measuring survives untouched. The practical form of this is a warning about probes in general. A probe earns its place by isolating one failure mode, and that same isolation is why a fix validated on the probe is not yet a fix for the task the probe stands in for. Carry the mitigation across only after you have measured it on the task you actually run.

## The attention account, and the structural one

Two explanations exist for the shape of that curve, and they are different kinds of claim.

The first is a measurement of a trained model. Language models exhibit a U-shaped attention bias, in which tokens at the beginning and at the end of the input receive higher attention regardless of their relevance. {{S18.a}} The control that makes this more than a restatement of the accuracy curve is shuffling: the U-shaped pattern persists after documents are randomly shuffled, which is evidence that the bias does not depend on the documents' actual content. {{S18.b}} If the peaks came from what the documents said, moving the documents would move the peaks. They stay where they are, so they belong to the positions. The scope of that finding is what the experiments covered, two multi-document QA tasks (NaturalQuestion and SynthWiki) and two models, Vicuna-7b-v1.5-16k and tulu-2-7b, with 16k and 8k context windows. {{S18.d}} Treating the bias as a measurable quantity also makes it something to correct for, and the method built on that correction outperforms existing methods by up to 15 percentage points on retrieval-augmented generation tasks. {{S18.c}}

The second explanation is a claim about the model class rather than about any trained instance. Lost-in-the-middle-type behaviour can arise from the architecture of causal Transformers itself. {{S20.a}} The named mechanism is structural: at finite depth, causal masking and residual connections induce broad, often U-shaped influence profiles, and the profiles that theory predicts closely match measured input-token influence in pretrained language models. {{S20.b}}

The distinction is worth holding precisely, because it changes what each result licenses you to expect. A measurement of attention in two 7B models says that those models do this. An argument from causal masking and residual connections says that a model assembled out of those parts inherits a tendency toward this shape, whatever it was trained on. The first is checked by measuring more models. The second is checked by whether its predicted profiles match, which is the check its authors report making. {{S20.b}} An architectural account is not a stronger version of a behavioural one; it is an account with a different domain, and mixing them up is how "we measured this in Vicuna" turns into "all transformers do this" in somebody's design document.

## Where the effect is model-specific

The curve is not a constant of nature, and the same paper that found it also found the exceptions. Evaluated on sequences that fit inside its 2048-token training-time context window, Flan-UL2 is relatively robust to the position of the relevant information, with 1.9 percent absolute difference between its best and worst case. {{S09.s}} That is close to flat. Separately, when an input fits in the context window of both a model and its extended-context counterpart, the two perform nearly identically. {{S09.t}} Paying for the longer window buys nothing on prompts that already fit.

The direction of the bias is model-specific too. Position bias is primarily model-driven, with language-specific nuances, and Qwen2.5-7B-Instruct, DeepSeek 7B Chat, and Mistral 7B consistently favour late positions, which runs against the common assumption of a universal early-token preference. {{S19.a}} So the rule of thumb "put the important passage first" is a hypothesis about your model, not a law, and section one gives you the design that settles it in an afternoon.

One more measurement is the one you will meet in production. Accuracy drops most when the relevant information appears in the middle of the context, and that drop is not accompanied by a corresponding rise in output entropy; the authors read this as the model remaining confident even when it fails to use mid-context cues. {{S19.b}} The failure does not announce itself. Output entropy stays flat right where accuracy is falling, {{S19.b}} so a position problem in your pipeline will not show up as visible uncertainty. It shows up as wrong answers, delivered well, until somebody measures the curve.
