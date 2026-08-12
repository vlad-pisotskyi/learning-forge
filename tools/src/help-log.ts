/**
 * The Helper's continuity log.
 *
 * The Helper runs in a forked context that is discarded when it replies, so it starts
 * every question knowing nothing about the last one. A log fixes that. The Helper
 * cannot write the log itself, because it has no write tools, and it has no write tools
 * so that it cannot write the learner's code either. So it ends its reply with a two
 * line summary and a SubagentStop hook appends that summary here.
 *
 * The parsing and formatting are pure so they can be tested. `hook-help-log.ts` does
 * the reading and the appending.
 */

const TOPIC = /^\*\*Topic:\*\*\s+([a-z0-9][a-z0-9-]*)(?:\s+(c\d{2}))?\s*$/m;
const ASKED = /^\*\*Asked:\*\*\s+(.+)$/m;
const TOLD = /^\*\*Told:\*\*\s+(.+)$/m;

export type ContinuityEntry = {
  slug: string;
  challenge: string | undefined;
  asked: string;
  told: string;
};

/**
 * Pull the continuity summary out of the Helper's final message. Returns undefined
 * when the reply does not carry one, which is a Helper that ignored its template
 * rather than an error worth failing a hook over.
 */
export function parseContinuity(message: string): ContinuityEntry | undefined {
  const topic = TOPIC.exec(message);
  const asked = ASKED.exec(message);
  const told = TOLD.exec(message);
  if (!topic?.[1] || !asked?.[1] || !told?.[1]) return undefined;
  return {
    slug: topic[1],
    challenge: topic[2],
    asked: asked[1].trim(),
    told: told[1].trim(),
  };
}

/** One log entry, newest appended last. */
export function formatEntry(entry: ContinuityEntry, at: string): string {
  const heading = entry.challenge ? `${entry.challenge} at ${at}` : at;
  return `## ${heading}\n\n**Asked:** ${entry.asked}\n**Told:** ${entry.told}\n`;
}

const HEADER = `# Helper log\n
Every exchange with the Helper for this topic, oldest first. Written by a hook from the
Helper's own closing summary, so the Helper can read what it already said instead of
repeating a hint or contradicting one. Local only and gitignored.\n`;

/**
 * The log's new contents. Appending is a pure function of what was there and what the
 * Helper just said, which keeps the hook itself trivial.
 *
 * Returns undefined when this exact exchange is already the last entry. Two hook events
 * can fire for one reply depending on how the Helper was invoked, and a duplicated hint
 * in the log would make the Helper think it had said something twice.
 */
export function appendEntry(
  existing: string | undefined,
  entry: ContinuityEntry,
  at: string,
): string | undefined {
  const formatted = formatEntry(entry, at);
  const body = existing?.trimEnd() ?? "";
  if (body.length > 0) {
    const last = body.lastIndexOf("\n## ");
    const tail = last === -1 ? body : body.slice(last + 1);
    if (tail.includes(`**Asked:** ${entry.asked}`) && tail.includes(`**Told:** ${entry.told}`)) {
      return undefined;
    }
  }
  const head = body.length > 0 ? body : HEADER.trimEnd();
  return `${head}\n\n${formatted}`;
}
