# Rubric: c01, validate a widget build order

Weights sum to 100. The Judge scores each criterion, names what a full-credit answer
contains, and states specifically what this submission left out.

## Fault coverage (40)

Full credit reports all five fault classes as distinct problems: under-window torque,
over-window torque, torque on an unrated fastener, an alignment check taken before
the fasteners reached their figure, and a missing seat inspection. Partial credit
collapses the two torque-window sides into one class, since that loses the
information about which failure mode the joint has.

## Specification as data (25)

Full credit reads fastener windows from `corpus/fasteners.json` rather than writing
the numbers into the checker. The test of this is whether a change to a rating in the
corpus changes the checker's behaviour with no edit to the code.

## Problem reporting (20)

Full credit returns problems that name the fastener, the fault class, the observed
value, and the expected window. A bare string such as `"bad torque"` is a report
someone still has to investigate, which defeats the point of the checker.

## Ordering logic (15)

Full credit treats step order as its own concern rather than checking it inline while
walking fasteners. The sequence rule, inspect then seat then torque then measure, is one
rule about the record as a whole, and it reads more clearly stated once than
rediscovered per step.
