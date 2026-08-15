#!/usr/bin/env python3
"""Runs a sweep over both corpus documents and prints the table.

    python3 run_sweep.py
    python3 run_sweep.py --sizes 32 64 128 --overlaps 0 8 16

Nothing here is scored. It is the loop you would otherwise write twice: read the
corpus, call your sweep, print the grid so you can read a decision off it.
"""

import argparse

from corpus import documents, load_corpus, queries_for
from chunking import sweep


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sizes", type=int, nargs="+", default=[32, 64, 128, 256, 512])
    parser.add_argument("--overlaps", type=int, nargs="+", default=[0, 8, 16, 32])
    args = parser.parse_args()

    corpus = load_corpus()
    for document_id, document in documents(corpus).items():
        queries = queries_for(corpus, document_id)
        print(f"\n{document['title']}  ({document['tokens']} tokens, {len(queries)} queries)")
        print(f"{'size':>6}{'overlap':>9}{'recall':>10}{'iou':>10}")
        records = sweep(document["text"], args.sizes, args.overlaps, queries)
        for record in sorted(records, key=lambda r: (r["size"], r["overlap"])):
            print(
                f"{record['size']:>6}{record['overlap']:>9}"
                f"{record['token_recall']:>10.3f}{record['token_iou']:>10.3f}"
            )


if __name__ == "__main__":
    main()
