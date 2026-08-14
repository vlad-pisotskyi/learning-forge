/**
 * Guards the one class of documentation drift a test can actually see.
 *
 * Code that contradicts code fails a test. Prose that describes code goes stale in
 * silence, and this repo has around twenty-five prose files under `.claude/` steering
 * every generation run. Two commits proved the cost: the primary-source warning moved
 * from firing per secondary source to firing on a majority, the `report` kind arrived,
 * and four instruction sites kept describing what came before. One of them told the
 * research agent that a single secondary source holds a topic at `draft`, and the agent
 * acted on it.
 *
 * No test can read a paragraph and decide whether it still describes a condition. What a
 * test can do is assert that the vocabulary exists somewhere a person would look. So this
 * file checks presence, nothing cleverer, and the false-alarm rate is zero: a literal is
 * in the file or it is not. The reasoning behind the wider set of guards is in
 * `docs/plans/DRIFT-GUARDS.md`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  auditVerdict,
  challengeProgress,
  chapterProgress,
  chapterStatus,
  evalRunner,
  HEDGES,
  questionKind,
  ROLE_SKILLS,
  sourceKind,
  thresholdDirection,
  topicStatus,
} from "../src/contract.ts";
import { auditRuling, critiqueFindingKind, findingSeverity, STAGES } from "../src/forge-plan.ts";

const root = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const CONTRACT = "contract/TOPIC-CONTRACT.md";
const GLOSSARY = "docs/reference/GLOSSARY.md";

/**
 * Which enums count as contract-facing, listed by hand rather than found by reflection.
 * Every enum in the codebase is the wrong scope: internal vocabulary would trip this for
 * no gain, and what is being guarded is the words a topic and its agents speak to each
 * other. Members come from the source, so adding one fails here until it is written down.
 */
const VOCABULARY: Array<{ what: string; members: readonly string[]; where?: string[] }> = [
  { what: "topic status", members: topicStatus.options },
  { what: "chapter status", members: chapterStatus.options },
  { what: "audit verdict", members: auditVerdict.options },
  { what: "quiz question kind", members: questionKind.options },
  { what: "source kind", members: sourceKind.options },
  { what: "eval runner", members: evalRunner.options },
  { what: "threshold direction", members: thresholdDirection.options },
  { what: "chapter progress", members: chapterProgress.options },
  { what: "challenge progress", members: challengeProgress.options },
  { what: "faithfulness ruling", members: auditRuling.options },
  { what: "critique finding kind", members: critiqueFindingKind.options },
  { what: "finding severity", members: findingSeverity.options },
  { what: "role skill", members: ROLE_SKILLS },
  /**
   * Glossary only. A stage is how the generator gets to a topic, not part of what a topic
   * has to look like, and `init` has no business in a document about directory shape. The
   * narrowing is a scope judgement rather than a dodge: the vocabulary still has to be
   * written down somewhere a person will find it.
   */
  { what: "generation stage", members: STAGES, where: [GLOSSARY] },
];

/**
 * The validator's warnings, each with a phrase that has to survive in the contract prose.
 *
 * Warnings and not errors, because warnings are the drift-prone half. `--strict` promotes
 * them and `promote` runs `--strict`, so a warning decides whether a topic can reach
 * `validated`, and every one of the four stale sites was prose about a warning.
 *
 * A phrase rather than the message, because messages interpolate counts and ids. Pick the
 * part that carries the meaning: if a rule is reworded past recognition the row breaks,
 * which is the moment to check whether the contract still describes it. Adding a warning
 * without adding a row leaves the count assertion below failing.
 */
const WARNINGS: Array<{ warning: string; phrase: string }> = [
  { warning: "em or en dashes in prose", phrase: "em or en dash" },
  { warning: "curly quotation marks in prose", phrase: "curly quotation mark" },
  { warning: "emoji in prose", phrase: "emoji" },
  { warning: "a paper or book with no identifier", phrase: "identifier" },
  { warning: "a topic built mostly on secondary sources", phrase: "not primary" },
  { warning: "a concept taught by more than one chapter", phrase: "taught by" },
  { warning: "language and runner disagree", phrase: "runner" },
  { warning: "a metric the eval spec never mentions", phrase: "metric" },
  { warning: "no starter scaffolding", phrase: "starter" },
  { warning: "learner work present in a committed tree", phrase: "gitignored" },
];

describe("the contract's vocabulary is documented", () => {
  for (const { what, members, where = [CONTRACT, GLOSSARY] } of VOCABULARY) {
    for (const member of members) {
      it(`${what} "${member}" appears in ${where.join(" and ")}`, () => {
        const missing = where.filter((file) => !read(file).includes(member));
        expect(
          missing,
          `${what} member "${member}" is not documented in ${missing.join(" or ")}. ` +
            `Adding an enum member means adding a row, or the next agent reads a list that ` +
            `does not mention it.`,
        ).toEqual([]);
      });
    }
  }
});

describe("the validator's warnings are documented", () => {
  for (const { warning, phrase } of WARNINGS) {
    it(`${warning} is described in the contract`, () => {
      expect(
        read(CONTRACT).includes(phrase),
        `no mention of "${phrase}" in ${CONTRACT}, so the warning for ${warning} is ` +
          `undocumented or has been reworded. Check which, then fix the one that is wrong.`,
      ).toBe(true);
    });
  }

  /**
   * The tripwire the table cannot be without. Presence checks say nothing about a warning
   * that was added and never listed, so count the call sites and make a new one fail here.
   * A wrong count is not a defect in itself; it is the prompt to add or remove a row.
   */
  it("has a row for every warning the validator can emit", () => {
    const validator = read("tools/src/validate.ts");
    const callSites = (validator.match(/report\.warn\(/g) ?? []).length;
    expect(
      callSites,
      `validate.ts emits ${callSites} warnings and this file lists ${WARNINGS.length}. ` +
        `Add or remove a row, and while you are there check the contract describes it.`,
    ).toBe(WARNINGS.length);
  });
});

describe("the hedge list is documented", () => {
  /**
   * Not one test per hedge. Members are ordinary English words, so a substring check on
   * "may" would pass on the word "material" and prove nothing. The list has to be quoted
   * as a list, which means checking the contract carries the whole of it.
   */
  it("the contract names every rejected hedge", () => {
    const contract = read(CONTRACT);
    const missing = HEDGES.filter((hedge) => !contract.includes(hedge));
    expect(
      missing,
      `hedges not named in ${CONTRACT}: ${missing.join(", ")}. A chapter writer told to ` +
        `avoid hedging needs the actual list, and the validator rejects on this one.`,
    ).toEqual([]);
  });
});
