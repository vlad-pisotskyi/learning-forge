"""Starter shell for c06. Copy this file into work/ and fill in the five functions.

Nothing here is scored. The evaluation set imports the names below directly, so the
names, the argument order, and the return shapes the brief pins are fixed. Read the
brief for the exact contract each function is held to before you write the body.
"""


def content_digest(text):
    """Return a stable digest of a document's content.

    Two calls on the same text return the same string. Two texts that differ anywhere
    return different strings. The digest has to depend on the whole content, not on its
    length alone.
    """
    raise NotImplementedError("c06: content_digest is yours to write")


def detect_changes(previous, current):
    """Compare two corpus snapshots by digest.

    Both `previous` and `current` map a document id to {"text": str, "pages": int}.
    Return a dict with four keys: "added" and "changed" each hold a list of
    {"id": str, "pages": int} sorted by id, and "removed" and "unchanged" each hold a
    list of ids sorted the same way. A document counts as changed only when its digest
    differs between the two snapshots.
    """
    raise NotImplementedError("c06: detect_changes is yours to write")


def plan_reconversion(changes, cost_per_page, budget):
    """Choose which changed documents to re-convert inside a cost budget.

    `changes` is shaped like detect_changes's return value. Read the brief for the
    priority order candidates are considered in, the stopping rule once one does not
    fit, and the literal reason string a document that is left out is recorded with.
    """
    raise NotImplementedError("c06: plan_reconversion is yours to write")


def replay_scores(questions, corpus):
    """Score a replayed question set against one corpus snapshot.

    Each question is {"id": str, "doc_id": str, "checks": list[str]}. `corpus` maps a
    document id to {"text": str, "pages": int}. Read the brief for how a check is
    matched against the document text and what a question scores when its supporting
    document is not in this snapshot at all.
    """
    raise NotImplementedError("c06: replay_scores is yours to write")


def staleness_report(before, after):
    """Compare two replay_scores outputs and separate why each score moved.

    `before` and `after` are two dicts in the shape replay_scores returns, produced by
    scoring the same question set against two different snapshots. Read the brief for
    the five categories and the order they are decided in.
    """
    raise NotImplementedError("c06: staleness_report is yours to write")
