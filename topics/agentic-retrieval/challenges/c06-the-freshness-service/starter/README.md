# starter

Copy every file in this directory into `work/`, then implement `freshness.py`.

```
work/
  freshness.py    the five functions you write
  dev_check.py    runs your service over corpus/c06-snapshots.json and prints it
```

Run it from inside `work/`.

```
python3 dev_check.py
```

`dev_check.py` fails with `NotImplementedError` until every function has a body.
Standard library only. Nothing outside it is installed where this gets scored.

The snapshot it reads has four documents before and four after: one edited, one
removed, one added, and two left untouched. It is small enough to trace by hand,
which is the point. What you are scored against is a different pair of snapshots
with its own questions, so tuning your reasoning to this one snapshot tunes it to
the wrong thing.
