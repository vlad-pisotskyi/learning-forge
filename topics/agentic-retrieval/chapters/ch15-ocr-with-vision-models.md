---
id: ch15
title: OCR with vision language models
order: 15
requires: [ch13]
teaches: [reading-order, linearization, vlm-ocr, document-anchoring, unit-test-reward, synthetic-training-documents, cost-per-page, teacher-model-failure]
quiz: quizzes/ch15.quiz.json
estimatedMinutes: 35
status: draft
audit:
  faithfulness:
    verdict: fail
    at: 2026-08-15
    claims: 42
    supported: 40
    unsupported: 0
    overstated: 2
    contradicted: 0
    unreachable: 0
  critique:
    verdict: pass
    at: 2026-08-15
    notes: 0 blocking, 3 advisory
---

## The order a page should be read in, which the file does not record

Ask a PDF library for the text on a page and you get glyphs with coordinates. Ask it
for the order a person would read them in and there is nothing to return, because the
file never stored one. The olmOCR paper states the gap without qualification: PDFs
lack basic structure necessary for coherent prose, such as ground truth reading order.
{{S27.q}}

What sits behind that missing field is a large amount of text.
PDF documents have the potential to provide trillions of novel, high-quality tokens
for training language models, and the obstacle is that they come in a diversity of
types with differing formats and visual layouts that make extracting and faithfully
representing the underlying content difficult. {{S27.a}} Every one of those pages was
laid out for a printer. The printer needed to know where to put ink, not which column
continues into which.

So any tool that emits text from a page has decided on an order, and the file did not
tell it what that order was. Two extractors that disagree about a two-column page with
a figure in the middle are not one right and one wrong against a recorded answer.
There is no recorded answer. {{S27.q}}

## Flattening two dimensions into one sequence

The name for producing that order is linearization: prescribing a flattening of page
content so that it follows logical reading order, which is challenging for
layout-rich documents. {{S27.r}} A page is two-dimensional. A token stream is
one-dimensional. Linearization is the mapping between them, and it is a mapping the
format does not carry. {{S27.q}}

Separating linearization from character recognition is what makes failures
diagnosable. A system can read every character on a page perfectly and still produce
unusable text, because it spliced a pull quote into the middle of a sentence or ran
two columns together line by line. Those are different defects with different fixes,
and a single quality score over the whole output hides which one you have. Note also
how the paper scopes the difficulty: it is layout-rich documents that make
linearization hard, not long ones. {{S27.r}}

## Reading the page as an image

Chapter 13's approach was a pipeline: specialised models for layout regions, tables,
and text, composed into a conversion. The other approach hands the rendered page to a
vision language model and takes text back. olmOCR is an open-source toolkit for
processing PDFs into clean, linearized plain text in natural reading order while
preserving structured content like sections, tables, lists, equations, and more.
{{S27.c}}

The model doing the reading is a fine-tuned 7B vision language model, trained on
olmOCR-mix-0225, a sample of 260,000 pages drawn from over 100,000 crawled PDFs with
diverse properties including graphics, handwritten text, and poor quality scans.
{{S27.d}} Those pages came out of a much larger pool: an internal dataset of 240
million PDFs crawled from public internet sites, plus public domain books from the
Internet Archive. {{S27.m}} The composition of that sample is the design decision
worth noticing. A model trained only on clean digital-native pages has never been
asked to read handwriting or a degraded scan, and old scans are among the content
types that remain challenging even for the best tools and VLMs. {{S27.f}} {{S27.d}}

Evaluation runs on olmOCR-Bench, a curated set of 1,400 PDFs capturing content types
that remain challenging even for the best tools and VLMs, including formulas, tables,
tiny fonts, and old scans. {{S27.f}} On that comparison, olmOCR outperforms even top
VLMs including GPT-4o, Gemini Flash 2, and Qwen-2.5-VL. {{S27.g}} A separate head to
head on human preference puts olmOCR at an ELO score over 1800, far exceeding all
other PDF linearization tools in that comparison. {{S27.p}} Read that result narrowly.
A 7B model specialised on one task beat general-purpose VLMs at that task, on a
benchmark built from content those tools find hard. {{S27.g}} {{S27.f}}

The release covers the fine-tuned VLM, training code and data, an inference pipeline
supporting vLLM and SGLang backends, and the benchmark itself. {{S27.h}}

## Feeding the model the coordinates the file already had

The mechanically interesting part is that olmOCR does not work from pixels alone. Its
technique is called document-anchoring, and the paper defines it like this:

> document-anchoring extracts coordinates of salient elements in each page (e.g., text
> blocks and images) and injects them alongside raw text extracted from the PDF binary
> file. Crucially, the anchored text is provide as input to any VLM alongside a
> rasterized image of the page. {{S27.i}}

(The typo in the second sentence is the paper's, reproduced as printed.)

The extraction is ordinary library work. Document-anchoring processes PDF pages via
the pypdf library to pull a representation of the page structure out of the underlying
PDF. {{S27.j}} If you are coming to Python from TypeScript, pypdf is the plain
file-parsing dependency you would reach for anyway; nothing about this step is
learned.

Sit with what that arrangement implies. The file already records where the text
blocks and images are and what characters they contain. {{S27.i}} A pipeline that
rasterizes the page and throws the rest away is choosing to solve a harder problem
than the one it has: recovering from pixels what it deleted a moment earlier. The
model still gets the image, because the image is where layout, ruling lines, and scan
artifacts live. It gets both. {{S27.i}}

## What the page image alone made the model do

The evidence for that design is a failure the authors report from prompting without
it. Prompting with just the page image was prone to models completing unfinished
sentences, or to inventing larger texts when the image data was ambiguous. {{S27.k}}

The mechanism generalises past OCR, so it is worth stating plainly. A vision
language model is still a language model. Where the image underdetermines the text, a
blurred word or a clipped line, the model falls back on what text usually looks like,
and emits the most plausible continuation. That is not a bug in the decoding; it is
the model doing exactly what it was trained to do, applied to a place where the right
behaviour is to copy rather than to predict. Anchored text gives it something to copy
from. {{S27.i}} {{S27.k}}

## Cost per page, and why quoting it means naming a version

Conversion cost decides whether a corpus is processable at all, so the numbers get
quoted constantly, and they are only meaningful attached to a version. Version 3 of
the olmOCR paper reports that the toolkit is optimized for large-scale batch
processing, scales flexibly across hardware setups, and can convert a million PDF
pages for only $176 USD. {{S27.e}} The same paper's comparison point is over $6,240
USD per million PDF pages for GPT-4o, alongside the observation that reliance on the
best VLMs is prohibitively costly, or infeasible where the PDFs cannot be sent to a
proprietary API at all. {{S27.b}} Stated as a ratio, olmOCR is over 32 times cheaper
than GPT-4o in batch mode. {{S27.n}}

The measured throughput behind those figures is specific: on an L40S node, 1,288 test
pages in 17 minutes and 10 seconds, an effective throughput of 906 output tokens per
second. {{S27.o}} That is the shape of number a cost claim actually rests on, and it
is tied to one accelerator, one batch configuration, and one model.

So quote the version. Both dollar figures above are read from version 3 of the paper
{{S27.e}} {{S27.b}}, and a cost sentence in a paper is revised as hardware, batching,
and the model change. A number lifted out of a paper with no version attached is a
claim you cannot check and cannot reproduce, and it will be wrong quietly rather than
loudly. The privacy constraint travels better than the price does: a corpus that
cannot leave your infrastructure rules out a hosted API regardless of what it costs.
{{S27.b}}

## Scoring an output that has no single right form

The previous chapter left you with evaluation targets that have no single correct
answer. olmOCR 2 hits the same wall in a different domain and answers it differently.
Floating document elements like tables and figures lack a definitive ground truth
representation, so unit tests let different-yet-equivalently-correct representations
of the same content score similarly, where edit distance often rewards or penalises
those cases differently. {{S28.i}}

Edit distance breaks here for a mechanical reason. Scoring against a reference string
requires committing to one serialization of a table. Another serialization that any
reader would call correct, with the header row written differently or the cells
delimited another way, is a large edit distance from the reference and gets punished
for it. The disagreement is in the format, not in the reading.

The alternative is to score a set of checkable assertions instead of a string.
olmOCR 2 is powered by olmOCR-2-7B-1025, a specialised 7B vision language model
trained with reinforcement learning from verifiable rewards, where the rewards are a
diverse set of binary unit tests. {{S28.a}} The reward function is as simple as that
description suggests: each test case passes or fails, and the reward is the fraction
of passing test cases, from 0.0 to 1.0. {{S28.f}} Two outputs that differ in format
but satisfy the same assertions collect the same reward. {{S28.i}}

The training result is a +14.2 point overall improvement on olmOCR-Bench over the
initial release six months prior. {{S28.e}} The gains concentrated where the format
ambiguity is worst: the largest improvements are in math formula conversion, table
parsing, and multi-column layouts. {{S28.c}} The authors report the same pattern from
the training side, describing RLVR combined with binary unit tests as particularly
efficient at improving extraction of equations, tables, and multi-column layouts.
{{S28.j}} Carry the scope with the number every time you cite it: olmOCR-Bench is
described by its own authors as an English-language OCR benchmark, so the result is
evidence about English pages. {{S28.c}}

## Pages generated so their ground truth is known

Unit tests as a reward create a supply problem. Somebody has to write assertions about
a page, and writing a true assertion requires already knowing what the page says.
olmOCR 2 inverts the direction: rather than labelling found pages, it builds a
pipeline for generating synthetic documents with diverse and challenging layouts,
known ground-truth HTML source code, and extracted test cases. {{S28.b}} When the
generator wrote the page, the ground truth is not an estimate.

The generation loop iteratively prompts a general vision language model to first
create, and then refine, the HTML that best represents the rasterized image of a
page. {{S28.g}} The implementation uses claude-sonnet-4-20250514 as that general VLM,
at approximately $0.12 per document page in version 1 of the olmOCR 2 paper.
{{S28.h}}

Put that next to the inference cost and the two roles separate cleanly. $0.12 per page
{{S28.h}} is 120,000 dollars per million pages, which would be absurd as a conversion
price against $176 per million {{S27.e}}, and is unremarkable as a one-time cost for
building a training set of bounded size. Data costs and serving costs are different
budgets and comparing them directly is a category error.

The model, data, and code are released under permissive open licenses. {{S28.d}} The
authors name extending the synthetic pipeline to more complicated document types and
unit tests as future work, which is also a statement about what the published version
covers. {{S28.k}}

## Errors inherited from the model that taught it

One sentence in the first olmOCR paper deserves close reading. In the section on
generating linearized plain text, the authors record that GPT-4o does not produce
sufficiently high-fidelity plain text on its own, and that on high-density pages or
complex layouts it is prone to omitting content, rewriting or completing content
unfaithfully, or captioning images when it was not instructed to. {{S27.l}}

Notice whose behaviour that sentence describes. It is an assessment of GPT-4o, made
by people using GPT-4o inside a data pipeline. {{S27.l}} It is not a measurement of
what olmOCR's own output gets wrong, and neither is anything else in this chapter.
Both failure descriptions cited here belong to a model being used to produce data:
GPT-4o in the first paper {{S27.l}}, and the general VLM prompted to write ground
truth HTML in the second {{S28.h}}. Treat the absence of a residual error rate for
olmOCR itself as a gap in what you have read, not as evidence that the rate is low.

That is the question to carry into any system built this way. A specialised model
trained on another model's output is trained toward that output, and the assertions in
olmOCR 2's reward are test cases extracted from pages whose HTML a general VLM wrote.
{{S28.b}} {{S28.g}} {{S28.h}} Ask what produced the targets, and what that producer is known to do wrong,
because the answer bounds what the student can be trusted with. The mitigation this
chapter has already described applies at exactly this point. Document-anchoring hands
any VLM the coordinates and the raw characters the file already recorded alongside the
image {{S27.i}}, and prompting on the image alone is what produced completed sentences
and invented text. {{S27.k}}
