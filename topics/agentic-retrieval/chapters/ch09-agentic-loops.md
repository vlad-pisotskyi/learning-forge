---
id: ch09
title: "Agentic loops: deciding when and what to retrieve"
order: 9
requires: [ch01, ch07]
teaches: [reflection-tokens, adaptive-retrieval, retrieval-threshold, reasoning-action-interleaving, agentic-loop, ablation-baseline]
quiz: quizzes/ch09.quiz.json
estimatedMinutes: 30
status: draft
---

## Retrieving a fixed number of passages every time, and what it costs

Every pipeline in this book so far has retrieved once, before generation, and retrieved the same number of passages no matter what the question was. Self-RAG's abstract names what that arrangement costs: indiscriminately retrieving and incorporating a fixed number of passages, regardless of whether retrieval is necessary or whether the passages are relevant, diminishes a language model's versatility or leads to unhelpful generation, and the paper's answer is a single model that retrieves on demand and then reflects on what came back, using special vocabulary it calls reflection tokens. {{S21.a}}

There are two separate failures in that sentence, and they fail in different places. One is retrieving when the model did not need anything retrieved. The other is retrieving passages that are not relevant to what is being written. You have already met the second one from the reader's side in chapter 7, where an irrelevant passage sitting in the context costs answer accuracy. Self-RAG is looking at the same problem from the pipeline's side: `k` is fixed before the question arrives, so a fixed top-k pipeline has no place to express either decision. It retrieves the same amount for a question that needs three documents and for one that needs none.

## A model that emits its own decision to retrieve

"The model decides whether to retrieve" sounds like a classifier in front of the retriever and a branch in the orchestration code. Self-RAG has neither. The generator is trained to produce reflection tokens by unifying them as next-token prediction from an expanded model vocabulary, over a collection of text interleaved with reflection tokens and retrieved passages. {{S21.f}} The vocabulary gains entries that are not words, and emitting one of them is the decision. The forward pass that writes the next span of prose is the same forward pass that writes the retrieval token instead, so there is no separate component anywhere to call.

Reflection tokens fall into two categories: retrieval tokens, which indicate the need for retrieval, and critique tokens, which indicate the quality of what was generated. {{S21.d}} The paper's table of them lists four types, three of which are critique types, and notes that each type uses several tokens to represent its output values. {{S21.g}} Hold on to that last detail, because the next section runs on it: a reflection token is a small set of alternatives, not one symbol, and the model's output at that position is a distribution over that set.

What the decision is conditioned on is nothing exotic. Given an input prompt and the preceding generations, the model first determines whether continuing with retrieved passages would help, and if it would, emits a retrieval token that calls a retriever on demand. {{S21.e}} The inference-time statement is the same rule with the variables named: for every input and every preceding generation, the model decodes a retrieval token to evaluate the utility of retrieval, and when retrieval is not required it predicts the next output segment exactly as a standard language model does. {{S21.h}} So the decision happens per step, not per query, and it is conditioned on everything the model has already written.

The abstract makes one further claim about this design: generating reflection tokens makes the model controllable during inference, so its behaviour can be tailored to different task requirements. {{S21.b}} That is an assertion about the mechanism, and the abstract sentence carries no measurement of controllability with it.

## Turning a predicted token into a threshold

By default the prediction is the decision. Self-RAG decides when to retrieve by predicting the `Retrieve` token, and the framework alternatively allows a threshold to be set: if the probability of generating `Retrieve=Yes`, normalised over all output tokens in `Retrieve`, surpasses a designated threshold, retrieval is triggered. {{S21.i}}

Work through what that computation is. `Retrieve` has several possible output values, one of which is yes. {{S21.g}} At the position where the model is about to decide, each of those values has a score. Normalising over just those values, rather than over the whole vocabulary, turns the scores into a probability distribution across that one choice, and the resulting number is the model's confidence in retrieving relative to not retrieving. Comparing it against a bar is what converts a soft prediction into a hard branch. {{S21.i}}

Notice where the bar comes from. The framework allows a threshold to be set, which means the number arrives from outside the model rather than out of training. {{S21.i}} Lower it and more steps clear it, so the system retrieves more often; raise it and fewer do. That makes it the same class of object as the diversity parameter in chapter 8: a single scalar that slides the system along a range of behaviours, where the quoted passage defines the rule and leaves the number to whoever is setting it.

## Thoughts that change nothing, actions that change something

ReAct starts from a split in how these two capabilities had been studied. Reasoning, in the form of chain-of-thought prompting, and acting, in the form of action plan generation, had primarily been treated as separate topics; ReAct generates reasoning traces and task-specific actions in an interleaved manner, where the reasoning traces help the model induce, track and update its action plans and handle exceptions, while the actions let it interface with and gather information from external sources such as knowledge bases or environments. {{S22.a}}

The mechanism is one asymmetry, and it is worth stating precisely. An action taken in language space, which the paper calls a thought or a reasoning trace, does not affect the external environment and so produces no observation feedback. {{S22.b}} Every other action leaves the model, reaches something outside it, and comes back with an observation. A thought goes nowhere and nothing answers it. The only trace it leaves is in the model's own context, which is exactly what the next step reads. That is why thoughts can be inserted anywhere in the sequence without breaking anything: the environment never sees them.

What goes in a thought is open. The paper lists decomposing task goals and creating action plans, injecting commonsense knowledge relevant to the task, extracting the important parts of an observation, tracking progress and moving between plans, and handling exceptions by adjusting the plan. {{S22.c}}

For retrieval, the consequence is where the query comes from. By interacting with a Wikipedia API, ReAct retrieves information to support its reasoning while also using reasoning to target what to retrieve next. {{S22.d}} A fixed pipeline computes its query once, from the user's question. Here the query for the next step is written by the model after it has read the previous observation, which is what makes the loop agentic rather than scripted.

The two systems in this chapter decide different things, and conflating them is easy. Self-RAG's decision is whether the next segment needs retrieval at all. {{S21.h}} ReAct's is what to fetch next, given what the last fetch returned. {{S22.d}}

## What each half contributes, shown by removing it

A system with two halves that beats a system with neither has proved almost nothing. The comparison that carries information is against the same method with one half removed, and ReAct's is Act: the same setup with the reasoning taken out. On HotpotQA and Fever with PaLM-540B as the base model, ReAct is better than Act on both tasks, which the paper reads as the value of reasoning to guide acting, especially when synthesizing the final answer. {{S22.e}} The numbers behind that sentence are in a table these excerpts do not carry, so take the direction from it and not a size.

Where the paper states sizes in prose, they are worth having. On ALFWorld the best ReAct trial reaches an average success rate of 71 percent, against 45 percent for the best Act trial and 37 percent for BUTLER. {{S22.h}}

Then the complication, which is the part to remember. On WebShop, one-shot Act prompting already performs on par with the imitation-learning and IL+RL methods, and adding sparse reasoning on top gets ReAct an absolute 10 percent improvement over the previous best success rate. {{S22.i}} Same ablation, different accounting. On ALFWorld the reasoning half separates 71 from 45. On WebShop the acting half alone already matched the prior work, and reasoning bought ten points on top of that rather than the result itself. Reporting only the ALFWorld split would leave you believing the reasoning half is where the performance lives, and one benchmark later that belief is wrong.

## What the two systems report, and against which baselines

ReAct against chain-of-thought goes in both directions, and the paper states both: ReAct outperforms CoT on Fever, 60.9 against 56.3, and slightly lags behind CoT on HotpotQA, 27.4 against 29.4. {{S22.f}} A summary that carried only the Fever number would be true and useless.

The failure analysis puts two different kinds of statement in consecutive sentences. The measured part is that hallucination gives CoT a much higher false positive rate than ReAct in success mode, 14 percent against 6 percent, and that it is CoT's major failure mode at 56 percent. The interpretive part is the authors' description of ReAct's problem-solving trajectory as more grounded, fact-driven and trustworthy, which they attribute to its access to an external knowledge base. {{S22.g}} The first is a rate somebody counted. The second is what the authors take the rate to mean.

For Self-RAG, the baseline category that decides what its numbers are worth is the one made of methods trained with retrieved passages: SAIL, which instruction-tunes a model on Alpaca data with top retrieved documents inserted before the instructions, and Toolformer, which pre-trains a model with API calls such as Wikipedia APIs. {{S21.j}} Beating a model that has no retriever says only that retrieval helps. Beating one that already retrieves is the comparison that bears on how retrieval is controlled.

Against baselines without retrieval, the paper reports a substantial advantage over supervised fine-tuned LLMs on all tasks, and reports outperforming ChatGPT on PubHealth, PopQA, biography generation, and ASQA under Rouge and MAUVE. {{S21.k}} Against baselines with retrieval, it reports outperforming existing RAG on many tasks and the best performance among non-proprietary LM-based models on all tasks, and it attaches a qualification in the same passage: on PopQA and Bio, powerful instruction-tuned LMs with retrieval show large gains over their own non-retrieval baselines. {{S21.l}} Both of those sentences stand in for a table these excerpts do not transcribe, so they support the direction of the claim and no specific number. The abstract states the headline version, that Self-RAG at 7B and 13B outperforms state-of-the-art LLMs and retrieval-augmented models across a diverse set of tasks, naming ChatGPT and retrieval-augmented Llama2-chat on open-domain QA, reasoning and fact verification, with gains in factuality and citation accuracy for long-form generation. {{S21.c}} Both the headline and the qualification come from the same paper, and only one of them is in the abstract.
