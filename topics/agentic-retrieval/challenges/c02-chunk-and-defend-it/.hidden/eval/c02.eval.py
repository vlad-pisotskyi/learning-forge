#!/usr/bin/env python3
"""Held-out evaluation set for c02, "Chunk a corpus and defend the choice".

Three metrics come out of this file.

  span_cases_passed  the fraction of the behaviour cases below that the
                     submission gets right, so 1.0 means all of them
  token_recall       the best mean recall the submission reaches anywhere on
                     the evaluation grid, over a document it has not seen
  token_iou          the best mean IoU it reaches anywhere on the same grid

The document and the labels live in c02-heldout.json beside this file. The
labels were generated from whole sentences of that document and checked against
them, so a relevant span is a real token range and not an assertion about one.

The evaluation set carries its own copy of the chunker, the ranker and both
metrics. Importing the submission's helpers to check the submission's answers
would only prove it agrees with itself.
"""

import json
import re
import sys
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORK = HERE.parents[1] / "work"
sys.path.insert(0, str(WORK))

METRIC_NAMES = ("span_cases_passed", "token_recall", "token_iou")

GRID_SIZES = [32, 64, 128, 256]
GRID_OVERLAPS = [0, 8, 16, 32]
TOP_K = 3

TOKEN_PATTERN = re.compile(r"\S+")
EDGES = re.compile(r"^[^0-9A-Za-z]+|[^0-9A-Za-z]+$")


# ------------------------------------------------------------------ reporting


def emit(name, value):
    print(f"metric {name} {value:.6f}")


def bail(reason, detail=()):
    """Stops on a broken interface rather than reporting a zero that reads like a
    failed algorithm."""
    print("INTERFACE ERROR")
    print(reason)
    for line in detail:
        print(f"  {line}")
    print("Nothing was measured. The entrypoint has to match the brief before any")
    print("of these numbers mean anything.")
    for name in METRIC_NAMES:
        emit(name, 0.0)
    raise SystemExit(1)


# ------------------------------------------- the evaluation set's own reference


def tokenize(text):
    return TOKEN_PATTERN.findall(text)


def normalised_tokens(text):
    return [EDGES.sub("", token).lower() for token in TOKEN_PATTERN.findall(text)]


def ref_chunk_fixed(text, size, overlap):
    total = len(tokenize(text))
    if total == 0:
        return []
    step = size - overlap
    spans = []
    start = 0
    while start < total:
        end = min(start + size, total)
        spans.append((start, end))
        if end == total:
            break
        start += step
    return spans


def positions(spans):
    covered = set()
    for start, end in spans or ():
        if end > start:
            covered.update(range(start, end))
    return covered


def ref_recall(retrieved, relevant):
    wanted = positions(relevant)
    if not wanted:
        return 0.0
    return len(positions(retrieved) & wanted) / len(wanted)


def ref_iou(retrieved, relevant):
    got = positions(retrieved)
    wanted = positions(relevant)
    union = got | wanted
    if not union:
        return 0.0
    return len(got & wanted) / len(union)


def ref_top_chunks(words, spans, terms, k=TOP_K):
    wanted = {EDGES.sub("", term).lower() for term in terms}
    wanted.discard("")
    scored = []
    for start, end in spans:
        hits = len(wanted.intersection(words[start:end]))
        if hits:
            scored.append((-hits, start, end))
    scored.sort()
    return [(start, end) for _, start, end in scored[:k]]


def ref_sweep(text, sizes, overlaps, queries):
    words = normalised_tokens(text)
    records = {}
    for size in sizes:
        for overlap in overlaps:
            if size <= 0 or overlap < 0 or overlap >= size:
                continue
            spans = ref_chunk_fixed(text, size, overlap)
            recalls, ious = [], []
            for query in queries:
                relevant = [tuple(span) for span in query["relevant"]]
                retrieved = ref_top_chunks(words, spans, query["terms"])
                recalls.append(ref_recall(retrieved, relevant))
                ious.append(ref_iou(retrieved, relevant))
            records[(size, overlap)] = (mean(recalls), mean(ious))
    return records


def mean(values):
    return sum(values) / len(values) if values else 0.0


# ----------------------------------------------------------------- the fixture


def load_heldout():
    data = json.loads((HERE / "c02-heldout.json").read_text(encoding="utf-8"))
    document = data["documents"][0]
    queries = [q for q in data["queries"] if q["document"] == document["id"]]
    for query in queries:
        query["relevant"] = [tuple(span) for span in query["relevant"]]
    # the labels are only worth as much as this check
    tokens = tokenize(document["text"])
    for query in queries:
        for start, end in query["relevant"]:
            assert 0 <= start < end <= len(tokens), (query["id"], start, end)
    return document, queries


# ------------------------------------------------------------- interface guard


def load_submission():
    try:
        import chunking
    except Exception:
        bail(
            "work/chunking.py did not import.",
            traceback.format_exc().strip().splitlines(),
        )

    missing = [
        name
        for name in ("chunk_fixed", "token_recall", "token_iou", "sweep")
        if not callable(getattr(chunking, name, None))
    ]
    if missing:
        bail(
            "work/chunking.py does not export a callable for: " + ", ".join(missing),
            ["the brief pins all four names and the evaluation set imports them by name"],
        )

    probe_text = "one two three four five six"
    try:
        probe = chunking.chunk_fixed(probe_text, 2, 0)
    except TypeError:
        bail(
            "chunk_fixed did not accept (text, size, overlap) as three positional arguments.",
            traceback.format_exc().strip().splitlines(),
        )
    except Exception:
        bail(
            "chunk_fixed raised on an ordinary six token document with size 2 and no overlap.",
            traceback.format_exc().strip().splitlines(),
        )

    problem = shape_problem(probe)
    if problem:
        bail(
            f"chunk_fixed returned the wrong shape: {problem}",
            [
                "expected a list of (start, end) pairs of token positions,",
                f"got {probe!r}",
            ],
        )
    return chunking


def shape_problem(value):
    if not isinstance(value, (list, tuple)):
        return f"{type(value).__name__} rather than a list"
    for item in value:
        if not isinstance(item, (list, tuple)) or len(item) != 2:
            return f"an element that is not a pair: {item!r}"
        start, end = item
        if not isinstance(start, int) or not isinstance(end, int):
            return f"a pair that is not two integers: {item!r}"
        if isinstance(start, bool) or isinstance(end, bool):
            return f"a pair of booleans: {item!r}"
    return None


# ------------------------------------------------------------------- the cases


def as_pairs(spans):
    """Accepts lists or tuples from the submission and compares on tuples."""
    return [tuple(span) for span in spans]


def build_cases(sub, document, queries):
    text_10 = "alpha bravo charlie delta echo foxtrot golf hotel india juliet"
    text_8 = "alpha bravo charlie delta echo foxtrot golf hotel"
    text_5 = "alpha bravo charlie delta echo"
    text_3 = "alpha bravo charlie"
    text_12 = text_10 + " kilo lima"
    messy = "alpha\n\nbravo\tcharlie   delta"
    long_text = " ".join(f"w{i}" for i in range(50))

    cases = []

    def add(label, fn):
        cases.append((label, fn))

    def equal(label, got, expected):
        add(label, lambda: None if got() == expected else f"expected {expected}, got {got()}")

    def close(label, got, expected, tolerance=1e-9):
        def check():
            value = got()
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                return f"expected a number, got {value!r}"
            if abs(value - expected) > tolerance:
                return f"expected {expected:.6f}, got {value:.6f}"
            return None

        add(label, check)

    def raises(label, call):
        def check():
            try:
                result = call()
            except ValueError:
                return None
            except Exception as exc:
                return f"expected ValueError, got {type(exc).__name__}: {exc}"
            return f"expected ValueError, got {result!r}"

        add(label, check)

    # -- chunk_fixed, the ordinary shape
    equal(
        "chunk_fixed: ten tokens, size 4, no overlap",
        lambda: as_pairs(sub.chunk_fixed(text_10, 4, 0)),
        [(0, 4), (4, 8), (8, 10)],
    )
    equal(
        "chunk_fixed: ten tokens, size 4, overlap 2",
        lambda: as_pairs(sub.chunk_fixed(text_10, 4, 2)),
        [(0, 4), (2, 6), (4, 8), (6, 10)],
    )
    equal(
        "chunk_fixed: document divides exactly by the size",
        lambda: as_pairs(sub.chunk_fixed(text_8, 4, 0)),
        [(0, 4), (4, 8)],
    )
    equal(
        "chunk_fixed: size larger than the document",
        lambda: as_pairs(sub.chunk_fixed(text_3, 10, 0)),
        [(0, 3)],
    )
    equal(
        "chunk_fixed: size 1",
        lambda: as_pairs(sub.chunk_fixed(text_5, 1, 0)),
        [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5)],
    )
    equal(
        "chunk_fixed: empty document",
        lambda: as_pairs(sub.chunk_fixed("", 4, 0)),
        [],
    )
    equal(
        "chunk_fixed: whitespace only document",
        lambda: as_pairs(sub.chunk_fixed("   \n\t  ", 4, 0)),
        [],
    )
    equal(
        "chunk_fixed: newlines and tabs are token separators like spaces",
        lambda: as_pairs(sub.chunk_fixed(messy, 2, 0)),
        [(0, 2), (2, 4)],
    )
    equal(
        "chunk_fixed: overlap one short of the size emits no redundant tail",
        lambda: as_pairs(sub.chunk_fixed(text_12, 5, 4)),
        [(i, i + 5) for i in range(8)],
    )

    def covers_everything():
        spans = as_pairs(sub.chunk_fixed(long_text, 7, 3))
        if not spans:
            return "returned no chunks for a fifty token document"
        if spans[-1][1] != 50:
            return f"the last chunk ends at {spans[-1][1]}, not at the end of the document"
        if positions(spans) != set(range(50)):
            return "the chunks do not cover every token position exactly once between them"
        starts = [start for start, _ in spans]
        if starts != sorted(set(starts)):
            return f"chunk starts are not strictly increasing: {starts}"
        return None

    add("chunk_fixed: size 7 overlap 3 covers the whole document", covers_everything)

    raises("chunk_fixed: overlap equal to size is rejected", lambda: sub.chunk_fixed(text_10, 4, 4))
    raises("chunk_fixed: overlap larger than size is rejected", lambda: sub.chunk_fixed(text_10, 4, 9))
    raises("chunk_fixed: negative overlap is rejected", lambda: sub.chunk_fixed(text_10, 4, -1))
    raises("chunk_fixed: size zero is rejected", lambda: sub.chunk_fixed(text_10, 0, 0))

    # -- token_recall
    close("token_recall: retrieved covers the relevant span", lambda: sub.token_recall([(0, 10)], [(0, 10)]), 1.0)
    close("token_recall: half the relevant span retrieved", lambda: sub.token_recall([(0, 5)], [(0, 10)]), 0.5)
    close(
        "token_recall: overlapping retrieved spans are not counted twice",
        lambda: sub.token_recall([(0, 6), (4, 10)], [(0, 10)]),
        1.0,
    )
    close("token_recall: nothing relevant was retrieved", lambda: sub.token_recall([(20, 30)], [(0, 10)]), 0.0)
    close(
        "token_recall: one of two relevant spans retrieved",
        lambda: sub.token_recall([(0, 10)], [(0, 10), (20, 30)]),
        0.5,
    )
    close(
        "token_recall: relevant spans that overlap each other count once",
        lambda: sub.token_recall([(0, 10)], [(0, 10), (5, 15)]),
        10 / 15,
    )
    close("token_recall: no relevant spans", lambda: sub.token_recall([(0, 10)], []), 0.0)
    close("token_recall: nothing retrieved", lambda: sub.token_recall([], [(0, 10)]), 0.0)
    close(
        "token_recall: retrieving the whole document scores one",
        lambda: sub.token_recall([(0, 1000)], [(100, 110)]),
        1.0,
    )

    # -- token_iou
    close("token_iou: retrieved equals relevant", lambda: sub.token_iou([(0, 10)], [(0, 10)]), 1.0)
    close("token_iou: twice as much retrieved as needed", lambda: sub.token_iou([(0, 20)], [(0, 10)]), 0.5)
    close(
        "token_iou: retrieving the whole document is punished",
        lambda: sub.token_iou([(0, 1000)], [(100, 110)]),
        0.01,
    )
    close(
        "token_iou: overlapping retrieved spans are not counted twice",
        lambda: sub.token_iou([(0, 6), (4, 10)], [(0, 10)]),
        1.0,
    )
    close("token_iou: disjoint spans", lambda: sub.token_iou([(20, 30)], [(0, 10)]), 0.0)
    close("token_iou: nothing on either side", lambda: sub.token_iou([], []), 0.0)
    close(
        "token_iou: partial overlap in both directions",
        lambda: sub.token_iou([(0, 10)], [(5, 20)]),
        5 / 20,
    )

    # -- sweep
    small_sizes = [4, 8]
    small_overlaps = [0, 4, 8]
    expected_pairs = {(4, 0), (8, 0), (8, 4)}

    def sweep_records(sizes, overlaps, query_set):
        records = sub.sweep(document["text"], sizes, overlaps, query_set)
        if not isinstance(records, (list, tuple)):
            raise TypeError(f"sweep returned {type(records).__name__}, not a list")
        return list(records)

    def combinations():
        records = sweep_records(small_sizes, small_overlaps, queries)
        got = sorted((record["size"], record["overlap"]) for record in records)
        if len(got) != len(set(got)):
            return f"a combination is reported more than once: {got}"
        if set(got) != expected_pairs:
            return f"expected one record per valid pair {sorted(expected_pairs)}, got {got}"
        return None

    add("sweep: skips the pairs where overlap is not smaller than size", combinations)

    def record_keys():
        records = sweep_records([64], [0, 16], queries)
        for record in records:
            for key in ("size", "overlap", "token_recall", "token_iou"):
                if key not in record:
                    return f"a record is missing the key {key!r}: {sorted(record)}"
            for key in ("token_recall", "token_iou"):
                if not isinstance(record[key], (int, float)) or isinstance(record[key], bool):
                    return f"{key} is {record[key]!r}, not a number"
        return None

    add("sweep: every record carries size, overlap, token_recall and token_iou", record_keys)

    truth = ref_sweep(document["text"], GRID_SIZES, GRID_OVERLAPS, queries)

    def grid_values(key, index):
        def check():
            records = sweep_records(GRID_SIZES, GRID_OVERLAPS, queries)
            found = {(record["size"], record["overlap"]): record for record in records}
            if set(found) != set(truth):
                return f"expected records for {sorted(truth)}, got {sorted(found)}"
            worst = None
            for pair, record in found.items():
                gap = abs(record[key] - truth[pair][index])
                if gap > 1e-9 and (worst is None or gap > worst[1]):
                    worst = (pair, gap, record[key], truth[pair][index])
            if worst:
                pair, _, got, expected = worst
                return f"at size {pair[0]} overlap {pair[1]}: expected {expected:.6f}, got {got:.6f}"
            return None

        return check

    add("sweep: mean token_recall matches at every grid point", grid_values("token_recall", 0))
    add("sweep: mean token_iou matches at every grid point", grid_values("token_iou", 1))

    def empty_queries():
        records = sweep_records([64], [0], [])
        if len(records) != 1:
            return f"expected one record, got {len(records)}"
        record = records[0]
        if abs(record["token_recall"]) > 1e-9 or abs(record["token_iou"]) > 1e-9:
            return f"expected zeros with no queries, got {record['token_recall']} and {record['token_iou']}"
        return None

    add("sweep: an empty query set scores zero rather than raising", empty_queries)

    return cases


# ---------------------------------------------------------------- the grid run


def measure_grid(sub, document, queries):
    """Best mean recall and best mean IoU the submission reaches on the grid.

    Chunking and both metrics come from the submission. Ranking comes from this
    file, so every configuration is retrieved the same way and the only thing
    moving between rows is where the boundaries fall.
    """
    words = normalised_tokens(document["text"])
    rows = []
    for size in GRID_SIZES:
        for overlap in GRID_OVERLAPS:
            if overlap >= size:
                continue
            try:
                spans = as_pairs(sub.chunk_fixed(document["text"], size, overlap))
            except Exception as exc:
                rows.append((size, overlap, 0.0, 0.0, f"chunk_fixed raised: {exc}"))
                continue
            recalls, ious, note = [], [], ""
            for query in queries:
                retrieved = ref_top_chunks(words, spans, query["terms"])
                try:
                    recalls.append(float(sub.token_recall(retrieved, query["relevant"])))
                    ious.append(float(sub.token_iou(retrieved, query["relevant"])))
                except Exception as exc:
                    note = f"metric raised on {query['id']}: {exc}"
                    recalls, ious = [0.0], [0.0]
                    break
            rows.append((size, overlap, mean(recalls), mean(ious), note))
    return rows


# ---------------------------------------------------------------------- driver


def main():
    document, queries = load_heldout()
    sub = load_submission()

    cases = build_cases(sub, document, queries)
    failures = []
    for label, check in cases:
        try:
            problem = check()
        except Exception as exc:
            problem = f"raised {type(exc).__name__}: {exc}"
        if problem:
            failures.append((label, problem))

    print(f"held-out document: {document['title']} ({document['tokens']} tokens)")
    print(f"queries: {len(queries)}")
    print()
    print(f"behaviour cases: {len(cases) - len(failures)} of {len(cases)} passed")
    for label, problem in failures:
        print(f"  FAIL {label}")
        print(f"       {problem}")
    print()

    rows = measure_grid(sub, document, queries)
    print(f"{'size':>6}{'overlap':>9}{'recall':>10}{'iou':>10}")
    for size, overlap, recall, iou, note in rows:
        line = f"{size:>6}{overlap:>9}{recall:>10.3f}{iou:>10.3f}"
        print(line + (f"   {note}" if note else ""))
    print()

    best_recall = max((row[2] for row in rows), default=0.0)
    best_iou = max((row[3] for row in rows), default=0.0)
    best_recall_at = max(rows, key=lambda row: row[2], default=None)
    best_iou_at = max(rows, key=lambda row: row[3], default=None)
    if best_recall_at:
        print(f"best recall at size {best_recall_at[0]} overlap {best_recall_at[1]}")
    if best_iou_at:
        print(f"best iou at size {best_iou_at[0]} overlap {best_iou_at[1]}")
    print()

    emit("span_cases_passed", (len(cases) - len(failures)) / len(cases))
    emit("token_recall", best_recall)
    emit("token_iou", best_iou)


if __name__ == "__main__":
    main()
