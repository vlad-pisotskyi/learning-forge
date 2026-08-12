---
id: ch01
title: What a widget is made of
order: 1
requires: []
teaches: [widget-anatomy]
quiz: quizzes/ch01.quiz.json
estimatedMinutes: 15
status: draft
---

## The three parts that matter

A widget has three parts worth naming before anything else: the spine, the two
flanges, and the shroud. The spine runs the length of the widget and the flanges
sit at either end of it. The shroud wraps the assembly and is the part a person
notices first, which is why it is the part beginners assume is important.

It is not. Load travels through the spine and the flanges, and the shroud carries
none of it. {{S01.a}} Everything that follows in this fixture topic depends on
holding that distinction: when a widget fails under load, the failure happened in
the spine or in a flange, and inspecting the shroud tells you nothing about it.

The practical consequence is a habit. When a widget arrives bent, look at the load
path before looking at the cosmetic damage. A dented shroud on a straight spine is
a widget that works. An undamaged shroud hiding a twisted flange is a widget that
does not, and it is the second case that gets shipped by people who inspect the
part they can see.

## The seat, and why it is a separate idea

The seat is not a part in the way the spine and the flanges are parts. It is the
machined face where two widget halves meet, and it belongs to both halves at once.
That makes it the first place where a mistake in one half becomes a problem in the
other.

A seat has one job, which is to be flat and clean. When it is not clean, every
measurement taken afterwards inherits the error, and the measurement that inherits
it most visibly is the alignment check. {{S01.b}} This is worth stating plainly
because it inverts the order most people work in: they assemble, measure, find the
halves out of square, and start adjusting the flanges. The adjustment is real work
spent on a symptom. The cause was a piece of grit on a machined face, and the
adjustment has now bent a good flange to compensate for it.

So the seat gets inspected before assembly rather than diagnosed after it. Wipe the
face, look across it against a light, and only then bring the halves together. This
costs a few seconds and removes an entire category of downstream confusion.

## What to carry into the next chapter

Two things. First, the load path is the spine and the flanges, and the shroud is
cosmetic. {{S01.a}} Second, the seat is shared between halves and errors in it
propagate forward into everything measured later. {{S01.b}}

The next chapter uses both. Torque figures are specified for flange bolts, not for
shroud fasteners, and the alignment check that verifies a joint assumes the seat
under it was clean when the joint was made.
