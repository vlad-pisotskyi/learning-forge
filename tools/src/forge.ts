#!/usr/bin/env node
/**
 *   npm run forge -- init <slug>        create the empty tree for a new topic
 *   npm run forge -- sources <slug>     fold research shards into sources.json
 *   npm run forge -- check <slug>       rule on the draft map without applying it
 *   npm run forge -- apply <slug>       project the approved map onto disk
 *   npm run forge -- status [<slug>]    what is still owed, and what to run next
 *   npm run forge -- try <slug> <cNN>   run a challenge's eval set against its reference
 *   npm run forge -- promote <slug>     draft to validated, if the validator agrees
 *
 * These are the mechanical steps of the forge-generate skill. They are a CLI
 * rather than skill prose because a program that writes the same tree every time
 * is worth more than a model that remembers the contract most of the time.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SLUG } from "./contract.ts";
import {
  applyPlan,
  checkPlanFile,
  initTopic,
  mergeSources,
  promoteToValidated,
  statusOf,
  tryChallenge,
} from "./forge-scaffold.ts";

const USAGE = `Usage:
  npm run forge -- init <slug>
  npm run forge -- sources <slug>
  npm run forge -- check <slug> [--approved]
  npm run forge -- apply <slug>
  npm run forge -- status [<slug> | --all]
  npm run forge -- try <slug> <challengeId>
  npm run forge -- promote <slug>`;

const args = process.argv.slice(2);
const command = args[0];
const rest = args.slice(1).filter((a) => !a.startsWith("--"));
const all = args.includes("--all");
const root = process.cwd();

function requireSlug(): string {
  const slug = rest[0];
  if (!slug) fail(`${command} needs a topic slug`);
  if (!SLUG.test(slug)) fail(`"${slug}" is not a valid slug (${SLUG})`);
  return slug;
}

function fail(message: string): never {
  console.error(`✗ ${message}\n\n${USAGE}`);
  process.exit(2);
}

function reportProblems(label: string, problems: string[]): never {
  console.error(`✗ ${label}: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

function topicSlugs(): string[] {
  const dir = join(root, "topics");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}

switch (command) {
  case "init": {
    const slug = requireSlug();
    const result = initTopic(root, slug);
    console.log(`✓ topics/${slug}: tree created`);
    for (const path of result.created) console.log(`  + ${path}`);
    console.log("\nNext: run the research stage, then: npm run forge -- sources " + slug);
    break;
  }

  case "sources": {
    const slug = requireSlug();
    const result = mergeSources(root, slug);
    if (result.problems.length) reportProblems(`topics/${slug}/sources.json`, result.problems);
    if (!result.shards.length) {
      console.error(`✗ .forge-cache/${slug}/research/ holds no shards; nothing to merge`);
      process.exit(1);
    }
    console.log(
      `✓ topics/${slug}/sources.json: ${result.sources} source(s) (${result.primary} primary), ${result.excerpts} excerpt(s) from ${result.shards.length} shard(s)`,
    );
    if (result.merged) console.log(`  ${result.merged} duplicate excerpt(s) folded together`);
    console.log(`  shards: ${result.shards.join(", ")}`);
    break;
  }

  case "check": {
    const slug = requireSlug();
    const result = checkPlanFile(root, slug, args.includes("--approved"));
    if (result.problems.length) reportProblems(result.path, result.problems);
    console.log(
      `✓ ${result.path}: ${result.chapters} chapter(s), ${result.challenges} challenge(s), ${result.concepts} concept(s), ${result.allocated} excerpt(s) allocated`,
    );
    break;
  }

  case "apply": {
    const slug = requireSlug();
    const result = applyPlan(root, slug);
    if (result.problems.length) reportProblems(`.forge-cache/${slug}/map.approved.json`, result.problems);
    console.log(`✓ topics/${slug}: plan applied`);
    for (const path of result.written) console.log(`  + ${path}`);
    for (const path of result.refreshed) console.log(`  ~ ${path}`);
    for (const path of result.orphans) console.log(`  ? ${path} is not in the plan; move or delete it by hand`);
    break;
  }

  case "status": {
    const slugs = all || !rest.length ? topicSlugs() : [requireSlug()];
    if (!slugs.length) {
      console.log("No topics under topics/ yet.");
      break;
    }
    for (const slug of slugs) {
      const status = statusOf(root, slug);
      console.log(`topics/${slug} — stage: ${status.stage}`);
      for (const item of status.outstanding) {
        const owed = item.ids.length ? `  outstanding: ${item.ids.join(" ")}` : "";
        console.log(`  ${item.kind.padEnd(11)} ${item.done}/${item.total}${owed}`);
      }
      const { total, uncited, unallocated } = status.excerpts;
      console.log(`  excerpts    ${total - uncited.length}/${total} cited`);
      if (uncited.length) console.log(`    uncited: ${uncited.join(" ")}`);
      if (unallocated.length) console.log(`    not allocated to any chapter: ${unallocated.join(" ")}`);
      for (const missing of status.missingCitations) {
        console.log(`    ${missing.chapter} owes citations for: ${missing.refs.join(" ")}`);
      }
      if (!status.map.approved) {
        console.log(`  map        ${status.map.draft ? "written, awaiting approval" : "not written"}`);
      }
      console.log(`  next: ${status.next}\n`);
    }
    break;
  }

  case "try": {
    const slug = requireSlug();
    const challengeId = rest[1];
    if (!challengeId) fail("try needs a challenge id, e.g. c02");
    const result = tryChallenge(root, slug, challengeId);
    if (result.problems.length) reportProblems(`${slug}/${challengeId}`, result.problems);
    console.log(`${result.passed ? "✓" : "✗"} ${challengeId}: ${result.command}`);
    console.log(`  staged at ${result.staged}`);
    if (result.output) console.log(result.output.replace(/^/gm, "  "));
    if (!result.passed) {
      console.error(`\n✗ ${challengeId}: the reference solution does not pass its own evaluation set`);
      process.exit(1);
    }
    break;
  }

  case "promote": {
    const slug = requireSlug();
    const result = promoteToValidated(root, slug);
    if (result.promoted) {
      console.log(`✓ topics/${slug}: status is now validated`);
      break;
    }
    if (!result.errors && !result.warnings) {
      console.log(`✓ topics/${slug}: already verified; leaving it there`);
      break;
    }
    console.error(
      `✗ topics/${slug}: not promoted (${result.errors} error(s), ${result.warnings} warning(s) under --strict)`,
    );
    console.error(`  see: npm run validate -- topics/${slug} --strict`);
    process.exit(1);
  }

  default:
    fail(command ? `unknown command "${command}"` : "no command given");
}
