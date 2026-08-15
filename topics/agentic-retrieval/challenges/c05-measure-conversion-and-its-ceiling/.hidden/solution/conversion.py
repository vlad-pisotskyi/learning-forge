"""Reference solution for c05.

Five functions. box_iou and match_boxes are the primitives; mean_average_precision and
pairwise_agreement are built on top of them; conversion_coverage stands alone. Every
rule implemented here is the one the brief pins in words, not an alternative that
happens to produce similar numbers.
"""

from __future__ import annotations

import re
from collections import Counter

Box = tuple[float, float, float, float]


def box_iou(a: Box, b: Box) -> float:
    """Intersection over union of two boxes given as (left, top, right, bottom)."""
    l1, t1, r1, b1 = a
    l2, t2, r2, b2 = b

    ix1 = max(l1, l2)
    iy1 = max(t1, t2)
    ix2 = min(r1, r2)
    iy2 = min(b1, b2)
    iw = max(0.0, ix2 - ix1)
    ih = max(0.0, iy2 - iy1)
    inter = iw * ih

    area_a = max(0.0, r1 - l1) * max(0.0, b1 - t1)
    area_b = max(0.0, r2 - l2) * max(0.0, b2 - t2)
    union = area_a + area_b - inter

    if union <= 0.0:
        return 0.0
    return inter / union


def match_boxes(predicted: list[dict], truth: list[dict], iou_threshold: float) -> list[tuple[int, int]]:
    """Greedy pairing, in the order predicted arrives in.

    Predicted box i is offered to whichever unmatched truth box of the same label
    overlaps it most, as long as that overlap clears iou_threshold. A predicted box
    later in the list cannot take a truth box an earlier one already claimed, even
    when the later one would have fit it better. There is no second pass.
    """
    used = [False] * len(truth)
    matches: list[tuple[int, int]] = []

    for i, pred in enumerate(predicted):
        best_j = None
        best_iou = -1.0
        for j, gt in enumerate(truth):
            if used[j] or gt["label"] != pred["label"]:
                continue
            iou = box_iou(pred["box"], gt["box"])
            if iou >= iou_threshold and iou > best_iou:
                best_iou = iou
                best_j = j
        if best_j is not None:
            used[best_j] = True
            matches.append((i, best_j))

    return matches


def _average_precision(predicted_ranked: list[dict], truth: list[dict], iou_threshold: float) -> float:
    """AP for one class at one threshold, over predictions already sorted by score."""
    n_truth = len(truth)
    if n_truth == 0 or not predicted_ranked:
        return 0.0

    matches = match_boxes(predicted_ranked, truth, iou_threshold)
    matched_pred = {i for i, _ in matches}

    tp = 0
    fp = 0
    recall_prev = 0.0
    ap = 0.0
    for idx in range(len(predicted_ranked)):
        if idx in matched_pred:
            tp += 1
        else:
            fp += 1
        precision = tp / (tp + fp)
        recall = tp / n_truth
        ap += (recall - recall_prev) * precision
        recall_prev = recall
    return ap


def mean_average_precision(predicted: list[dict], truth: list[dict], thresholds: list[float]) -> float:
    """Average precision, averaged over class and then over threshold.

    Classes come from truth's labels only, so a predicted box in a class truth never
    used contributes nothing and costs nothing. Within a class, predictions are
    ranked by score, highest first, ties keeping the order they arrived in.
    """
    if not truth or not thresholds:
        return 0.0

    labels = sorted({box["label"] for box in truth})

    per_threshold = []
    for t in thresholds:
        per_class = []
        for label in labels:
            truth_l = [box for box in truth if box["label"] == label]
            pred_l = [box for box in predicted if box["label"] == label]
            pred_l = sorted(pred_l, key=lambda box: -box["score"])
            per_class.append(_average_precision(pred_l, truth_l, t))
        per_threshold.append(sum(per_class) / len(per_class))

    return sum(per_threshold) / len(per_threshold)


AGREEMENT_THRESHOLDS = [0.50 + 0.05 * i for i in range(10)]  # 0.50 .. 0.95


def _as_predicted(boxes: list[dict]) -> list[dict]:
    return [{"box": box["box"], "label": box["label"], "score": 1.0} for box in boxes]


def pairwise_agreement(annotations: list[list[dict]]) -> float:
    """mAP at 0.5 to 0.95, computed between every pair of annotators and averaged.

    Each pair is scored in both directions, one annotation held as the prediction and
    the other as ground truth, and the pair's score is the mean of the two. A page
    annotated more than twice supplies more than one pair; the result is the mean
    across all of them.
    """
    if len(annotations) < 2:
        raise ValueError("pairwise_agreement needs at least two annotation sets")

    pair_scores = []
    for i in range(len(annotations)):
        for j in range(i + 1, len(annotations)):
            forward = mean_average_precision(_as_predicted(annotations[i]), annotations[j], AGREEMENT_THRESHOLDS)
            backward = mean_average_precision(_as_predicted(annotations[j]), annotations[i], AGREEMENT_THRESHOLDS)
            pair_scores.append((forward + backward) / 2)

    return sum(pair_scores) / len(pair_scores)


_TOKEN = re.compile(r"[a-z0-9]+")


def _tokens(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


def conversion_coverage(converted: str, page_text: str) -> float:
    """Fraction of the page's word tokens that also appear in the converted output.

    Tokens are lowercase runs of letters and digits; punctuation and whitespace are
    not tokens. A word the page uses twice needs two occurrences in the converted
    text to be fully covered; extra repeats in the converted output do not
    over-credit it. A page with no tokens at all is trivially fully covered, whatever
    the converted text says. Coverage never falls because the converted text added
    words the page did not have; that is a different failure from the one this
    measures.
    """
    page_tokens = _tokens(page_text)
    if not page_tokens:
        return 1.0

    page_counts = Counter(page_tokens)
    converted_counts = Counter(_tokens(converted))
    matched = sum(min(count, converted_counts.get(tok, 0)) for tok, count in page_counts.items())
    return matched / len(page_tokens)
