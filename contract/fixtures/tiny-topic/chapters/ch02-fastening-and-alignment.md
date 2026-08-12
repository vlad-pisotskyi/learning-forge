---
id: ch02
title: Fastening a widget and proving it is square
order: 2
requires: [ch01]
teaches: [torque-spec, alignment-check]
quiz: quizzes/ch02.quiz.json
estimatedMinutes: 20
status: draft
---

## Torque is a window, not a target

An M6 flange bolt on a widget is rated to nine newton metres. That single number
hides the shape of the rule, which is a window with a failure on each side: under
seven newton metres the joint works loose under vibration, and over eleven newton
metres the thread in the flange strips. {{S02.a}} Nine is the middle of the window,
not a boundary.

That shape explains why "tighten it firmly" is not an instruction. Firmly, by hand,
on a short wrench, lands somewhere in a range that straddles both failure modes
depending on the person holding the wrench. The two failures also present
differently in time. An undertightened joint passes inspection and fails in the
field after enough hours of vibration. An overtightened joint fails immediately and
visibly, in the shop, where it is cheap.

Given the choice between the two errors, the immediate one is the better error to
make, and that asymmetry is why a torque wrench that clicks is worth more than
experience in a person's hands. The wrench converts a judgement call into a
measurement.

The number belongs to the flange bolt specifically. Shroud fasteners have no torque
figure in the specification at all, which follows directly from the shroud carrying
no load. {{S01.a}} Applying a flange figure to a shroud fastener is the most common
way a beginner cracks a shroud.

## The alignment check

The alignment check is the measurement that proves two halves seated square. It is
taken across the joint after the flange bolts reach their torque figure, and it is
the last step, not a step in the middle.

Order matters here for a reason established in the previous chapter. The check
inherits any error present in the seat, so a check taken on a dirty seat reports
misalignment that has nothing to do with alignment. {{S01.b}} Reading that number as
a flange problem sends a person adjusting good parts.

So the sequence is fixed: inspect the seat, bring the halves together, torque the
flange bolts into the window, then measure. A failed check at the end of that
sequence is real information, because every earlier source of error was removed
before the measurement was taken.

## What this gives you

A widget assembled in that order carries a claim that survives scrutiny. The joint
sits inside the torque window {{S02.a}}, the seat was clean before the halves met
{{S01.b}}, and the check at the end measured alignment rather than dirt. Each step
exists to make the final measurement mean something, which is the whole argument for
following the sequence rather than the parts of it that feel productive.
