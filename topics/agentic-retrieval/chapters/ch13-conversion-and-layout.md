---
id: ch13
title: "Before retrieval: document conversion and layout analysis"
order: 13
requires: [ch01]
teaches: [document-conversion, document-layout-analysis, layout-label-set, layout-domain-shift, pipeline-composition]
quiz: quizzes/ch13.quiz.json
estimatedMinutes: 30
status: draft
audit:
  faithfulness:
    verdict: fail
    at: 2026-08-15
    claims: 33
    supported: 32
    unsupported: 0
    overstated: 0
    contradicted: 0
    unreachable: 1
  critique:
    verdict: pass
    at: 2026-08-15
    notes: 0 blocking, 2 advisory
---

## A format built for printing, read back for machines

Every chapter so far has started from a corpus of text and none has asked where the text
came from. When the documents are PDFs, getting there is a problem of its own. A PDF is a
set of instructions for placing marks on a page, and converting those documents back into a
machine-processable format has been a major challenge for decades: the formats vary
hugely, standardization is weak, and the printing-optimized character of the format
discards most structural features and metadata. {{S25.b}} The heading that produced a
larger glyph run, the fact that two blocks are columns rather than paragraphs, the link
between a caption and the picture it describes: none of that has to survive into the file,
because none of it is needed to print the page.

Despite substantial improvements from machine learning and deep neural networks, document
conversion remains a challenging problem, which the DocLayNet authors support by pointing
at the numerous public competitions held on the topic. {{S23.e}}

The same authors state the core of it precisely. Understanding the structure of a single
document page means deciding which segments of text should be grouped together in a unit.
{{S23.f}} Not which characters are on the page, which the file usually tells you outright.
Which of them belong to the same thing.

## Which regions of a page are which, and which belong together

Recognizing the layout of unstructured digital documents is a step in parsing them into a
structured machine-readable format for downstream applications. {{S26.a}} Retrieval is one
of those applications, and it inherits whatever the parse produced: a chunker splitting on
paragraph boundaries needs something to have decided where a paragraph was.

Layout analysis is stated by the DocLayNet authors as a requirement for high-quality PDF
document conversion. {{S23.b}} Read that as it is written. It is a requirement, and that
claim says nothing about which stage of a conversion pipeline limits the quality of the
result.

The task has a concrete output shape. For each PDF page, DocLayNet's annotations give
labelled bounding boxes with a choice of eleven distinct classes. {{S23.a}} So a layout
model takes a rendered page and returns rectangles, each carrying a class. The grouping
question from the previous section is then answered geometrically: text that falls inside
one box is one unit, and text in the next box is a different unit, whatever the reading
order of the underlying character stream happened to be.

## The label set a dataset commits to, and what that decides

A model predicts the classes its training data defines and no others, so the label set is
a decision about the ceiling. The three well-known datasets did not choose the same one.
DocLayNet defines eleven class labels; PubLayNet provides five; DocBank provides thirteen,
and thirteen is not a superset of the eleven. {{S23.i}} A larger count is not a strictly
richer vocabulary.

DocLayNet's eleven came from identifying recurrent layout elements, and they are Caption,
Footnote, Formula, List-item, Page-footer, Page-header, Picture, Section-header, Table,
Text, and Title. {{S23.w}} The authors name four factors behind the choice: how often the
label occurs, how specific it is, whether it is recognisable on a single page with no
context from the previous or next page, and how much of the page the set covers overall.
{{S23.x}}

The third factor rules things out, and the exclusion is more instructive than the
inclusions. Labels such as Author and Affiliation, which DocBank carries, are often only
distinguishable by discriminating on the textual content of an element, which goes beyond
visual layout recognition, particularly outside the Scientific Articles category. {{S23.y}}
An author line and an affiliation line can sit in the same position, in the same font, at
the same size. Nothing about the rectangle separates them. That is a boundary of visual
layout analysis as a task, not a gap in any particular model, and it is why a conversion
pipeline that needs those distinctions has to get them from somewhere other than the
layout stage.

## Two corpora built from uniformly typeset documents

PubLayNet was built by automatically matching the XML representations against the content
of over one million PDF articles publicly available on PubMed Central. {{S26.b}} The
annotation is free per page, because the XML already records what each element is; the
matching step only has to find where on the page that element landed. That produced over
360 thousand document images with typical layout elements annotated, a size comparable to
established computer vision datasets. {{S26.c}}

The method decides the corpus. Only documents that exist as both a structured XML and a
rendered PDF qualify, and on PubMed Central those are scientific articles. DocBank is the
other dataset the DocLayNet authors compare their label set against, with its thirteen
labels. {{S23.i}} The DocLayNet authors name the consequence both corpora share: those
scientific documents present a limited variability in their layouts, because they are
typeset in uniform templates provided by the publishers. {{S23.g}} A journal's template is applied to every paper it prints, so a
hundred thousand pages of it contain far fewer distinct layouts than the page count
suggests.

## Why a model trained on them fails on a brochure

The DocLayNet authors state the effect directly: layout predictions from models trained on
PubLayNet or DocBank are very reasonable when applied on scientific documents, while for
more artistic or free-style layouts they see sub-par prediction quality from these models.
{{S23.h}} The training distribution is the explanation. A model that has only seen two
columns of body text under a template has no evidence about a page whose text wraps around
an image.

DocLayNet's response was to build the corpus the other way. Its pages group into six
categories: Financial Reports, Manuals, Scientific Articles, Laws and Regulations, Patents,
and Government Tenders. {{S23.k}} The two largest, Financial Reports and Manuals, contain a
large amount of free-style layouts, chosen that way to obtain maximum variability.
{{S23.l}} The dataset holds 80863 manually annotated pages from diverse data sources, each
annotated as labelled bounding boxes over the eleven classes. {{S23.a}} Manual annotation
is what buys the diversity, since no XML twin exists for a financial report the way it does
for a PubMed article.

Apply the same reasoning to DocLayNet and it has a narrow axis of its own. Close to 95
percent of its documents are published in English, with smaller shares in German at 2.5
percent, French at 1.0 percent, and Japanese at 1.0 percent. {{S23.m}} Variability was
pursued along layout and not along language.

Which pages went in was also a decision rather than a sample. The balance between document
categories was achieved by selective subsampling of pages with certain desired properties.
{{S23.t}} The authors made sure to include the title page of each document and biased the
remaining selection towards pages with figures or tables. {{S23.u}} That bias was
implemented with pre-trained object detection models from PubLayNet, which estimated how
many figures and tables a given page contained. {{S23.v}} The narrow corpus was used as an
instrument to help build the broad one. A page count from this dataset is therefore not a
count of what an average page looks like in those six categories, and any per-class
frequency read off it carries the sampling policy inside it.

One more construction detail is worth as much as the rest of the chapter. The train, test,
and validation subsets are split only on full-document boundaries, which avoids pages of
the same document being spread across the three sets, since that can give an undesired
evaluation advantage to models and lead to overestimation of their prediction accuracy.
{{S23.s}} Pages from one document share a template. Split at the page level, and a model
that memorised the template of a document in training gets tested on more pages of that
same template, and the score reports memorisation as generalisation. This is the lesson
from earlier chapters about distrusting a number whose setup you cannot see, arriving from
the dataset side rather than from the evaluation side.

## A working pipeline as an assembly of specialists

Docling is a conversion system built from separate models rather than one end-to-end
network. It is powered by specialized AI models for layout analysis and table structure
recognition, and it runs efficiently on commodity hardware in a small resource budget.
{{S25.a}} Table structure recognition being a distinct model from layout analysis is
visible in the label set: layout analysis returns a rectangle carrying the class Table
{{S23.w}}, and what that rectangle contains is the second model's problem rather than the
first model's.

The layout model's architecture is derived from RT-DETR and re-trained on DocLayNet,
alongside other proprietary datasets. {{S25.c}} That closes the loop this chapter has been
walking. The label set, the six categories, the sampling policy, and the document-boundary
split are not properties of a benchmark that a system consults later. They are the training
data of the layout stage in a shipped converter, and they set what that converter can
report about a page before any chunker or retriever sees a single token.
