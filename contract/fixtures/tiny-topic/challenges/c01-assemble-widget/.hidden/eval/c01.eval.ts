/**
 * Held-out evaluation set. The Judge runs this; nobody else reads it.
 * Fixture placeholder: the real spec imports the learner entrypoint and scores
 * detection-rate and false-positive-rate over labelled build records.
 */
import { describe, expect, it } from "vitest";

describe("c01 fixture eval", () => {
  it("is a placeholder so the validator has a spec file to find", () => {
    expect(true).toBe(true);
  });
});
