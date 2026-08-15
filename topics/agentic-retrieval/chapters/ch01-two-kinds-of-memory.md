---
id: ch01
title: "Retrieval-Augmented Generation: two kinds of memory"
order: 1
requires: []
teaches: [parametric-memory, non-parametric-memory, retriever-generator-split, rag-sequence, rag-token, provenance-and-updating]
quiz: quizzes/ch01.quiz.json
estimatedMinutes: 25
status: draft
audit:
  faithfulness:
    verdict: fail
    at: 2026-08-15
    claims: 36
    supported: 33
    unsupported: 0
    overstated: 3
    contradicted: 0
    unreachable: 0
  critique:
    verdict: pass
    at: 2026-08-15
    notes: 0 blocking, 2 advisory
---

## What a model knows without being told

Train a sequence model on a large pile of text and some of what it read stays behind in the weights. Not as records anyone can look up: the RAG paper's description of a pre-trained language model is a parameterized implicit knowledge base, a store the model reads from with no access to any external memory. {{S01.c}} There is a name for using a model this way and nothing else. Closed-book question answering generates an answer with no retrieval step at all, so every fact in the output arrived through the parameters. {{S01.l}}

The comparison an engineer will reach for is data compiled into a binary with the source thrown away. It works, it is fast, and there is no field to patch. The paper's introduction names three costs of the arrangement: the memory cannot easily be expanded or revised, the model does not straightforwardly give insight into its own predictions, and hallucination is the third item on the list. {{S01.c}} The first two are about where the knowledge sits rather than how good it is: the paper names both revising the memory and reading insight out of it as difficult, without saying why. {{S01.c}}

## Splitting knowledge out of the weights

RAG keeps the parametric store and puts a second one next to it. The parametric memory is a pre-trained seq2seq transformer; the non-parametric memory is a dense vector index of Wikipedia, reached through a pre-trained neural retriever, an ordinary data structure sitting outside the model rather than a store spread across its weights. {{S01.d}} Those are the two kinds of memory in the chapter title.

The data flow is small enough to state in one line. An input sequence x is used to retrieve text documents z, and those documents become additional context when the target sequence y is generated. {{S01.f}} The retriever half is written as a probability distribution rather than a search function: given the query x it returns a top-K truncated distribution over text passages, and it has its own parameters, separate from the generator's. {{S01.g}} That detail matters more than it looks: what the retriever hands over is a probability distribution over passages, top-K truncated, so each passage carries a probability rather than a plain rank. {{S01.g}}

## Two ways to condition on a retrieved passage

Given K passages and one output to produce, there are two places to make the choice, and the paper builds both. The first conditions on the same retrieved passages across the whole generated sequence; the second uses different passages per token. {{S01.a}}

RAG-Sequence uses one retrieved document to generate the complete sequence. The document is a single latent variable that gets marginalized out to give the sequence probability p(y|x), under a top-K approximation. {{S01.h}} Concretely: rather than committing to one retrieved document ahead of time, the model treats which document was retrieved as unknown and marginalizes over it, and that top-K approximation is what keeps the marginalization to the documents the retriever actually returned instead of the whole index. {{S01.h}}

RAG-Token moves the draw inside the loop. A different latent document is drawn for each target token and marginalized accordingly, which lets the generator take content from several documents while producing a single answer. {{S01.i}} An answer whose date comes from one passage and whose name comes from another is available to RAG-Token by construction and is not available to a formulation locked to one document for the whole output.

The two collapse into each other in one case. Treat a classification target as a target sequence of length one and RAG-Sequence and RAG-Token are equivalent, since there is only one token for the per-token draw to vary over. {{S01.j}} The split also has a cost at decoding time. Beam search is the standard shortcut for approximating the most likely output sequence: at each generated token, keep only a handful of the best partial sequences produced so far and extend those, instead of scoring every possible continuation. The shortcut depends on the sequence probability breaking into a running product of per-token probabilities. For RAG-Sequence the likelihood p(y|x) does not break into a conventional per-token likelihood, so a single beam search does not solve it. {{S01.k}} No excerpt pinned for this chapter names what replaces it, so the cost stands here as open rather than solved.

## Training the two halves together

The retriever and the generator are trained jointly, with no direct supervision on which document should have been retrieved. {{S01.e}} There is no label anywhere in the training data marking a passage as the right one; training runs on input and target-output pairs alone. {{S01.e}}

What makes this work is the marginalization from the previous section. p(y|x) is a marginal over the K retrieved documents {{S01.h}}, and the retriever contributes a probability rather than a plain rank for each one it returns {{S01.g}}, so those probabilities are what the marginal weights. The retriever and the generator are trained jointly on that marginal, with no direct supervision on which document should have been retrieved. {{S01.e}}

## What the original paper measured, and against what

Two baselines frame the comparison. The extractive QA paradigm pulls the answer out as a span of a retrieved document, relying mainly on non-parametric knowledge; closed-book approaches generate the answer like RAG does but skip retrieval and rely purely on parametric knowledge. {{S01.l}} RAG sits between them, and the results are reported against both.

The abstract records a new state of the art on three open-domain QA tasks, beating both parametric seq2seq models and task-specific retrieve-and-extract architectures, and reports that RAG produces more specific, diverse and factual language than a parametric-only seq2seq baseline on generation tasks. {{S01.b}} The results section reports a new state of the art on all four open-domain QA tasks, with the TriviaQA result qualified to the split that is comparable with T5, and notes that RAG reaches those numbers without the expensive salient span masking pre-training that REALM and T5+SSM use. {{S01.m}} That TriviaQA qualification matters because the open-domain QA table reports TriviaQA on two different test sets side by side, the standard open-domain set and the TQA-Wiki set, {{S01.p}} and the state-of-the-art claim holds only on the split comparable to T5. {{S01.m}} Against the DPR QA system, which re-ranks documents with a BERT cross-encoder and then extracts a span, RAG comes off well enough that the paper concludes neither a re-ranker nor an extractive reader is required for state-of-the-art performance. {{S01.n}}

One number is worth carrying forward on its own. On Natural Questions, in the cases where the correct answer appears in none of the retrieved documents, RAG reached 11.8% accuracy, where an extractive model scores 0%. {{S01.o}} The zero is structural rather than unlucky: an extractive system answers with a span taken out of a retrieved document, so with the answer absent from every retrieved document there is no span to take. {{S01.l}} A generator has both memories to work from. {{S01.d}}

## Why provenance and updating are the point

The abstract states the motivation directly: for models that hold their world knowledge in parameters, providing provenance for their decisions and updating that knowledge remain open research problems. {{S01.q}} Two problems, named separately, with separate consequences for anyone building on such a model.

Provenance first. A closed-book answer is generated without retrieval, conditioned on the parameters and nothing else, and the paper lists the absence of straightforward insight into a model's predictions among the downsides of that setup. {{S01.l}}{{S01.c}} A RAG answer is conditioned on documents that a retrieval step selected and passed in as context, which is the retrieved-document mechanism this chapter has been describing all along. {{S01.f}}

Updating second. The paper's stated downside is that a parametric model cannot easily expand or revise its memory. {{S01.c}} In a RAG model the encyclopedic half of the knowledge is a dense vector index built over Wikipedia, held outside the seq2seq transformer and reached through the retriever rather than baked into its weights. {{S01.d}}{{S01.a}} Later chapters are about that index: how retrieval over it is built, and how it is measured.
