# Rubric: rate torque readings against their windows

The metrics decide whether the classifier works. This decides whether the code is worth
keeping. Weights sum to 100.

## Boundary handling (30)

Full credit names the inclusivity of both bounds and implements it once, in one
comparison, rather than special-casing the minimum and the maximum apart. A submission
that treats the window as exclusive at either end loses this outright, because it is the
one rule the chapter states and the one the held-out set is built to probe.

## The corpus is the source of truth (25)

Full credit reads `corpus/fasteners.json` and derives the windows from it. Copying the
numbers into the source is a submission that will be wrong the first time a fastener is
re-rated, and the corpus exists so that never happens.

## Unrated is a real answer (25)

Full credit separates two cases that look alike and are not: a fastener listed with no
window, and a fastener the corpus does not mention. Both return `"unrated"`, and the
code says why each one does, rather than reaching that answer by falling off the end of
a lookup.

## Readable under its own terms (20)

Full credit is a function someone can read once and trust. Names that say what they
hold, no branch that exists only to satisfy a case the author did not understand, and no
dead handling for shapes the interface rules out.
