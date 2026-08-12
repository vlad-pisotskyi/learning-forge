/** Copy this directory into work/ and build from it. */

export type Step =
  | { kind: "inspect-seat" }
  | { kind: "torque"; fastener: string; newtonMetres: number }
  | { kind: "alignment-check" };

export type Build = {
  id: string;
  steps: Step[];
};

export type FaultClass =
  | "torque-under-window"
  | "torque-over-window"
  | "torque-unrated-fastener"
  | "check-before-torque"
  | "seat-not-inspected";

export type Problem = {
  fault: FaultClass;
  fastener?: string;
  observed?: number;
  expected?: { min: number; max: number };
  detail: string;
};
