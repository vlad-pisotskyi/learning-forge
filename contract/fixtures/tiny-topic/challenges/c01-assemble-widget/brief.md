# Validate a widget build order

A build record describes a widget someone assembled: which fasteners were torqued to
what figure, whether the seat was inspected, and in what order the steps happened.
Your job is to write the checker that reads one of those records and reports
everything wrong with it.

## What to build

Implement `checkBuild` in `work/src/index.ts`:

```ts
export function checkBuild(build: Build): Problem[];
```

`Build` and `Problem` are defined in `starter/src/types.ts`. Copy the starter into
`work/` and extend it. Return an empty array when the build is sound. Return one
problem per distinct fault, so a record with two faults produces two entries.

The corpus of build records lives in `corpus/builds.json`. Fastener ratings are in
`corpus/fasteners.json`.

## What counts as a fault

Everything the two chapters established. A torque figure outside its fastener's
window is a fault, and the two sides of that window are different faults, not one. A
torque figure applied to a fastener that has no rating is a fault. An alignment check
taken before the fasteners reached their figure is a fault. A missing seat inspection
is a fault, and so is an alignment check that follows one.

## How this is graded

Two numbers, measured against a held-out set of build records you do not have:

- `detection-rate`, the share of real faults your checker reports: **0.9 or better**
- `false-positive-rate`, the share of your reports that are not faults: **0.1 or lower**

Reporting every record as broken scores well on the first number and fails the
second. That is the intended tension.

A rubric review runs after the numbers and scores what they cannot see: whether the
problems you return say enough for someone to act on, and whether the fault rules
live somewhere a change to the specification could reach.
