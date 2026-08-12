/**
 * The enforcement layer.
 *
 * Two rules in this repo are promises to the learner rather than preferences: no
 * agent reads a topic's `.hidden/` material while they are working through it, and no
 * agent writes their challenge code for them. Tool lists cannot express either one,
 * because they restrict tools and not paths. So both live here, as a PreToolUse hook.
 *
 * Everything in this file is pure. It takes the JSON Claude Code puts on a hook's
 * stdin and returns a decision. The thin wrapper in `hook-guard.ts` does the reading
 * and the printing, which is what makes the interesting half testable.
 */

import { isAbsolute, relative, resolve, sep } from "node:path";

/** The subset of the PreToolUse payload this decision depends on. */
export type GuardInput = {
  /** Absent in the main conversation. Present, and the agent's name, inside a subagent. */
  agent_type?: string | undefined;
  tool_name?: string | undefined;
  tool_input?: Record<string, unknown> | undefined;
  cwd?: string | undefined;
};

export type Decision = { deny: false } | { deny: true; reason: string };

const ALLOW: Decision = { deny: false };

/**
 * Roles that may read hidden material. The two graders run in isolated contexts and
 * return a verdict, so what they read does not come back. The two authoring agents
 * are the ones that write the material in the first place.
 */
export const HIDDEN_READERS: readonly string[] = [
  "topic-judge",
  "topic-quiz-grader",
  "forge-challenge-author",
  "forge-chapter-writer",
];

/**
 * Roles that may write hidden material. Narrower than the readers: a grader has no
 * business editing the evaluation set it is about to run.
 */
export const HIDDEN_WRITERS: readonly string[] = ["forge-challenge-author", "forge-chapter-writer"];

const READ_PATH_FIELDS = ["file_path", "notebook_path"] as const;
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const READ_TOOLS = new Set(["Read", "NotebookRead"]);
const SEARCH_TOOLS = new Set(["Grep", "Glob"]);

/** A Bash command that names a hidden path inside a topic. */
const BASH_HIDDEN = /topics[/\\][^\s'"]*\.hidden/;

function field(input: GuardInput, name: string): string | undefined {
  const value = input.tool_input?.[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * The path a tool call names, as segments relative to the project root. Returns
 * undefined when the path lands outside the project, which is not this hook's
 * business, and [] for the project root itself.
 */
export function segmentsOf(projectDir: string, cwd: string, path: string): string[] | undefined {
  const absolute = isAbsolute(path) ? path : resolve(cwd, path);
  const rel = relative(resolve(projectDir), absolute);
  if (rel.startsWith("..")) return undefined;
  if (rel === "") return [];
  return rel.split(sep);
}

/** True when the path sits inside a topic's hidden material. */
export function isHidden(segments: string[]): boolean {
  return segments[0] === "topics" && segments.includes(".hidden");
}

/** True when the path is a file inside a learner's challenge work tree. */
export function isLearnerWork(segments: string[]): boolean {
  return (
    segments.length > 5 &&
    segments[0] === "topics" &&
    segments[2] === "challenges" &&
    segments[4] === "work"
  );
}

/**
 * True when a recursive search rooted here would descend into hidden material.
 *
 * Hidden directories sit at two known depths, `topics/<slug>/quizzes/.hidden` and
 * `topics/<slug>/challenges/<id>/.hidden`, so their ancestors are enumerable without
 * touching the filesystem.
 *
 * The project root is deliberately not on this list. A search from the root does
 * reach hidden material, and denying it would break every ordinary grep run while
 * working on the Forge itself. Reaching hidden material from the root takes a
 * deliberate query, and the learner deciding to look is theirs to decide.
 */
export function reachesHidden(segments: string[]): boolean {
  if (segments[0] !== "topics") return false;
  if (segments.length <= 2) return true;
  if (segments.length === 3) return segments[2] === "quizzes" || segments[2] === "challenges";
  if (segments.length === 4) return segments[2] === "challenges";
  return false;
}

const HIDDEN_READ_REASON =
  "Denied: this is a topic's hidden material, and the role asking for it teaches the " +
  "learner. Reading an answer key or an evaluation set here would leak it into the " +
  "conversation. Work from the chapters, the brief, the rubric, and the learner's own " +
  "code instead. If a question cannot be answered without the hidden material, say so; " +
  "that is a real answer.";

const HIDDEN_WRITE_REASON =
  "Denied: only the agents that author a challenge may write its hidden material. " +
  "Editing an evaluation set or an answer key from any other role changes the thing " +
  "doing the grading.";

const WORK_REASON =
  "Denied: this file is the learner's challenge attempt, and no agent writes it. The " +
  "repo teaches and grades; it never solves. Explain the concept, point at the chapter, " +
  "or say what their code actually does, and let them make the edit.";

const NAMED_REASON =
  "Denied: this pattern enumerates a topic's hidden material by name. Nothing has been " +
  "read yet, so this is a cheap mistake to correct: search what the learner can see. If " +
  "you were checking whether a hidden file exists, the answer does not change what you " +
  "should say to them.";

const SEARCH_REASON =
  "Denied: a search rooted here would read a topic's hidden material, and results come " +
  "back as file contents. Narrow the search to what the learner can see, for example a " +
  "topic's chapters/ or a challenge's work/ directory.";

/**
 * Decide one tool call. `null`-safe by design: an unrecognised payload allows, because
 * a guard that fails closed on every unknown tool would block the session outright.
 */
export function decide(input: GuardInput, projectDir: string): Decision {
  const tool = input.tool_name;
  if (!tool) return ALLOW;

  const cwd = input.cwd ?? projectDir;
  const agent = input.agent_type;
  const mayRead = agent !== undefined && HIDDEN_READERS.includes(agent);
  const mayWrite = agent !== undefined && HIDDEN_WRITERS.includes(agent);

  const at = (path: string) => segmentsOf(projectDir, cwd, path);

  if (tool === "Bash") {
    const command = field(input, "command");
    if (command && !mayRead && BASH_HIDDEN.test(command)) {
      return { deny: true, reason: HIDDEN_READ_REASON };
    }
    return ALLOW;
  }

  if (WRITE_TOOLS.has(tool) || READ_TOOLS.has(tool)) {
    const writing = WRITE_TOOLS.has(tool);
    for (const name of READ_PATH_FIELDS) {
      const path = field(input, name);
      if (!path) continue;
      const segments = at(path);
      if (!segments) continue;
      if (writing && isLearnerWork(segments)) return { deny: true, reason: WORK_REASON };
      if (!isHidden(segments)) continue;
      if (writing ? !mayWrite : !mayRead) {
        return { deny: true, reason: writing ? HIDDEN_WRITE_REASON : HIDDEN_READ_REASON };
      }
    }
    return ALLOW;
  }

  if (SEARCH_TOOLS.has(tool)) {
    if (mayRead) return ALLOW;

    // A pattern that names `.hidden` is asking for it outright, whichever field it
    // arrived in. It gets its own message: a glob has read nothing yet, and telling an
    // agent it leaked an answer key when it matched a path teaches it the wrong lesson.
    for (const name of ["pattern", "glob", "path"]) {
      const value = field(input, name);
      if (value?.includes(".hidden")) return { deny: true, reason: NAMED_REASON };
    }

    // Glob returns paths and not contents, and the hidden filenames are pinned in the
    // contract, so only Grep is restricted by where it is rooted.
    if (tool === "Grep") {
      const segments = at(field(input, "path") ?? ".");
      if (segments && segments.length > 0 && reachesHidden(segments)) {
        return { deny: true, reason: SEARCH_REASON };
      }
    }
    return ALLOW;
  }

  return ALLOW;
}
