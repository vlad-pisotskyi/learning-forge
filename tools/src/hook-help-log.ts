/**
 * SubagentStop hook. When the Helper finishes, append its closing summary to that
 * topic's help log so the next question starts with what the last one was told.
 *
 * Does nothing unless the agent that just stopped was the Helper and the topic it names
 * exists. Fails silently: a missing log entry costs the Helper some continuity, while a
 * hook that throws costs the learner their session. Registered in
 * `.claude/settings.json`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { appendEntry, parseContinuity } from "./help-log.ts";

const HELPER = "topic-helper";

/**
 * `FORGE_PROJECT_DIR` exists so the tests can point this hook at a temporary topic. It
 * is safe here and deliberately absent from `hook-guard.ts`: this hook writes a log, so
 * redirecting it costs the Helper some continuity, while redirecting the guard would
 * turn off the guard.
 */
const projectDir = process.env["FORGE_PROJECT_DIR"] ?? resolve(import.meta.dirname, "..", "..");

type StopInput = {
  agent_type?: string | undefined;
  last_assistant_message?: string | undefined;
};

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const raw = await readStdin();

let input: StopInput;
try {
  input = JSON.parse(raw) as StopInput;
} catch {
  process.exit(0);
}

if (input.agent_type !== HELPER || !input.last_assistant_message) process.exit(0);

const entry = parseContinuity(input.last_assistant_message);
if (!entry) process.exit(0);

const topicDir = join(projectDir, "topics", entry.slug);
if (!existsSync(topicDir)) process.exit(0);

const stateDir = join(topicDir, ".state");
const logPath = join(stateDir, "help-log.md");
const existing = existsSync(logPath) ? readFileSync(logPath, "utf8") : undefined;
const next = appendEntry(existing, entry, new Date().toISOString());
if (next !== undefined) {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(logPath, next);
}
process.exit(0);
