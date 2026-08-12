/**
 * PreToolUse hook. Reads one payload on stdin and either says nothing or denies.
 *
 * The decision lives in `guard.ts`, which is pure and tested. This file only moves
 * bytes, and it fails open: a guard that crashed the session on a payload it did not
 * recognise would be worse than the leak it is preventing. Registered in
 * `.claude/settings.json`.
 */

import { resolve } from "node:path";
import { decide, type GuardInput } from "./guard.ts";

const projectDir = resolve(import.meta.dirname, "..", "..");

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const raw = await readStdin();

let input: GuardInput;
try {
  input = JSON.parse(raw) as GuardInput;
} catch {
  process.stderr.write("forge guard: unreadable hook payload, allowing\n");
  process.exit(0);
}

const decision = decide(input, projectDir);
if (decision.deny) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: decision.reason,
      },
    })}\n`,
  );
}
process.exit(0);
