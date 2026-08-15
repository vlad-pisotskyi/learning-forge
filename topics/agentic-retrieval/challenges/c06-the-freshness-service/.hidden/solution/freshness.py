"""Reference implementation for c06.

Written the way a submission earning full rubric credit would write it: the digest is a
real content hash, the reconversion walk stops rather than reaches past a candidate
that does not fit, and staleness_report decides presence before it ever compares a
score.
"""

import hashlib


def content_digest(text):
    """Hash the whole text. A same-length, different-content pair hashes differently
    because the hash is over every byte, not over the length or a sample of it."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def detect_changes(previous, current):
    previous_ids = set(previous)
    current_ids = set(current)

    added = sorted(current_ids - previous_ids)
    removed = sorted(previous_ids - current_ids)
    common = current_ids & previous_ids

    changed = []
    unchanged = []
    for doc_id in sorted(common):
        # Digest decides. A page-count edit with no text change is not a change: it is
        # exactly the "re-fetch, same digest" case chapter 16 names.
        before_digest = content_digest(previous[doc_id]["text"])
        after_digest = content_digest(current[doc_id]["text"])
        if before_digest != after_digest:
            changed.append(doc_id)
        else:
            unchanged.append(doc_id)

    return {
        "added": [{"id": doc_id, "pages": current[doc_id]["pages"]} for doc_id in added],
        "changed": [{"id": doc_id, "pages": current[doc_id]["pages"]} for doc_id in changed],
        "removed": removed,
        "unchanged": unchanged,
    }


def plan_reconversion(changes, cost_per_page, budget):
    # Added first, changed second, each in the order it already arrived in. A document
    # with no prior conversion cannot be answered from at any price; a changed document
    # still has a stale copy in the corpus, so it waits.
    candidates = list(changes.get("added", [])) + list(changes.get("changed", []))

    convert = []
    skipped = []
    spent = 0.0
    tolerance = 1e-9
    stopped = False

    for item in candidates:
        doc_id = item["id"]
        pages = item["pages"]
        cost = pages * cost_per_page

        if not stopped and spent + cost <= budget + tolerance:
            convert.append({"id": doc_id, "pages": pages, "cost": cost})
            spent += cost
        else:
            # Once one candidate does not fit, every later candidate is left out too.
            # The list is priority order; reaching past this one for something cheaper
            # further down spends the budget on what the priority order ranked lower.
            stopped = True
            skipped.append({"id": doc_id, "pages": pages, "cost": cost, "reason": "insufficient budget"})

    return {
        "convert": convert,
        "skipped": skipped,
        "spent": spent,
        "budget": budget,
        "remaining": budget - spent,
    }


def _fold(text):
    return " ".join(str(text).lower().split())


def replay_scores(questions, corpus):
    results = {}
    for question in questions:
        qid = question["id"]
        doc_id = question["doc_id"]
        checks = question.get("checks", [])

        document = corpus.get(doc_id)
        if document is None:
            results[qid] = {
                "score": 0.0,
                "doc_present": False,
                "checks_passed": 0,
                "checks_total": len(checks),
            }
            continue

        total = len(checks)
        if total == 0:
            # Nothing to fail against, and the document is here.
            results[qid] = {
                "score": 1.0,
                "doc_present": True,
                "checks_passed": 0,
                "checks_total": 0,
            }
            continue

        text_folded = _fold(document["text"])
        passed = sum(1 for check in checks if _fold(check) in text_folded)
        results[qid] = {
            "score": passed / total,
            "doc_present": True,
            "checks_passed": passed,
            "checks_total": total,
        }
    return results


def staleness_report(before, after):
    if set(before) != set(after):
        raise ValueError(
            "staleness_report: before and after have to score the same question ids"
        )

    tolerance = 1e-9
    summary = {
        "stable": 0,
        "improved": 0,
        "regressed": 0,
        "doc-appeared": 0,
        "doc-disappeared": 0,
    }
    questions = {}

    for qid, before_row in before.items():
        after_row = after[qid]
        before_present = before_row["doc_present"]
        after_present = after_row["doc_present"]
        before_score = before_row["score"]
        after_score = after_row["score"]

        # Presence is decided before score, on purpose. A document that vanished
        # explains a dropped score on its own; folding that into "regressed" erases
        # the distinction this function exists to draw.
        if before_present and not after_present:
            category = "doc-disappeared"
        elif not before_present and after_present:
            category = "doc-appeared"
        elif abs(after_score - before_score) <= tolerance:
            category = "stable"
        elif after_score > before_score:
            category = "improved"
        else:
            category = "regressed"

        summary[category] += 1
        questions[qid] = {
            "before_score": before_score,
            "after_score": after_score,
            "before_doc_present": before_present,
            "after_doc_present": after_present,
            "category": category,
        }

    return {"questions": questions, "summary": summary}
