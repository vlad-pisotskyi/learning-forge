# Measure a conversion, and the ceiling above it

Chapter 13 said a layout model takes a page and returns rectangles, each carrying a
class. Chapter 14 said the number that ceiling gets judged against is not 100, it is
whatever two independent annotators agree with each other on, scored with the same
metric the model is scored with. Chapter 15 said a converter that reads a page can
still lose text off the page without anyone noticing, because nothing forces the
output to account for everything the input had.

None of those three chapters wrote the arithmetic down. This challenge does. Five
functions, no model, no network: every one of them is computed from boxes and text
you are handed, so the work here is getting the definitions exactly right rather than
getting a system to behave.

Put them at `work/conversion.py`.

```python
def box_iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float: ...
def match_boxes(predicted: list[dict], truth: list[dict], iou_threshold: float) -> list[tuple[int, int]]: ...
def mean_average_precision(predicted: list[dict], truth: list[dict], thresholds: list[float]) -> float: ...
def pairwise_agreement(annotations: list[list[dict]]) -> float: ...
def conversion_coverage(converted: str, page_text: str) -> float: ...
```

Python 3, standard library only.

## the shapes everything travels in

A box is a 4-tuple `(left, top, right, bottom)`. A box dict carries a box and a
label:

```python
{"box": (12.0, 40.0, 180.0, 96.0), "label": "Text"}
```

A predicted box dict carries a `score` as well, the confidence the box came with:

```python
{"box": (12.0, 40.0, 180.0, 96.0), "label": "Text", "score": 0.87}
```

`match_boxes` and `mean_average_precision` both take a `predicted` list and a `truth`
list in that shape. Ground-truth boxes never carry a score, since nothing produced
them with a confidence attached.

## box_iou

Intersection over union of two axis-aligned boxes. The intersection is the product of
the overlap along each axis, clamped at zero when the boxes do not overlap on that
axis at all, so two boxes that only touch along one edge score zero rather than a
division by a sliver of area. When the union is zero, meaning both boxes have no area
at all, return `0.0` rather than dividing by it.

## match_boxes

Greedily pair predicted boxes with ground-truth boxes of the same label, above an
overlap threshold. Greedily means in the order `predicted` arrives in, left to right,
with no second pass. For predicted box `i`, look at every truth box that is not
already claimed, carries the same label, and has an IoU with box `i` at or above
`iou_threshold`. Take the one with the highest IoU (met exactly counts) and mark it
claimed. If none clears the bar, box `i` gets no match and the loop moves to `i + 1`.

That has a consequence worth stating plainly: a predicted box earlier in the list can
claim a truth box that a later, better-fitting predicted box would have preferred.
There is no rebalancing pass that lets the later box take it back. Whatever produces
the `predicted` list decides the priority order by deciding what order to hand boxes
in; `match_boxes` itself does not look at score at all.

Return the matches as `(predicted_index, truth_index)` pairs, one per predicted box
that found a match, in the order the matches were found.

## mean_average_precision

The metric chapter 14 named: mean average precision, averaged over class and then
over the IoU thresholds it is given. This is what turns a pile of boxes into the one
number a layout model gets reported on, and it is also the number chapter 14 used to
turn two annotators' work into an agreement figure, which is why `pairwise_agreement`
below is built on top of this function rather than next to it.

Work per threshold, then average the thresholds:

1. The classes considered are the labels present in `truth`. A predicted box whose
   label never appears in `truth` costs nothing and earns nothing; it is simply never
   looked at.
2. Within a class, rank the predicted boxes of that label by `score`, highest first.
   Ties keep the order they arrived in.
3. Walk that ranked list. At each position, decide whether the box is a match using
   the same rule `match_boxes` uses, restricted to this class and this threshold: a
   box matches the best still-unclaimed truth box of the class that clears the
   threshold, or it does not match anything. Running precision is matches so far over
   boxes seen so far; running recall is matches so far over the total number of truth
   boxes in the class.
4. Average precision for the class is the sum, over each step where recall increased,
   of that increase multiplied by the precision at that step. A class with truth boxes
   but no predictions of that label scores `0.0`. A class that is empty of truth
   entirely does not occur, since classes come from `truth`'s own labels.

If `truth` has no boxes at all, or `thresholds` is empty, return `0.0`: there is
nothing to measure against.

An illustration, not a case you are scored on. One truth box, two predicted boxes of
the same label: the higher-scoring one is a false alarm somewhere else on the page,
the lower-scoring one lands on the truth box. Average precision counts the false
alarm first, since it is ranked first, and only credits the match once the loop
reaches the second box. Rank matters here exactly as much as overlap does.

## pairwise_agreement

Chapter 14's move: score two annotators against each other with the same function a
model gets scored with. Hold one annotation as if it were a prediction (every box at
`score` 1.0, since nobody attached a confidence to a human's rectangle, in the order
that annotator's list gave them), hold the other as truth, and run
`mean_average_precision` between them, at the ten thresholds 0.50 through 0.95 in
steps of 0.05: the range chapter 14 named. Do it in both directions and average the
two, since which annotator is called ground truth for the comparison should not
change the number.

`annotations` is a list of two or more annotators' box lists over the same page. When
it holds more than two, as a triple-annotated page does, score every pair and average
across all of them. Fewer than two annotations is not a case agreement can be
computed over; raise `ValueError`.

## conversion_coverage

Chapter 15 named the failure this measures: a converter can drop content off a page
without producing an error, because nothing about the interface forces it to account
for everything the page had. Coverage is the fraction of the page's words that also
turn up in the converted output.

A word is a run of letters and digits; case and punctuation are not part of it, so
"Fenwick," and "fenwick" are the same word and a comma is not one. Count how many
times the page uses each word. A word the page uses twice needs to appear at least
twice in the converted text to be fully covered; a word the converted text repeats far
beyond what the page needed does not earn extra credit for the words it is short on
elsewhere. Coverage is the total matched count divided by the total word count of the
page. A page with no words in it is trivially covered completely, whatever the
converted text says.

Notice what this does not catch. A converted page that keeps every one of the page's
words and adds a paragraph the page never had scores full coverage: inventing content
is a different failure from losing it, and chapter 15 named both as things a model can
do to a page it was only supposed to transcribe. This function measures one of them.

## how it is scored

| metric | bar | what it covers |
|---|---|---|
| `iou_cases_passed` | 1.0 | `box_iou` on ordinary overlaps, the boundaries, and the degenerate boxes |
| `map_cases_passed` | 0.9 or better | `match_boxes` and `mean_average_precision` together |
| `agreement_cases_passed` | 0.9 or better | `pairwise_agreement`, including three-way pages and the cases where two annotators disagree |
| `coverage_cases_passed` | 1.0 | `conversion_coverage` on ordinary text, repeats, and the empty-page edge |

`box_iou` and `conversion_coverage` have no slack: both are closed-form arithmetic
with one right answer per case, so every case is expected to pass. `match_boxes` and
`mean_average_precision` share a bar with a little room in it, since a mistake in
either shows up as the same wrong number and the two are graded as one pool.
`pairwise_agreement` gets its own bar for the same reason, one pool covering the
ordinary agreement case, the asymmetric one, and the multi-annotator average.

## what you get to start

`starter/conversion.py` is the five signatures with docstrings and no bodies. Copy it
to `work/conversion.py` and fill it in. `starter/selfcheck.py` runs a handful of
worked examples with the arithmetic written out, so you can pin each definition on a
small input before you trust it on a larger one.
