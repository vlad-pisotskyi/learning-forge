# starter

Copy every file in this directory into `work/`, then implement `chunking.py`.

```
work/
  chunking.py    the five functions you write
  textutil.py    the tokeniser everything agrees on
  retrieval.py   the fixed lexical ranker and TOP_K
  corpus.py      loads corpus/c02-corpus.json
  run_sweep.py   prints your sweep as a table
  defence.md     the written argument, filled in by you
```

Run it from inside `work/`.

```
python3 run_sweep.py
python3 run_sweep.py --sizes 32 64 128 --overlaps 0 8
```

`run_sweep.py` fails with `NotImplementedError` until `sweep` returns records.
Standard library only. Nothing outside it is installed where this gets scored.

Two files are shared plumbing and stay as they are. `textutil.py` defines what a
token is, and every span in the corpus labels was counted with it. `retrieval.py`
holds the ranker constant so that a difference between two rows of your sweep has
one cause. Edit either and your numbers stop matching the ones you are scored on.
