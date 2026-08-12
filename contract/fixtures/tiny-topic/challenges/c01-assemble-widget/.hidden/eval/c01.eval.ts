/**
 * Held-out evaluation set. The Judge runs this; nobody else reads it.
 *
 * The records below are not in `corpus/builds.json`, which is what makes the score mean
 * something: a checker tuned to the visible corpus has to generalise to reach these.
 * Four of the records are sound, and three of those four sit exactly on a window
 * boundary, so anything that reports every record as broken fails on false positives
 * rather than passing on detection.
 *
 * Thresholds live in `challenge.json` and are compared by the CLI. This file prints the
 * two numbers and asserts only structure, so the bar exists in one place.
 */
import { describe, expect, it } from "vitest";
import { checkBuild } from "../../work/src/index.ts";
import type { Build, FaultClass, Problem } from "../../work/src/types.ts";

/** A fault is identified by its class and, where it names one, its fastener. */
type FaultKey = string;

const FAULT_CLASSES: readonly FaultClass[] = [
  "torque-under-window",
  "torque-over-window",
  "torque-unrated-fastener",
  "check-before-torque",
  "seat-not-inspected",
];

const key = (fault: string, fastener?: string): FaultKey => `${fault}:${fastener ?? ""}`;

const M6 = "flange-bolt-m6"; // window 7 to 11 Nm
const CLIP = "shroud-clip"; // no rating at all

type Case = { build: Build; faults: FaultKey[] };

const HELD_OUT: Case[] = [
  {
    // Sound, and the shape everything else deviates from.
    build: {
      id: "h01",
      steps: [
        { kind: "inspect-seat" },
        { kind: "torque", fastener: M6, newtonMetres: 9 },
        { kind: "alignment-check" },
      ],
    },
    faults: [],
  },
  {
    build: {
      id: "h02",
      steps: [
        { kind: "inspect-seat" },
        { kind: "torque", fastener: M6, newtonMetres: 5 },
        { kind: "alignment-check" },
      ],
    },
    faults: [key("torque-under-window", M6)],
  },
  {
    build: {
      id: "h03",
      steps: [
        { kind: "inspect-seat" },
        { kind: "torque", fastener: M6, newtonMetres: 14 },
        { kind: "alignment-check" },
      ],
    },
    faults: [key("torque-over-window", M6)],
  },
  {
    build: {
      id: "h04",
      steps: [
        { kind: "inspect-seat" },
        { kind: "torque", fastener: CLIP, newtonMetres: 6 },
        { kind: "alignment-check" },
      ],
    },
    faults: [key("torque-unrated-fastener", CLIP)],
  },
  {
    // The check happens first, so a torque step is still outstanding when it is taken.
    build: {
      id: "h05",
      steps: [
        { kind: "inspect-seat" },
        { kind: "alignment-check" },
        { kind: "torque", fastener: M6, newtonMetres: 9 },
      ],
    },
    faults: [key("check-before-torque")],
  },
  {
    build: {
      id: "h06",
      steps: [
        { kind: "torque", fastener: M6, newtonMetres: 9 },
        { kind: "alignment-check" },
      ],
    },
    faults: [key("seat-not-inspected")],
  },
  {
    build: {
      id: "h07",
      steps: [
        { kind: "torque", fastener: M6, newtonMetres: 12 },
        { kind: "alignment-check" },
      ],
    },
    faults: [key("seat-not-inspected"), key("torque-over-window", M6)],
  },
  {
    // Three faults at once, and they must come back as three entries.
    build: {
      id: "h08",
      steps: [
        { kind: "inspect-seat" },
        { kind: "alignment-check" },
        { kind: "torque", fastener: CLIP, newtonMetres: 4 },
        { kind: "torque", fastener: M6, newtonMetres: 6 },
      ],
    },
    faults: [
      key("check-before-torque"),
      key("torque-unrated-fastener", CLIP),
      key("torque-under-window", M6),
    ],
  },
  {
    // On the lower bound. Sound, because the window is inclusive.
    build: {
      id: "h09",
      steps: [
        { kind: "inspect-seat" },
        { kind: "torque", fastener: M6, newtonMetres: 7 },
        { kind: "alignment-check" },
      ],
    },
    faults: [],
  },
  {
    // On the upper bound. Also sound.
    build: {
      id: "h10",
      steps: [
        { kind: "inspect-seat" },
        { kind: "torque", fastener: M6, newtonMetres: 11 },
        { kind: "alignment-check" },
      ],
    },
    faults: [],
  },
  {
    build: {
      id: "h11",
      steps: [
        { kind: "alignment-check" },
        { kind: "torque", fastener: M6, newtonMetres: 14 },
      ],
    },
    faults: [
      key("seat-not-inspected"),
      key("check-before-torque"),
      key("torque-over-window", M6),
    ],
  },
  {
    // The same sound torque twice. Sound, and a checker that counts steps rather than
    // faults reports something here.
    build: {
      id: "h12",
      steps: [
        { kind: "inspect-seat" },
        { kind: "torque", fastener: M6, newtonMetres: 9 },
        { kind: "torque", fastener: M6, newtonMetres: 9 },
        { kind: "alignment-check" },
      ],
    },
    faults: [],
  },
];

function reportedKeys(problems: Problem[]): Set<FaultKey> {
  return new Set(problems.map((problem) => key(problem.fault, problem.fastener)));
}

describe("c01 held-out evaluation", () => {
  it("returns an array of well-formed problems for every record", () => {
    for (const { build } of HELD_OUT) {
      const problems = checkBuild(build);
      expect(Array.isArray(problems), `${build.id} did not return an array`).toBe(true);
      for (const problem of problems) {
        expect(FAULT_CLASSES, `${build.id} reported an unknown fault class`).toContain(
          problem.fault,
        );
        expect(typeof problem.detail, `${build.id} reported a problem with no detail`).toBe(
          "string",
        );
      }
    }
  });

  it("scores detection and false positives across the held-out records", () => {
    let expectedTotal = 0;
    let detected = 0;
    let reportedTotal = 0;
    let falsePositives = 0;

    for (const { build, faults } of HELD_OUT) {
      const expectedKeys = new Set(faults);
      const reported = reportedKeys(checkBuild(build));
      expectedTotal += expectedKeys.size;
      reportedTotal += reported.size;
      for (const found of reported) {
        if (expectedKeys.has(found)) detected += 1;
        else falsePositives += 1;
      }
    }

    const detectionRate = expectedTotal === 0 ? 1 : detected / expectedTotal;
    // No reports at all is not a clean sheet; it is a checker that found nothing, and
    // the detection rate is where that shows up.
    const falsePositiveRate = reportedTotal === 0 ? 0 : falsePositives / reportedTotal;

    console.log(`metric detection-rate ${detectionRate.toFixed(4)}`);
    console.log(`metric false-positive-rate ${falsePositiveRate.toFixed(4)}`);

    expect(expectedTotal, "the held-out set itself has no faults to find").toBeGreaterThan(0);
  });
});
