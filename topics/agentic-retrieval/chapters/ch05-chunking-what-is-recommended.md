---
id: ch05
title: "Chunking: what everyone recommends, and who measured it"
order: 5
requires: [ch04]
teaches: [measured-versus-advocated, default-parameter, internal-inconsistency, corpus-dependence]
quiz: quizzes/ch05.quiz.json
estimatedMinutes: 20
status: verified
audit:
  faithfulness:
    verdict: pass
    at: 2026-08-15
    claims: 21
    supported: 21
    unsupported: 0
    overstated: 0
    contradicted: 0
    unreachable: 0
  critique:
    verdict: pass
    at: 2026-08-15
    notes: 0 blocking, 1 advisory
---

## Three widely followed recommendations, and where they came from

Microsoft's chunking guidance for Azure AI Search opens with a number. Start at 512 tokens per chunk, about 2,000 characters, with an initial overlap of 25 percent, which works out to 128 tokens repeated at every boundary. {{S13.a}}

<!-- allow-hedge: unmeasured practice, the cited recommendation carries no measurement -->
That is the figure most people mean when they say "512 with overlap", and the page states it without reporting an experiment behind it. {{S13.a}}

The LangChain RAG tutorial reaches for a different pair. It splits with `RecursiveCharacterTextSplitter`, which cuts on common separators such as newlines and keeps recursing until each piece is small enough {{S14.c}}, and it configures that splitter with a chunk size of 1000 and an overlap of 200. {{S14.b}} The class name says character, not token {{S14.c}}, so the chunk is roughly half Azure's and the overlap is 20 percent of it.

<!-- allow-hedge: unmeasured practice, the cited recommendation carries no measurement -->
The tutorial supplies no justification for either number anywhere in its text. {{S14.b}}

Pinecone's chunking article gives an ordering rather than a size: fixed-size chunking is the best path in most cases, so start there and iterate only after you have determined it insufficient. {{S15.a}} Chapter 4 covered the measured comparison between fixed-size and semantic splitting. This article reports no experiment of its own. {{S15.a}}

One reason in this set is argued rather than asserted, and it is a reason for chunking at all rather than for any particular size. The LangChain tutorial splits because its loaded documentation runs past 100,000 tokens, which is too large for many models' context windows, because models struggle to find information in very long inputs, and because spending the context window on bulk content is not token efficient. {{S14.a}} Those are testable statements, and chapters 6 and 7 test them.

## Telling a measurement from a recommendation in a source

Start with the verb. Microsoft recommends starting with 512 and 25 percent {{S13.a}} and recommends starting with a set of default parameters for most applications {{S13.e}}; Pinecone recommends starting with fixed-size and iterating. {{S15.a}} Every one of those is advice about where to begin, and none of them is a report of what happened when someone tried it.

A measurement has a shape you learned in chapter 3. It names a corpus, names a metric such as nDCG or recall at k, compares at least two configurations, and gives numbers with a direction. Advice has none of that, and the absence is visible in a single reading pass once you know to look for it.

Tables are where this gets slippery, because a table looks like results. The one table on Microsoft's page reports how the choice of parameters changes the total chunk count produced from a sample e-book. {{S13.d}} That is the splitter's output volume, which is arithmetic over the document. It reports nothing about whether anything was retrieved better.

## One page that recommends two different numbers

Hold the 512-token, 25-percent recommendation {{S13.a}} next to what the same page says in its table of common chunking techniques. There, fixed-size chunks are described as a fixed size large enough for semantically meaningful paragraphs, given as 200 words or 600 characters, with some overlap, given as 10 to 15 percent of the content. {{S13.c}}

Both numbers are on one page, under one publisher, about one technique. The chunk is roughly a third the size, and the overlap is 60 to 90 characters against the 500 that 25 percent of 2,000 works out to. Do not average them and do not read one as a typo for the other.

Read the disagreement as information about how the figures were arrived at. A page whose overlap figure came out of a single comparison on a single corpus has one figure to report. This page carries two and reconciles neither, which tells you the width of the band its authors are comfortable inside. Copying either number commits you to nothing that the page has committed to.

## Defaults that ship with no evidence attached

A default is the value you get for not choosing. Microsoft's character-based defaults are 2,000 characters with a 500-character overlap, which the page itself calls the standard recommendation {{S13.f}}, introduced as what to start with for most applications. {{S13.e}} LangChain's are 1000 and 200, written as literal arguments in a constructor call. {{S14.b}} The same tutorial settles the number of passages the retriever returns the same way, as `k=4` inside the similarity search call {{S14.d}}, and chapters 6 and 7 take up that particular number.

Pinecone hands over a range instead of a single value: sweep smaller chunks such as 128 or 256 tokens for finer-grained semantics, and larger ones such as 512 or 1024 for more retained context. {{S15.b}}

<!-- allow-hedge: unmeasured practice, the cited defaults are published without measurements attached -->
Copying a default is a legitimate way to get a first pipeline running, and the sources above are where the common ones come from. What it is not is evidence. Each of these three pages publishes its figures with no comparison behind them: Microsoft states the 512-token recommendation without a measurement on the page {{S13.a}}, the LangChain tutorial gives no justification for 1000 or for 200 {{S14.b}}, and Pinecone reports no experiment for preferring fixed-size {{S15.a}}. A number carries only the evidence its source shipped with it.

## Why the honest answer depends on your corpus

The advocates say this themselves, and that is worth more than the chapter asserting it. Pinecone closes by stating there is no one-size-fits-all solution to chunking. {{S15.c}}

<!-- allow-hedge: unmeasured practice, the cited recommendation carries no measurement -->
Microsoft hedges its own overlap advice rather than stating it flat: the optimal overlap might vary by content type and use case, with highly structured data possibly needing less overlap and conversational or narrative text possibly benefiting from more. {{S13.b}} It states outright that the right choice of parameters depends on how the chunks are used. {{S13.e}}

The sharpest version is the page departing from its own recommendation. In its LangChain example, Microsoft goes below the standard 2,000 characters with 500 overlap because the sample document's token counts make a smaller setting sensible, and it gives a mechanical consequence for ignoring that: an overlap set too large can end up producing no overlap at all. {{S13.f}} The parameters did not change their meaning. The document did, and the same settings behaved differently on it.

That is what corpus dependence means in practice. A chunk size is not a property of the chunker, it is a property of the pairing between the chunker and the documents you are cutting up. So the workflow the sources actually support is: take a published default as a starting point {{S15.a}}, sweep a range of sizes around it {{S15.b}}, and score each one with the measures from chapter 3 against your own queries and documents. That gives you a number chosen against your corpus, which is where these pages point when they stop giving numbers. {{S15.c}}{{S13.e}}
