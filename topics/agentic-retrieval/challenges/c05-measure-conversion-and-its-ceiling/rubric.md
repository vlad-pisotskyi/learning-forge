# Rubric

100 points. The four metrics decide whether the submission passes at all; these
criteria decide what it is worth. Code that clears every bar by accident, through a
formula that happens to agree with the brief on easy inputs and diverges on the ones
it was not tested against, does not score well here.

## box_iou, 15 points

Full credit is intersection over union computed from the overlap on each axis
independently, clamped so a non-overlapping axis contributes zero rather than a
negative width.

- The intersection width and height are each clamped at zero before being
  multiplied, so boxes that only touch along an edge score exactly `0.0` rather than
  a near-zero sliver.
- A union of zero returns `0.0` instead of raising a division error. A degenerate box
  with no width or no height does not crash the function.
- The formula reads the same for boxes with negative coordinates as for boxes near
  the origin, since nothing about intersection over union depends on where the page's
  origin sits.

## match_boxes, 20 points

Full credit is the greedy rule exactly as the brief states it: input order decides
priority, not score and not overlap size.

- A predicted box is only compared against truth boxes carrying the same label.
  Overlap on a different label, however large, is not a candidate.
- Among the candidates a predicted box has, the one with the highest IoU is chosen,
  and a truth box already claimed is removed from consideration for every predicted
  box after it.
- An earlier predicted box keeps a claim even when a later one in the list would have
  fit the same truth box better. There is no second pass that lets boxes trade.
- A threshold met exactly counts as a match. The returned pairs are indices into the
  lists as given, not copies of the boxes themselves.

## mean_average_precision, 25 points

Full credit is average precision computed per class, per threshold, then averaged
across both, using the rank order the brief pins.

- The classes scored are the labels that appear in `truth`. A predicted box in a
  class truth never had does not lower the score and does not appear in it.
- Within a class, predictions are ordered by score before anything is matched. A
  high-scoring false positive ranked ahead of a true positive costs the class exactly
  what the brief's illustration shows: the false alarm is counted before the match is.
- Average precision accumulates at the points where recall increases, weighted by the
  precision at that point, rather than a formula that looks similar but interpolates
  or samples the curve some other way.
- A class with truth boxes and no predictions of that label contributes `0.0` rather
  than being skipped. `truth` with no boxes at all, or an empty threshold list,
  returns `0.0` rather than raising.

## pairwise_agreement, 20 points

Full credit is the same scoring function used for `mean_average_precision`, run
between annotators in both directions and averaged, at the ten thresholds the brief
names.

- Every annotation in the comparison becomes a predicted list at a uniform score, in
  its own original order, rather than being re-sorted by anything.
- Both directions of a pair are computed and averaged, so which annotator is treated
  as ground truth for the purpose of the calculation does not change the reported
  number.
- Three or more annotations are handled by scoring every pair and averaging across
  all of them, not by picking one annotator as a fixed reference.
- Fewer than two annotation sets raises rather than returning a number that looks
  like a real score.

## conversion_coverage, 10 points

Full credit is a fraction built from word counts, matching the tokenisation the brief
pins.

- Tokenising lowercases and keeps runs of letters and digits, so punctuation attached
  to a word does not prevent a match and case differences do not either.
- A repeated word in the page needs matching repeats in the converted text to be
  fully covered; extra repeats in the converted text beyond what the page needed do
  not inflate the score.
- A page with no words returns `1.0` rather than dividing by zero, and an empty
  converted string against a page with words returns `0.0` rather than raising.

## Code a reviewer can follow, 10 points

Full credit is code that someone who has read the brief, and nothing else, could
verify against it.

- `mean_average_precision` and `pairwise_agreement` are written so the relationship
  between them is visible in the code, not just true by coincidence of both producing
  correct numbers.
- No duplicated matching logic that has drifted from what `match_boxes` does; the
  building blocks are reused rather than reimplemented inline.
- Names say what a value is. A box's four numbers are not read back out through bare
  indexing scattered across the file with no name attached to what index 2 means.
