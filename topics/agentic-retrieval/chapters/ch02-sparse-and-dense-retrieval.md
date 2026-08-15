---
id: ch02
title: Sparse and dense retrieval, and when each one wins
order: 2
requires: [ch01]
teaches: [sparse-retrieval, dense-retrieval, in-batch-negatives, in-domain-versus-zero-shot, hybrid-retrieval, annotation-artefact]
quiz: quizzes/ch02.quiz.json
estimatedMinutes: 30
status: draft
---

## Ranking by the words that match

The retriever in the previous chapter was a black box that returned passages. Open it,
and the oldest working answer inside is to score a passage by the words it shares with
the query. BM25 is that idea in its standard form: a bag-of-words scoring function
computed as token matching between two high-dimensional sparse vectors whose components
carry TF-IDF weights. {{S03.d}}

Sparse is literal. The space has one dimension per token in the vocabulary, and any one
passage uses a small fraction of them, so nearly every component of its vector is zero.
{{S03.d}} A score is then a weighted count of the tokens the query and the passage both
put a nonzero value on. Because the match is on tokens, a query and a passage that use
different words for the same thing contribute nothing to each other on those words.
{{S03.d}}

This is the method new retrieval work had to beat. For open-domain question answering,
sparse vector space models such as TF-IDF and BM25 were the de facto way to select
candidate passages. {{S02.a}}

## Ranking by the vectors that match

Dense retrieval scores by similarity between learned representations instead. The DPR
paper showed that retrieval can be implemented in practice using dense representations
alone, with the embeddings learned from a small number of questions and passages by a
dual-encoder framework. {{S02.a}}

Two encoders, and they run independently: queries and documents are each mapped into the
vector space without seeing the other side. {{S03.c}} Because a passage embedding then
depends on nothing but the passage, the entire corpus can be encoded before any query
exists, and the work left at query time is to embed the query and rank passages by
closeness in that same space. {{S03.c}}

The contrast with the previous section sits in the two adjectives. A sparse vector's
components are vocabulary tokens carrying TF-IDF weights, and a query and a passage meet
only where they use the same token. {{S03.d}} A dense vector's components are learned
from question-passage pairs, and the two sides meet as whole vectors. {{S02.a}}

## How a dense retriever is trained, and on how little

An encoder is not trained to judge a passage relevant in isolation. It is trained to put
the right passage above the wrong ones, so the training procedure has to supply wrong
ones, and where those come from is a design decision with a name.

The DPR model used in the paper's main experiments was trained in the in-batch negative
setting, with a batch size of 128 and one additional BM25 negative passage per question.
{{S02.d}} The setting is named for where the negatives come from. A batch already holds
128 question-passage pairs, and for any one question in it, the passages belonging to the
other questions are used as that question's negatives, so the negatives require no
retrieval of their own. The extra negative per question is the exception, and it comes
from BM25 {{S02.d}}, which puts the lexical method inside the dense retriever's training
loop rather than only opposite it at evaluation.

The amount of supervision this needs is smaller than the setup suggests. In the paper's
ablation on training set size, a dense retriever trained on only 1,000 examples already
outperformed BM25. {{S02.e}} The authors read that as evidence that a general pretrained
language model plus a small number of question-passage pairs is enough to train a
high-quality dense retriever. {{S02.e}}

## The reversal: in-domain against zero-shot

Two primary sources report results that look like contradictions of each other.

Evaluated on a wide range of open-domain QA datasets, DPR outperforms a strong
Lucene-BM25 system, in most cases by 9% to 19% absolute in top-20 passage retrieval
accuracy. {{S02.a}} With one exception, it performs consistently better than BM25 on
every dataset in the main table, and the gap widens as k shrinks: 78.4% against 59.1% for
top-20 accuracy on Natural Questions. {{S02.b}}

BEIR evaluated 10 retrieval systems, spanning lexical, sparse, dense, late-interaction
and re-ranking architectures, on 18 public datasets from diverse tasks and domains. There
BM25 is a robust baseline, re-ranking and late-interaction models take the best average
zero-shot scores at high computational cost, and dense and sparse retrievers are cheaper
but often underperform the other approaches. {{S03.a}} BM25 remains a strong baseline for
zero-shot text retrieval. {{S03.f}} Many approaches that beat it on an in-domain
evaluation do poorly on the BEIR datasets. {{S03.h}} Dense models perform strongly on
certain datasets and significantly worse than BM25 on many others. {{S03.c}}

The condition that separates the two pictures is whether the retriever was trained on the
distribution it is being asked about. Most of the systems BEIR evaluated were trained on
MS MARCO, so their MS MARCO scores are reported apart and kept out of the zero-shot
comparison. {{S03.e}} On that in-domain dataset BM25 loses to neural approaches by 7 to
18 points; across the benchmark it outperforms many more complex approaches, and the
paper states the conclusion without qualification: in-domain performance is not a good
indicator for out-of-domain generalization. {{S03.b}} DPR itself, the only evaluated
system not trained on MS MARCO, performs the worst in generalization on the benchmark.
{{S03.g}}

Read only the first paper and you conclude dense retrieval replaced BM25. Read only the
second and you conclude dense retrieval does not work. Both readings drop the condition,
and the condition is the finding.

## One dataset where the lexical baseline wins, and why

The exception in DPR's own table teaches more than the rule does. SQuAD is the single
dataset where BM25 stays ahead. {{S02.b}}

The paper offers a conjecture for it rather than a measurement, and the conjecture points
at two properties of how the dataset was built. The annotators wrote their questions
after seeing the passage, which on the authors' account leaves a high lexical overlap
between questions and passages and gives BM25 a clear advantage. And the data was
collected from just over 500 Wikipedia articles, which they give as the reason the
distribution of training examples is extremely biased. {{S02.c}}

Neither property is a fact about question answering. Both are facts about a collection
procedure. That is what makes this an annotation artefact: a property of how the data was
produced, not of the task the data stands for, that decides which retrieval method wins
on it. A benchmark built this way measures the method's fit to the procedure alongside
its fit to the task, and the two are not separable after the fact.

The DPR authors treated it that way in their own experiments. Wanting a single retriever
that works across the board rather than one adapted per dataset, they trained a
multi-dataset encoder by combining the training data from all of their datasets except
SQuAD. {{S02.f}}

## Using both

Keeping both rankers is the direct response to the reversal. Combining DPR with BM25
improves results further in some cases, in both the single-dataset and multi-dataset
settings. {{S02.g}} The scope in that sentence is the paper's own and worth preserving:
some cases, not all of them.

The argument for keeping the lexical leg is BEIR's closing assessment, that BM25 remains
a strong baseline for zero-shot retrieval {{S03.f}}, together with the pattern that dense
models strong on certain datasets fall significantly behind it on others {{S03.c}}. The
argument for keeping the dense leg is DPR's: where in-domain training data exists the
dense retriever leads by a wide margin {{S02.b}}, and a thousand examples were enough to
pass BM25 in the paper's ablation {{S02.e}}. Cost enters on the same axis, since the
architectures with the best average zero-shot scores on BEIR carry high computational
cost while dense and sparse retrievers are the computationally efficient ones. {{S03.a}}

So the question to ask about a retrieval component is not which family is better. It is
whether you have labelled queries from the distribution your users will actually type,
and what your retriever does on the days you do not.
