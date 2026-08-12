/**
 * Reference solution.
 *
 * This file is never executed where it sits. `forge eval` stages it at `work/src/`,
 * over a copy of the starter, so the paths below are written from the learner's work
 * tree and resolve there. That mirroring is the convention the whole dry run rests on.
 */
import { readFileSync } from "node:fs";
import type { Build, Problem, Step } from "./types.ts";

type Rating = {
  id: string;
  rated: number | null;
  window: { min: number; max: number } | null;
};

/**
 * Fastener ratings are data, not code, so they are read rather than hardcoded. A new
 * fastener in the corpus needs no change here, which is the property the rubric asks
 * about when it asks whether a specification change could reach the rules.
 */
const ratings = new Map<string, Rating>(
  (
    JSON.parse(
      readFileSync(new URL("../../../../corpus/fasteners.json", import.meta.url), "utf8"),
    ) as { fasteners: Rating[] }
  ).fasteners.map((rating) => [rating.id, rating]),
);

function torqueProblems(step: Extract<Step, { kind: "torque" }>): Problem[] {
  const rating = ratings.get(step.fastener);
  if (!rating?.window) {
    return [
      {
        fault: "torque-unrated-fastener",
        fastener: step.fastener,
        observed: step.newtonMetres,
        detail: `${step.fastener} carries no torque rating, so ${step.newtonMetres} Nm cannot be checked against anything. Either the fastener is wrong for this step or the rating is missing from the specification.`,
      },
    ];
  }
  const { min, max } = rating.window;
  if (step.newtonMetres < min) {
    return [
      {
        fault: "torque-under-window",
        fastener: step.fastener,
        observed: step.newtonMetres,
        expected: { min, max },
        detail: `${step.fastener} was torqued to ${step.newtonMetres} Nm, under its ${min} to ${max} Nm window. Under-torque leaves the joint able to loosen in service.`,
      },
    ];
  }
  if (step.newtonMetres > max) {
    return [
      {
        fault: "torque-over-window",
        fastener: step.fastener,
        observed: step.newtonMetres,
        expected: { min, max },
        detail: `${step.fastener} was torqued to ${step.newtonMetres} Nm, over its ${min} to ${max} Nm window. Over-torque yields the fastener, so the joint reads tight while holding less.`,
      },
    ];
  }
  return [];
}

export function checkBuild(build: Build): Problem[] {
  const found: Problem[] = [];

  for (const [index, step] of build.steps.entries()) {
    if (step.kind === "torque") {
      found.push(...torqueProblems(step));
      continue;
    }
    if (step.kind === "alignment-check") {
      const torqueStillToCome = build.steps
        .slice(index + 1)
        .some((later) => later.kind === "torque");
      if (torqueStillToCome) {
        found.push({
          fault: "check-before-torque",
          detail:
            "An alignment check was taken while torque steps were still outstanding, so it measured a joint that had not reached its figure yet. The reading says nothing about the finished widget.",
        });
      }
    }
  }

  if (!build.steps.some((step) => step.kind === "inspect-seat")) {
    found.push({
      fault: "seat-not-inspected",
      detail:
        "The build records no seat inspection. Nothing here establishes the seat was fit to torque against, so every torque figure in this record is unverifiable rather than merely unchecked.",
    });
  }

  // One problem per distinct fault, where distinct means the class plus the fastener it
  // names. Two identical over-torques of the same bolt are one thing to fix.
  const seen = new Set<string>();
  return found.filter((problem) => {
    const key = `${problem.fault}:${problem.fastener ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
