/**
 * Proves the validator fails when it should. A checker only ever tested on
 * material that passes is a checker nobody knows the state of.
 *
 * Each case copies the fixture, breaks one thing, and asserts the report names it.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateTopic } from "../src/validate.ts";

const FIXTURE = new URL("../../contract/fixtures/tiny-topic", import.meta.url).pathname;
const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A writable copy of the fixture, named so the slug check still passes. */
function copyFixture(): string {
  const parent = mkdtempSync(join(tmpdir(), "forge-fixture-"));
  temps.push(parent);
  const dir = join(parent, "tiny-topic");
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

function errorsOf(dir: string): string[] {
  return validateTopic(dir, true).errors.map((e) => `${e.where}: ${e.message}`);
}

function patch(file: string, from: string, to: string) {
  const raw = readFileSync(file, "utf8");
  if (!raw.includes(from)) throw new Error(`patch target not found in ${file}: ${from}`);
  writeFileSync(file, raw.replace(from, to));
}

function editJson(file: string, mutate: (data: any) => void) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  mutate(data);
  writeFileSync(file, JSON.stringify(data, null, 2));
}

const matching = (errors: string[], needle: string) =>
  errors.filter((e) => e.toLowerCase().includes(needle.toLowerCase()));

describe("the fixture", () => {
  it("satisfies the contract under --strict", () => {
    const report = validateTopic(copyFixture(), true);
    expect(report.findings).toEqual([]);
  });
});

describe("citations", () => {
  it("rejects a marker that resolves to nothing", () => {
    const dir = copyFixture();
    patch(join(dir, "chapters/ch01-widget-anatomy.md"), "{{S01.a}}", "{{S09.z}}");
    expect(matching(errorsOf(dir), "resolves to nothing").length).toBeGreaterThan(0);
  });

  it("rejects a malformed marker", () => {
    const dir = copyFixture();
    patch(join(dir, "chapters/ch01-widget-anatomy.md"), "{{S01.a}}", "{{S01-a}}");
    expect(matching(errorsOf(dir), "malformed citation marker").length).toBeGreaterThan(0);
  });

  it("rejects an excerpt no chapter cites", () => {
    const dir = copyFixture();
    editJson(join(dir, "sources.json"), (data) => {
      data.sources[0].excerpts.push({
        key: "z",
        locator: "§9",
        quote: "An excerpt long enough to satisfy the length floor, cited by nothing at all.",
      });
    });
    expect(matching(errorsOf(dir), "cited by no chapter").length).toBe(1);
  });

  it("rejects a chapter whose marker density is below the floor", () => {
    const dir = copyFixture();
    const file = join(dir, "chapters/ch01-widget-anatomy.md");
    patch(file, "{{S01.a}}", "");
    patch(file, "{{S01.b}}", "");
    expect(matching(errorsOf(dir), "citation marker(s) for").length).toBe(1);
  });
});

describe("no hedging", () => {
  it("rejects a hedge in prose", () => {
    const dir = copyFixture();
    patch(
      join(dir, "chapters/ch01-widget-anatomy.md"),
      "Load travels through the spine",
      "Load may travel through the spine",
    );
    expect(matching(errorsOf(dir), 'hedge "may"').length).toBe(1);
  });

  it("allows a hedge inside a blockquote, which is someone else's wording", () => {
    const dir = copyFixture();
    patch(
      join(dir, "chapters/ch01-widget-anatomy.md"),
      "## The three parts that matter",
      "## The three parts that matter\n\n> The handbook says a shroud may be replaced.\n",
    );
    expect(matching(errorsOf(dir), "hedge")).toEqual([]);
  });

  it("allows a hedge carrying an allow-hedge reason", () => {
    const dir = copyFixture();
    patch(
      join(dir, "chapters/ch01-widget-anatomy.md"),
      "It is not. Load travels",
      "It is not. <!-- allow-hedge: reporting an open question --> Load may travel",
    );
    expect(matching(errorsOf(dir), "hedge")).toEqual([]);
  });

  it("rejects an allow-hedge comment with no reason", () => {
    const dir = copyFixture();
    patch(
      join(dir, "chapters/ch01-widget-anatomy.md"),
      "It is not. Load travels",
      "It is not. <!-- allow-hedge: --> Load may travel",
    );
    expect(matching(errorsOf(dir), "carries no reason").length).toBe(1);
  });
});

describe("ordering", () => {
  it("rejects a chapter requiring one that comes later", () => {
    const dir = copyFixture();
    patch(join(dir, "chapters/ch01-widget-anatomy.md"), "requires: []", "requires: [ch02]");
    expect(matching(errorsOf(dir), "at or after this chapter").length).toBe(1);
  });

  it("rejects a challenge exercising a concept taught after it", () => {
    const dir = copyFixture();
    editJson(join(dir, "challenges/c01-assemble-widget/challenge.json"), (data) => {
      data.afterChapter = "ch01";
    });
    const errors = errorsOf(dir);
    expect(matching(errors, "first taught in chapter position").length).toBe(1);
  });

  it("rejects frontmatter order disagreeing with topic.json", () => {
    const dir = copyFixture();
    patch(join(dir, "chapters/ch02-fastening-and-alignment.md"), "order: 2", "order: 5");
    expect(matching(errorsOf(dir), "topic.json puts").length).toBe(1);
  });
});

describe("quizzes", () => {
  it("rejects a taught concept no question covers", () => {
    const dir = copyFixture();
    editJson(join(dir, "quizzes/ch02.quiz.json"), (data) => {
      data.questions = data.questions.filter((q: any) => q.concept !== "alignment-check");
      data.questions.push({ ...data.questions[0], id: "q9" });
    });
    expect(matching(errorsOf(dir), "no question covers").length).toBe(1);
  });

  it("rejects a quiz made only of recall questions", () => {
    const dir = copyFixture();
    editJson(join(dir, "quizzes/ch01.quiz.json"), (data) => {
      for (const q of data.questions) q.kind = "recall";
    });
    expect(matching(errorsOf(dir), "every question is recall").length).toBe(1);
  });

  it("rejects a question testing a concept the chapter does not teach", () => {
    const dir = copyFixture();
    editJson(join(dir, "quizzes/ch01.quiz.json"), (data) => {
      data.questions[0].concept = "torque-spec";
    });
    expect(matching(errorsOf(dir), "does not teach").length).toBeGreaterThan(0);
  });
});

describe("hidden material", () => {
  it("rejects a brief that points at .hidden", () => {
    const dir = copyFixture();
    patch(
      join(dir, "challenges/c01-assemble-widget/brief.md"),
      "## What to build",
      "## What to build\n\nThe cases live in .hidden/eval.\n",
    );
    expect(matching(errorsOf(dir), "mentions .hidden").length).toBe(1);
  });

  it("rejects a missing reference solution", () => {
    const dir = copyFixture();
    rmSync(join(dir, "challenges/c01-assemble-widget/.hidden/solution"), { recursive: true });
    expect(matching(errorsOf(dir), "reference solution is missing or empty").length).toBe(1);
  });
});

describe("status gates", () => {
  it("rejects a verified chapter with no audit block", () => {
    const dir = copyFixture();
    patch(join(dir, "chapters/ch01-widget-anatomy.md"), "status: draft", "status: verified");
    expect(matching(errorsOf(dir), "no audit block").length).toBe(1);
  });

  it("rejects a verified topic whose chapters are not verified", () => {
    const dir = copyFixture();
    editJson(join(dir, "topic.json"), (data) => {
      data.status = "verified";
    });
    expect(matching(errorsOf(dir), "status is verified but these chapters are not").length).toBe(1);
  });

  it("rejects an audit that passes while recording unsupported claims", () => {
    const dir = copyFixture();
    patch(
      join(dir, "chapters/ch01-widget-anatomy.md"),
      "status: draft",
      [
        "status: verified",
        "audit:",
        "  faithfulness:",
        "    verdict: pass",
        "    at: 2026-08-12",
        "    claims: 10",
        "    supported: 9",
        "    unsupported: 1",
        "    contradicted: 0",
        "    unreachable: 0",
        "  critique:",
        "    verdict: pass",
        "    at: 2026-08-12",
      ].join("\n"),
    );
    expect(matching(errorsOf(dir), "while recording unsupported").length).toBe(1);
  });
});

describe("structural agreement", () => {
  it("rejects a chapter file missing from topic.json", () => {
    const dir = copyFixture();
    editJson(join(dir, "topic.json"), (data) => {
      data.chapters = ["ch01"];
    });
    const errors = errorsOf(dir);
    expect(matching(errors, "not listed in topic.json.chapters").length).toBe(1);
  });

  it("rejects a concept no chapter teaches", () => {
    const dir = copyFixture();
    editJson(join(dir, "concepts.json"), (data) => {
      data.concepts.push({ id: "orphan", label: "Orphan concept", blurb: "Taught by nobody at all." });
    });
    expect(matching(errorsOf(dir), "is taught by no chapter").length).toBe(1);
  });

  it("rejects an unknown frontmatter field", () => {
    const dir = copyFixture();
    patch(join(dir, "chapters/ch01-widget-anatomy.md"), "estimatedMinutes: 15", "estimatedMinutes: 15\nauthor: someone");
    expect(matching(errorsOf(dir), "unrecognized key").length).toBeGreaterThan(0);
  });

  it("rejects a missing role skill", () => {
    const dir = copyFixture();
    rmSync(join(dir, ".claude/skills/judge"), { recursive: true });
    expect(matching(errorsOf(dir), "judge skill is missing").length).toBe(1);
  });

  it("warns rather than errors when learner work is present", () => {
    const dir = copyFixture();
    mkdirSync(join(dir, "challenges/c01-assemble-widget/work/src"), { recursive: true });
    writeFileSync(join(dir, "challenges/c01-assemble-widget/work/src/index.ts"), "export {};\n");
    const lenient = validateTopic(dir, false);
    expect(lenient.errors).toEqual([]);
    expect(matching(lenient.warnings.map((w) => w.message), "local-only").length).toBe(1);
  });
});
