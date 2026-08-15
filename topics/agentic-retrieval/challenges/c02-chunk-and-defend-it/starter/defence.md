# defence

Replace every placeholder below with your own text. This file is the argument.
The numbers in it have to come from your own sweep over the corpus, not from a
source and not from memory.

## the grid I ran

Which sizes, which overlaps, which documents, how many queries, and the value of
k. Paste the table.

## what I would ship, and why

One size and one overlap, with the rows of your table that argue for them. Say
which measure you optimised and what you gave up on the other one.

## where the two documents disagree

The row that wins on one document and loses on the other, with both numbers.
Then what that disagreement implies about copying a chunk size from anywhere.

## the boundary-based chunker

How your `chunk_semantic` decides where to split, what it scored next to the
fixed-size baseline at a comparable chunk size, and whether the difference is
worth what it costs to compute.

## published defaults against my measurements

Take at least two of the published chunk size recommendations from chapter 5,
run the nearest equivalent settings through your sweep, and report what they
scored here. For each one, say whether the source shipped a measurement with the
number or only a recommendation.

## what this experiment does not establish

The scope of the result. Two documents, one retrieval rule, one query set, one
metric pair.
