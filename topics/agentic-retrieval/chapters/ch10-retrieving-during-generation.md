---
id: ch10
title: Retrieving during generation, not before it
order: 10
requires: [ch05, ch09]
teaches: [single-time-retrieval, fixed-schedule-interleaving, model-decided-interleaving, query-complexity-routing, just-in-time-context, interleaving-overhead, baseline-mismatch]
quiz: quizzes/ch10.quiz.json
estimatedMinutes: 35
status: draft
audit:
  faithfulness:
    verdict: fail
    at: 2026-08-15
    claims: 44
    supported: 41
    unsupported: 0
    overstated: 1
    contradicted: 1
    unreachable: 1
  critique:
    verdict: pass
    at: 2026-08-15
    notes: 0 blocking, 4 advisory
---

## One retrieval from the question, and the questions it cannot serve

The standard pipeline retrieves documents from the user's input and then generates a complete answer conditioned on those documents {{S48.b}}. One retrieval, decided before a single token of the answer exists, and everything the answer will need has to be in it.

FLARE's authors state the condition under which that is enough: the information needs are clear in the user's input, and retrieving relevant knowledge once from the input alone is sufficient {{S48.c}}. Read that as a precondition rather than a concession, because it tells you exactly which questions the design serves. The same paper states the other half: most retrieval augmented models retrieve once from the input, which is limiting when the task involves generating long text and information has to be gathered continually across the course of generation {{S48.a}}.

IRCoT names the failure in a different shape. One-step retrieve-and-read is insufficient for multi-step question answering, because what needs to be retrieved depends on what has already been derived, which in turn depends on what was retrieved before {{S49.a}}. A one-shot retrieval from the question succeeds on many factoid tasks; on a multi-step question you retrieve partial knowledge, perform partial reasoning, retrieve more on the strength of that partial reasoning, and iterate {{S49.b}}. Consider a question whose answer requires knowing which company acquired a particular startup and then knowing where that company is headquartered. The second fact is unreachable from the original wording, because the entity you would search for does not appear in it.

## Three places the decision can live

Every scheme in this chapter retrieves more than once, so every one of them has to answer the same question: what triggers the next retrieval. There are three answers, and the whole taxonomy is built on which component holds the trigger.

The system holds it when retrieval fires on a fixed schedule, for instance every l tokens where l is a window size the implementation sets {{S48.k}}. The generator holds it when the method actively decides when and what to retrieve while it is generating {{S48.a}}. A separate component holds it when the choice is made per query before generation begins, for instance by a classifier that predicts how complex the query is and picks a strategy accordingly {{S51.b}}.

Four papers all report that retrieving more than once beats retrieving once, and read in sequence they sound like four confirmations of one claim. They are four different systems with the trigger in three different places, and, as the last section shows, their headline numbers were not measured against the same thing.

## Retrieving on a schedule the system sets

The simplest schedule is a counter. Previous-window approaches trigger retrieval every l tokens, where l is the window size {{S48.k}}. Nothing about the model's state enters the decision. The counter reaches l, a query is formed, retrieval happens.

IRCoT counts reasoning steps instead of tokens. It alternates two operations: extend the chain of thought, using the question plus the paragraphs collected so far plus the chain-of-thought sentences generated so far to produce the next sentence; then expand the retrieved information, using that last sentence as a query to fetch more paragraphs into the collected set. The loop repeats until the chain of thought reports an answer or the maximum number of reasoning steps is reached {{S49.c}}. The query text is the model's, since it is the sentence the model just wrote. The timing is not. Every sentence gets a retrieval whether or not the model needed one.

The numbers here are the most concrete in the chapter, and one detail bounds all of them: the retriever is BM25 implemented in Elasticsearch {{S49.g}}. That is sparse lexical matching, the machinery from chapter 2, so every recall figure below is a recall figure for a lexical retriever.

Against one-step retrieval, IRCoT improves recall for Flan-T5-XXL by 7.9 points on HotpotQA, 14.3 on 2WikiMultihopQA, 3.5 on MuSiQue, and 10.2 on IIRC; for GPT3 the same four improvements are 11.3, 22.6, 12.5, and 21.2 points {{S49.d}}. Downstream answer quality mostly follows. Flan-T5-XXL gains 9.4, 15.3, 5.0, and 2.5 F1 points on the four datasets, and GPT3 gains 7.1, 13.2, and 7.1 on the first three {{S49.e}}.

The fourth GPT3 cell is the one worth stopping on. On IIRC, GPT3 answer quality did not improve at all, despite a 21-point retrieval gain, and the authors' stated explanation is that the relevant knowledge is already inside GPT3, with the similarity of its no-retrieval answer score offered as the evidence {{S49.e}}. Chapter 8 made this point with rerankers; here it is again from a different direction. A retrieval metric moving is not an answer metric moving. The abstract also asserts that IRCoT reduces hallucination and produces factually more accurate reasoning, with no number attached to that claim {{S49.f}}.

## Letting the generator decide, from confidence or from its own sub-question

FLARE moves the trigger into the generator and ties it to uncertainty. It iteratively predicts the upcoming sentence, uses that prediction as a query to retrieve documents, and regenerates the sentence when the prediction contains low-confidence tokens {{S48.a}}. Nothing fires while the model is confident. The measurements were made on text-davinci-003 through its API, with off-the-shelf retrievers taking queries and returning documents {{S48.d}}, and Bing as the retriever for datasets that draw on the open web {{S48.e}}.

The paper's overall-results section states that FLARE outperforms all baselines on all tasks and datasets {{S48.f}}. That sentence is all this chapter carries. The scores themselves live in a figure that was not transcribed into this topic's sources, so what is pinned here is the paper's own summary of its result rather than any number {{S48.f}}.

Self-Ask puts the trigger in the model's output text instead of its confidence. The prompt format makes the model ask itself follow-up questions, and because that format marks the beginning and end of every sub-question, a search engine can answer the sub-questions in place of the model {{S50.c}}. The loop is mechanical enough to write from the description. Feed in the prompt. If the model emits "Follow up:", let it finish generating the question, which it terminates by emitting "Intermediate answer:". Stop the model there. Send the full sub-question to a search engine API, append the returned answer to the prompt, and let the model continue {{S50.d}}. In an SDK you would recognise this as a generation call with a stop sequence, a tool call, and a resumed completion. Those results were produced with Davinci-002 on 2WikiMultiHopQA, Musique, and Bamboogle {{S50.f}}.

Self-RAG and ReAct from chapter 9 belong in this same box. Self-RAG emits its decision to retrieve as a token, ReAct interleaves thoughts with actions, and in both the generator owns the trigger. Chapter 9 carries their citations and their numbers.

## Deciding before generation starts, from the question alone

Adaptive-RAG targets a failure with two directions. Existing approaches either handle simple queries with unnecessary computational overhead or fail to address complex multi-step queries adequately, and real user requests do not sort cleanly into simple or complex {{S51.a}}. Committing to one strategy for all traffic is wrong for part of that traffic either way.

Its answer is a router. The framework selects the most suitable strategy, from the simplest to the most sophisticated, based on query complexity, and that selection is done by a classifier: a smaller language model trained to predict the complexity of an incoming query, with training labels collected automatically from the actual predicted outcomes of models and from inductive biases in the datasets. The strategies it chooses among are iterative retrieval, single-step retrieval, and no retrieval {{S51.b}}. For the taxonomy this is the whole point. The decision is per query, it is made before generation starts, and it is made by a different model from the one that will generate.

On cost, the paper reports that the adaptive strategy is significantly more efficient than the always-multi-step strategy across all model sizes {{S51.d}}. The table behind that sentence was not transcribed into this topic's sources, so the claim arrives here without its numbers {{S51.d}}. What can be confirmed is the shape of the measurement: elapsed time per query is one of the quantities the paper reports, alongside the share of each predicted complexity label across all samples {{S51.e}}.

## Holding identifiers instead of content

<!-- allow-hedge: unmeasured practice, the cited article publishes its recommendation without a measurement behind it -->
The same idea appears in engineering practice under a different name. Rather than pre-processing all relevant data up front, an agent built on the just-in-time approach keeps lightweight identifiers, such as file paths, stored queries, and web links, and uses those references to load data into context at runtime through tools {{S52.a}}. The article that names the approach also describes the direction of travel it observes: many applications use embedding-based retrieval before inference, and as the field moves toward agentic designs, teams are augmenting those retrieval systems with just-in-time strategies {{S52.b}}. Both statements are recommendation and observation. That article publishes them without a measurement behind them {{S52.a}}{{S52.b}}.

Structurally an identifier is a query held in a more precise form, and the decision point is the same one FLARE and Self-Ask use: the model, mid-generation. What differs is the unit fetched. A ranked list of passages arrives with a relevance judgement attached; a file path arrives with none, and the agent has committed to reading whatever is at the other end.

## What it costs, and why every source says so rather than shows it

Every cost statement in this chapter's sources runs against the pattern the same sources advocate, and none of the four is a benchmark of the cost.

FLARE's limitations section is the most specific. Interleaving generation and retrieval with a naive implementation increases both the overheads and the cost of generation, because the model has to be activated once per retrieval and, without caching, the previous activations are recomputed after each retrieval {{S48.i}}. That is an assertion about what an implementation does, not a measurement of what it costs, and no cost figure accompanies it {{S48.i}}. The appendix repeats the claim with the comparison named: against single-time retrieval, naive interleaving does increase overheads {{S48.j}}. The mechanism is worth holding on to, because it explains why the cost is not simply one extra network call. Retrieved text is inserted into the context that the already-generated tokens were produced against, so a system with no cache pays for those tokens again on every round.

The engineering article states the tradeoff in one line: runtime exploration is slower than retrieving pre-computed data, and getting an agent to navigate its own information sources takes deliberate engineering of tools and heuristics {{S52.c}}. Asserted, again, rather than measured.

Adaptive-RAG puts the cost on the other side of the routing decision. A multi-step approach gives rise to unnecessary computational overhead for simple queries, while being vital for complex ones {{S51.c}}. Of the sources this chapter cites, Adaptive-RAG is the one that pairs its cost claim with a measured comparison, reported as significantly more efficient than the always-multi-step strategy {{S51.d}}, with elapsed time per query among the quantities it measures {{S51.e}}.

## Reading four results whose baselines do not line up

FLARE's overhead discussion names its comparison explicitly as single-time retrieval {{S48.j}}, and IRCoT's recall table is reported relative to one-step retrieval {{S49.d}}. Those two are the same kind of baseline: retrieve once from the question, then read.

Self-Ask's number is not. Adding the search engine to self-ask improves performance on all datasets, sometimes by as much as 10 percent absolute {{S50.e}}, and the thing it improves on is self-ask without the search engine, which answers its own follow-up questions from what the model already knows. That is much closer to a no-retrieval comparison than to retrieve-then-read. The reason lies in what the paper set out to do. It defines the compositionality gap as the fraction of questions where a model answers the individual sub-questions correctly but not the compositional question {{S50.b}}, and it reports that across the GPT-3 family, single-hop performance improves faster than multi-hop performance as models get larger, so the gap does not close; the search engine is then plugged into the sub-question slots that the prompt format creates {{S50.a}}. A paper measuring a gap in parametric reasoning baselines against parametric reasoning.

Adaptive-RAG gives a third line again, since its claim is about two failure directions at once and its comparisons run against fixed strategies at both ends {{S51.a}}.

FLARE's own limitations section supplies the fourth. On ELI5, neither single-time retrieval nor FLARE produced significant gains over not retrieving at all {{S48.h}}. On Wizard of Wikipedia, the authors point at the output length, around 20 tokens on average, as the reason {{S48.g}}:

> Wizard of Wikipedia is a knowledge-intensive dialogue generation dataset where the output is relatively short (∼20 tokens on average) so retrieving multiple disparate pieces of information might not be necessary.

Note that the authors hedge their own explanation there, and that the hedge is accurate: they are giving a reason for a result, not reporting a second measurement.

So the check to run before putting two of these numbers in the same sentence has three parts, and none of them is the headline. Name what the system was compared against. Name the model and the retriever it ran on. Name the metric, retrieval or answer. IRCoT's 22.6 points is a lexical-recall gain over one-step BM25 retrieval on GPT3 {{S49.d}}{{S49.g}}, and Self-Ask's 10 percent is an answer-accuracy gain over a model reasoning from its own weights on Davinci-002 {{S50.e}}{{S50.f}}. Written out that way, the two numbers stop looking comparable, which is the correct conclusion and the one a table of headline figures hides.
