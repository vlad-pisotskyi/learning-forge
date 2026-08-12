/**
 * Proves the guardrails deny what they claim to deny.
 *
 * Two promises in this repo are mechanical rather than worded: no role that talks to the
 * learner reads a topic's hidden material, and no agent writes their challenge code. A
 * hook that quietly allowed either would still look like it worked, so every rule here
 * is tested from both sides, the call that must be blocked and the neighbouring call
 * that must not be.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { decide, HIDDEN_READERS, HIDDEN_WRITERS, type GuardInput } from "../src/guard.ts";

const ROOT = "/repo";

type Call = {
  tool: string;
  input?: Record<string, unknown>;
  agent?: string;
  cwd?: string;
};

function ask({ tool, input = {}, agent, cwd = ROOT }: Call): string | undefined {
  const payload: GuardInput = { tool_name: tool, tool_input: input, cwd };
  if (agent !== undefined) payload.agent_type = agent;
  const decision = decide(payload, ROOT);
  return decision.deny ? decision.reason : undefined;
}

function read(path: string, agent?: string): string | undefined {
  return ask({ tool: "Read", input: { file_path: path }, ...(agent ? { agent } : {}) });
}

function write(path: string, agent?: string): string | undefined {
  return ask({
    tool: "Write",
    input: { file_path: path, content: "x" },
    ...(agent ? { agent } : {}),
  });
}

const EVAL_SET = "topics/wiki/challenges/c02-bm25/.hidden/eval/c02.eval.ts";
const SOLUTION = "topics/wiki/challenges/c02-bm25/.hidden/solution/src/index.ts";
const QUIZ_KEY = "topics/wiki/quizzes/.hidden/ch03.key.json";
const LEARNER_FILE = "topics/wiki/challenges/c02-bm25/work/src/index.ts";

describe("reading hidden material", () => {
  it("denies the main conversation, where the Teacher runs", () => {
    expect(read(EVAL_SET)).toMatch(/hidden material/);
    expect(read(QUIZ_KEY)).toMatch(/hidden material/);
    expect(read(SOLUTION)).toMatch(/hidden material/);
  });

  it("denies the Helper, which has Read and no exemption", () => {
    expect(read(EVAL_SET, "topic-helper")).toBeDefined();
  });

  it("allows every role that reads hidden material by design", () => {
    for (const agent of HIDDEN_READERS) {
      expect(read(EVAL_SET, agent), agent).toBeUndefined();
      expect(read(QUIZ_KEY, agent), agent).toBeUndefined();
    }
  });

  it("resolves absolute paths and paths relative to a subdirectory alike", () => {
    expect(read(`${ROOT}/${EVAL_SET}`)).toBeDefined();
    expect(
      ask({ tool: "Read", input: { file_path: "../c02-bm25/.hidden/eval/x.ts" }, cwd: `${ROOT}/topics/wiki/challenges/c03-x` }),
    ).toBeDefined();
  });

  it("leaves everything a learner may read alone", () => {
    expect(read("topics/wiki/chapters/ch03-scoring.md")).toBeUndefined();
    expect(read("topics/wiki/challenges/c02-bm25/brief.md")).toBeUndefined();
    expect(read("topics/wiki/challenges/c02-bm25/rubric.md")).toBeUndefined();
    expect(read("topics/wiki/quizzes/ch03.quiz.json")).toBeUndefined();
    expect(read(LEARNER_FILE)).toBeUndefined();
  });

  it("leaves hidden paths outside topics/ alone, so the fixture stays workable", () => {
    expect(read("contract/fixtures/tiny-topic/quizzes/.hidden/ch01.key.json")).toBeUndefined();
    expect(read("/somewhere/else/.hidden/thing.ts")).toBeUndefined();
  });
});

describe("writing hidden material", () => {
  it("allows only the agents that author it", () => {
    for (const agent of HIDDEN_WRITERS) expect(write(QUIZ_KEY, agent), agent).toBeUndefined();
  });

  it("denies a grader, which may read the evaluation set but never edit it", () => {
    expect(write(EVAL_SET, "topic-judge")).toMatch(/author a challenge/);
    expect(write(QUIZ_KEY, "topic-quiz-grader")).toBeDefined();
  });

  it("denies the main conversation", () => {
    expect(write(SOLUTION)).toBeDefined();
  });
});

describe("writing the learner's challenge code", () => {
  it("denies every role, with no exemption at all", () => {
    for (const agent of [undefined, "topic-judge", "topic-helper", ...HIDDEN_WRITERS]) {
      expect(write(LEARNER_FILE, agent), agent ?? "main").toMatch(/never solves/);
    }
  });

  it("covers each writing tool", () => {
    expect(ask({ tool: "Edit", input: { file_path: LEARNER_FILE } })).toBeDefined();
    expect(ask({ tool: "MultiEdit", input: { file_path: LEARNER_FILE } })).toBeDefined();
    expect(ask({ tool: "NotebookEdit", input: { notebook_path: LEARNER_FILE } })).toBeDefined();
  });

  it("allows reading it, since the Judge and the Helper both must", () => {
    expect(read(LEARNER_FILE, "topic-judge")).toBeUndefined();
    expect(read(LEARNER_FILE, "topic-helper")).toBeUndefined();
  });

  it("leaves the committed starter and the staged dry run alone", () => {
    expect(write("topics/wiki/challenges/c02-bm25/starter/src/index.ts")).toBeUndefined();
    expect(write(".forge-cache/wiki/try/c02/work/src/index.ts")).toBeUndefined();
  });
});

describe("searching", () => {
  it("denies a grep rooted anywhere hidden material lies beneath", () => {
    for (const path of [
      "topics",
      "topics/wiki",
      "topics/wiki/quizzes",
      "topics/wiki/challenges",
      "topics/wiki/challenges/c02-bm25",
    ]) {
      expect(ask({ tool: "Grep", input: { pattern: "expected", path } }), path).toMatch(
        /rooted here/,
      );
    }
  });

  it("allows a grep that cannot reach hidden material", () => {
    expect(ask({ tool: "Grep", input: { pattern: "idf", path: "topics/wiki/chapters" } })).toBeUndefined();
    expect(
      ask({ tool: "Grep", input: { pattern: "idf", path: "topics/wiki/challenges/c02-bm25/work" } }),
    ).toBeUndefined();
  });

  it("allows a grep at the project root, which the Forge's own development needs", () => {
    expect(ask({ tool: "Grep", input: { pattern: "contractVersion" } })).toBeUndefined();
    expect(ask({ tool: "Grep", input: { pattern: "contractVersion", path: "." } })).toBeUndefined();
  });

  it("denies any search that names hidden material outright", () => {
    expect(ask({ tool: "Glob", input: { pattern: "topics/**/.hidden/**" } })).toBeDefined();
    expect(ask({ tool: "Grep", input: { pattern: "x", glob: "**/.hidden/*.ts" } })).toBeDefined();
  });

  it("tells a glob what it actually did, rather than accusing it of a read", () => {
    // A pattern match has read nothing. Reusing the read wording here teaches an agent
    // that it leaked an answer key when it matched a path.
    const named = ask({ tool: "Glob", input: { pattern: "topics/**/.hidden/**" } });
    expect(named).toMatch(/enumerates/);
    expect(named).not.toMatch(/leak it into the conversation/);
  });

  it("allows a glob over a challenge, which returns paths and not contents", () => {
    expect(
      ask({ tool: "Glob", input: { pattern: "**/*.ts", path: "topics/wiki/challenges/c02-bm25" } }),
    ).toBeUndefined();
  });

  it("exempts the graders from all of it", () => {
    expect(ask({ tool: "Grep", input: { pattern: "expected", path: "topics/wiki" }, agent: "topic-judge" })).toBeUndefined();
    expect(ask({ tool: "Glob", input: { pattern: "**/.hidden/**" }, agent: "topic-quiz-grader" })).toBeUndefined();
  });
});

describe("the shell", () => {
  it("denies a command that names a hidden path inside a topic", () => {
    expect(ask({ tool: "Bash", input: { command: "cat topics/wiki/quizzes/.hidden/ch03.key.json" } })).toBeDefined();
    expect(ask({ tool: "Bash", input: { command: "ls topics/*/challenges/*/.hidden" } })).toBeDefined();
  });

  it("leaves the Forge's own commands alone", () => {
    for (const command of [
      "npm run validate -- topics/wiki",
      "npm run forge -- eval wiki c02 --reference",
      "npm test",
      "grep -rn '.hidden' contract/TOPIC-CONTRACT.md",
    ]) {
      expect(ask({ tool: "Bash", input: { command } }), command).toBeUndefined();
    }
  });

  it("exempts the Judge, which runs the evaluation set", () => {
    expect(
      ask({ tool: "Bash", input: { command: "npx vitest run topics/wiki/challenges/c02-bm25/.hidden/eval" }, agent: "topic-judge" }),
    ).toBeUndefined();
  });
});

describe("the hook Claude Code actually runs", () => {
  const script = new URL("../src/hook-guard.ts", import.meta.url).pathname;
  const run = (payload: unknown): string =>
    execFileSync("node", [script], { input: JSON.stringify(payload), encoding: "utf8" });

  it("prints the deny decision in the shape the hook protocol expects", () => {
    const output = run({
      hook_event_name: "PreToolUse",
      cwd: process.cwd(),
      tool_name: "Read",
      tool_input: { file_path: "topics/wiki/quizzes/.hidden/ch03.key.json" },
    });
    expect(JSON.parse(output)).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: expect.stringContaining("hidden material"),
      },
    });
  });

  it("says nothing at all when the call is fine", () => {
    const output = run({
      hook_event_name: "PreToolUse",
      cwd: process.cwd(),
      tool_name: "Read",
      tool_input: { file_path: "tools/src/guard.ts" },
    });
    expect(output).toBe("");
  });

  it("resolves the project root from its own location, not from cwd", () => {
    // The hook is handed a cwd inside a topic. It must still recognise the path as
    // hidden material belonging to this repo.
    const output = run({
      hook_event_name: "PreToolUse",
      cwd: new URL("../../topics", import.meta.url).pathname,
      tool_name: "Read",
      tool_input: { file_path: "wiki/quizzes/.hidden/ch03.key.json" },
    });
    expect(JSON.parse(output).hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("exits clean on a payload that is not JSON", () => {
    expect(
      execFileSync("node", [script], { input: "not json", encoding: "utf8" }),
    ).toBe("");
  });
});

describe("failing open", () => {
  it("allows a payload it does not understand rather than blocking the session", () => {
    expect(decide({}, ROOT).deny).toBe(false);
    expect(decide({ tool_name: "Read" }, ROOT).deny).toBe(false);
    expect(decide({ tool_name: "WebFetch", tool_input: { url: "https://x" } }, ROOT).deny).toBe(false);
  });
});
