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

describe("quiz answer keys", () => {
  it("rejects a chapter whose answer key is missing", () => {
    const dir = copyFixture();
    rmSync(join(dir, "quizzes/.hidden/ch01.key.json"));
    expect(matching(errorsOf(dir), "missing required file").length).toBeGreaterThan(0);
  });

  it("rejects an answer to a question the quiz does not ask", () => {
    const dir = copyFixture();
    editJson(join(dir, "quizzes/.hidden/ch01.key.json"), (data) => {
      data.answers.push({ ...data.answers[0], id: "q9" });
    });
    expect(matching(errorsOf(dir), "which the quiz does not ask").length).toBe(1);
  });

  // Renaming rather than removing: the key's own floor of three answers catches a
  // short key on its own, so the cross-file check is what catches a drifted one.
  it("rejects a question the key does not answer", () => {
    const dir = copyFixture();
    editJson(join(dir, "quizzes/.hidden/ch01.key.json"), (data) => {
      data.answers[data.answers.length - 1].id = "q9";
    });
    expect(matching(errorsOf(dir), "no answer for question").length).toBe(1);
  });

  it("rejects a key whose chapter disagrees with its filename", () => {
    const dir = copyFixture();
    editJson(join(dir, "quizzes/.hidden/ch01.key.json"), (data) => {
      data.chapter = "ch02";
    });
    expect(matching(errorsOf(dir), "does not match the owning chapter").length).toBeGreaterThan(0);
  });

  it("rejects a key that belongs to no chapter", () => {
    const dir = copyFixture();
    cpSync(join(dir, "quizzes/.hidden/ch01.key.json"), join(dir, "quizzes/.hidden/ch09.key.json"));
    expect(matching(errorsOf(dir), "answer key belongs to no chapter").length).toBe(1);
  });

  // The split is only worth anything if the answer cannot sit in the visible file.
  it("rejects an answer left behind in the visible quiz", () => {
    const dir = copyFixture();
    editJson(join(dir, "quizzes/ch01.quiz.json"), (data) => {
      data.questions[0].answer = "The spine, the flanges, and the seat.";
      data.questions[0].accept = ["names the spine"];
    });
    const errors = errorsOf(dir);
    expect(matching(errors, "unrecognized").length + matching(errors, "answer").length).toBeGreaterThan(0);
  });

  it("rejects a visible quiz that points at its own key", () => {
    const dir = copyFixture();
    editJson(join(dir, "quizzes/ch01.quiz.json"), (data) => {
      data.questions[0].prompt = "See .hidden/ch01.key.json — what are the three parts?";
    });
    expect(matching(errorsOf(dir), "must not point at its answer key").length).toBe(1);
  });
});

describe("prose style", () => {
  const warningsOf = (dir: string) =>
    validateTopic(dir, false).warnings.map((w) => `${w.where}: ${w.message}`);

  it("warns on an em dash in chapter prose", () => {
    const dir = copyFixture();
    patch(join(dir, "chapters/ch01-widget-anatomy.md"), "A widget has three parts", "A widget — really — has three parts");
    expect(matching(warningsOf(dir), "em or en dash").length).toBe(1);
  });

  it("leaves a dash inside a quoted excerpt alone", () => {
    const dir = copyFixture();
    const file = join(dir, "chapters/ch01-widget-anatomy.md");
    writeFileSync(file, `${readFileSync(file, "utf8")}\n> a quoted passage — as the source wrote it\n`);
    expect(matching(warningsOf(dir), "em or en dash").length).toBe(0);
  });

  it("warns on curly quotation marks and on emoji", () => {
    const dir = copyFixture();
    const file = join(dir, "chapters/ch02-fastening-and-alignment.md");
    writeFileSync(file, `${readFileSync(file, "utf8")}\nThe spec says “nine newton metres” and that is that. \u{1F527}\n`);
    const warnings = warningsOf(dir);
    expect(matching(warnings, "curly quotation mark").length).toBe(1);
    expect(matching(warnings, "emoji").length).toBe(1);
  });

  it("holds the brief and the rubric to the same standard", () => {
    const dir = copyFixture();
    const challenge = "challenges/c01-assemble-widget";
    for (const name of ["brief.md", "rubric.md"]) {
      const file = join(dir, challenge, name);
      writeFileSync(file, `${readFileSync(file, "utf8")}\nOne more thing — worth stating plainly.\n`);
    }
    expect(matching(warningsOf(dir), "em or en dash").length).toBe(2);
  });

  // Warnings, so they block new material under --strict without invalidating
  // anything already written.
  it("becomes an error under strict", () => {
    const dir = copyFixture();
    patch(join(dir, "chapters/ch01-widget-anatomy.md"), "A widget has three parts", "A widget — really — has three parts");
    expect(matching(errorsOf(dir), "em or en dash").length).toBe(1);
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

  // A non-empty directory used to be the whole of the reference check, so a reference
  // that implemented nothing passed validation and only `forge eval --reference` would
  // have caught it. These five cases are what stops a placeholder reading as proof.

  it("rejects a reference that does not place the mirrored entrypoint", () => {
    const dir = copyFixture();
    const solution = join(dir, "challenges/c01-assemble-widget/.hidden/solution/src");
    rmSync(join(solution, "index.ts"));
    writeFileSync(join(solution, "elsewhere.ts"), "export function checkBuild() {\n  return [];\n}\n");
    expect(matching(errorsOf(dir), "mirroring the entrypoint").length).toBe(1);
  });

  it("rejects a reference entrypoint that is still a stub", () => {
    const dir = copyFixture();
    writeFileSync(
      join(dir, "challenges/c01-assemble-widget/.hidden/solution/src/index.ts"),
      "/* forge:stub */\nexport function checkBuild() {\n  return [];\n}\n",
    );
    expect(matching(errorsOf(dir), "reference entrypoint is still a stub").length).toBe(1);
  });

  it("rejects an evaluation set that never imports the submission", () => {
    const dir = copyFixture();
    writeFileSync(
      join(dir, "challenges/c01-assemble-widget/.hidden/eval/c01.eval.ts"),
      `import { expect, it } from "vitest";\n` +
        `it("proves nothing", () => {\n` +
        `  console.log("metric detection-rate 1");\n` +
        `  console.log("metric false-positive-rate 0");\n` +
        `  expect(true).toBe(true);\n` +
        `});\n`,
    );
    expect(matching(errorsOf(dir), "is not scoring the submission").length).toBe(1);
  });

  it("rejects an evaluation set that is still a stub", () => {
    const dir = copyFixture();
    const spec = join(dir, "challenges/c01-assemble-widget/.hidden/eval/c01.eval.ts");
    patch(spec, "/**", "/* forge:stub */\n/**");
    expect(matching(errorsOf(dir), "evaluation set is still a stub").length).toBe(1);
  });

  it("warns when the evaluation set never prints a metric the manifest declares", () => {
    const dir = copyFixture();
    const spec = join(dir, "challenges/c01-assemble-widget/.hidden/eval/c01.eval.ts");
    patch(spec, "metric false-positive-rate", "score false-positive-rate");
    const report = validateTopic(dir, false);
    expect(matching(report.warnings.map((w) => w.message), 'never prints "metric false-positive-rate').length).toBe(1);
    // And the warning is what blocks new material, because the generator runs strict.
    expect(matching(errorsOf(dir), 'never prints "metric false-positive-rate').length).toBe(1);
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
        "    overstated: 0",
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
