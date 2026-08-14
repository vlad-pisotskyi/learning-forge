# Rate torque readings against their windows

A torque reading on its own says nothing. The same 6 newton metres is a loose bolt on
one fastener, a correct one on another, and meaningless on a third that carries no
rating at all. Chapter two gave you the rule. This challenge asks you to apply it to
readings you have not seen.

Write `classify` in `work/checker.py`. It takes one reading and returns one of four
strings.

```python
classify({"fastener": "flange-bolt-m6", "newtonMetres": 9})  # "in-window"
```

| return value | when |
|---|---|
| `"in-window"` | the reading falls inside the fastener's window, bounds included |
| `"under"` | the reading is below the window |
| `"over"` | the reading is above the window |
| `"unrated"` | the fastener carries no window, or is not in the corpus at all |

The windows live in `corpus/fasteners.json`, four fasteners with a window on two of
them. Read them from that file rather than copying the numbers into your code. A
fastener the corpus does not list is unrated, which is a different answer from a
fastener that is listed and rated.

Both bounds are inclusive. A reading exactly on the minimum is in the window, and so is
one exactly on the maximum. That is the single detail this challenge is built around,
so get it right before you worry about anything else.

## How it is scored

Your classifier runs against a held-out set of readings that are not in the corpus.

| metric | bar |
|---|---|
| `classification-accuracy` | 0.9 or better |
| `in-window-miss-rate` | 0.1 or less |

Two numbers rather than one, because either alone is easy to satisfy while being
useless. A classifier that answers `"over"` every time scores nothing on accuracy. A
classifier that answers `"in-window"` every time has a perfect miss rate and fails
accuracy. You have to be right about both the readings that pass and the readings that
do not.

## Language

Python 3, standard library only. Nothing to install.
