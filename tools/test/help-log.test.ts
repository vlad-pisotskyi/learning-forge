/**
 * Proves the Helper's continuity log survives the two things that can go wrong with it:
 * a reply that does not carry a summary, and the same reply arriving twice because two
 * stop events fired for one invocation.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendEntry, parseContinuity } from "../src/help-log.ts";

const AT = "2026-08-12T19:40:00.000Z";

const REPLY = `Your index is rebuilt on every query. Read ch04 again.

## Continuity

**Topic:** wiki-retrieval c02
**Asked:** why their search is slow on the full corpus
**Told:** the index is rebuilt per query, pointed at ch04 on precomputation
`;

describe("parsing the Helper's summary", () => {
  it("reads the topic, challenge, and both lines", () => {
    expect(parseContinuity(REPLY)).toEqual({
      slug: "wiki-retrieval",
      challenge: "c02",
      asked: "why their search is slow on the full corpus",
      told: "the index is rebuilt per query, pointed at ch04 on precomputation",
    });
  });

  it("accepts a summary with no challenge named", () => {
    expect(parseContinuity(REPLY.replace(" c02", ""))?.challenge).toBeUndefined();
  });

  it("returns nothing when the Helper ignored its template", () => {
    expect(parseContinuity("Here is a hint. Good luck.")).toBeUndefined();
    expect(parseContinuity(REPLY.replace("**Told:**", "Told:"))).toBeUndefined();
    expect(parseContinuity(REPLY.replace(/\*\*Topic:\*\*.*\n/, ""))).toBeUndefined();
  });

  it("does not vouch for the slug, which the hook checks against the topics on disk", () => {
    expect(parseContinuity(REPLY.replace("wiki-retrieval", "not-a-topic"))?.slug).toBe("not-a-topic");
  });
});

describe("appending to the log", () => {
  const entry = parseContinuity(REPLY)!;

  it("writes a header the first time and the entry beneath it", () => {
    const log = appendEntry(undefined, entry, AT);
    expect(log).toContain("# Helper log");
    expect(log).toContain(`## c02 at ${AT}`);
    expect(log).toContain("**Asked:** why their search is slow");
  });

  it("keeps earlier entries and puts the newest last", () => {
    const first = appendEntry(undefined, entry, AT)!;
    const second = appendEntry(
      first,
      { ...entry, asked: "how to weight document length", told: "pointed at ch05 on b and k1" },
      "2026-08-12T20:10:00.000Z",
    )!;
    expect(second.indexOf("why their search is slow")).toBeLessThan(
      second.indexOf("how to weight document length"),
    );
    expect(second.match(/# Helper log/g)).toHaveLength(1);
  });

  it("refuses to append the same exchange twice", () => {
    const first = appendEntry(undefined, entry, AT)!;
    expect(appendEntry(first, entry, "2026-08-12T20:10:00.000Z")).toBeUndefined();
  });

  it("appends a repeat of an older question, since only the last entry is a duplicate", () => {
    const first = appendEntry(undefined, entry, AT)!;
    const second = appendEntry(first, { ...entry, asked: "something else", told: "ch05" }, AT)!;
    expect(appendEntry(second, entry, AT)).toBeDefined();
  });
});

describe("the hook Claude Code actually runs", () => {
  const script = new URL("../src/hook-help-log.ts", import.meta.url).pathname;
  const temps: string[] = [];

  afterEach(() => {
    for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /** A project root holding one topic, so the hook's existence check has something to find. */
  function root(): string {
    const dir = mkdtempSync(join(tmpdir(), "forge-helplog-"));
    temps.push(dir);
    mkdirSync(join(dir, "topics", "wiki-retrieval"), { recursive: true });
    return dir;
  }

  function run(dir: string, payload: unknown) {
    execFileSync("node", [script], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: { ...process.env, FORGE_PROJECT_DIR: dir },
    });
    const log = join(dir, "topics", "wiki-retrieval", ".state", "help-log.md");
    return existsSync(log) ? readFileSync(log, "utf8") : undefined;
  }

  const stop = {
    hook_event_name: "SubagentStop",
    agent_type: "topic-helper",
    last_assistant_message: REPLY,
  };

  it("writes the log when the Helper stops", () => {
    expect(run(root(), stop)).toContain("**Told:** the index is rebuilt per query");
  });

  it("ignores every other agent, so the Judge's verdict never lands in the help log", () => {
    expect(run(root(), { ...stop, agent_type: "topic-judge" })).toBeUndefined();
    const { agent_type, ...mainConversation } = stop;
    expect(run(root(), mainConversation)).toBeUndefined();
  });

  it("writes nothing for a topic that does not exist", () => {
    const dir = root();
    run(dir, { ...stop, last_assistant_message: REPLY.replace("wiki-retrieval", "no-such-topic") });
    expect(existsSync(join(dir, "topics", "no-such-topic"))).toBe(false);
  });

  it("stays at one entry when both stop events fire for the same reply", () => {
    const dir = root();
    run(dir, stop);
    const log = run(dir, { ...stop, hook_event_name: "Stop" });
    expect(log?.match(/\*\*Asked:\*\*/g)).toHaveLength(1);
  });
});
