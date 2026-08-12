#!/usr/bin/env node
/**
 *   npm run validate -- topics/<slug> [--strict]
 *   npm run validate:all [-- --strict]
 *
 * Errors fail the run. Warnings pass unless --strict, or unless the topic claims
 * status `validated` or `verified`, which mean strict already passed once.
 */
import { existsSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { validateTopic } from "./validate.ts";

function findTopicDirs(root: string): string[] {
  const dir = join(root, "topics");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => join(dir, e.name))
    .sort();
}

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const all = args.includes("--all");
const paths = args.filter((a) => !a.startsWith("--"));
const cwd = process.cwd();

const targets = all ? findTopicDirs(cwd) : paths.map((p) => resolve(cwd, p));

if (!targets.length) {
  // Nothing to check is only an error when a target was named and missed.
  if (all) {
    console.log("No topics under topics/ yet; nothing to check.");
    process.exit(0);
  }
  console.error("Usage: npm run validate -- topics/<slug> [--strict]   |   npm run validate:all");
  process.exit(2);
}

let failed = 0;
for (const target of targets) {
  const label = relative(cwd, target) || target;
  if (!existsSync(target)) {
    console.error(`✗ ${label}: no such directory`);
    failed++;
    continue;
  }
  const report = validateTopic(target, strict);
  const errors = report.errors;
  const warnings = report.warnings;

  if (!errors.length && !warnings.length) {
    console.log(`✓ ${label}: contract satisfied`);
    continue;
  }
  console.log(`${errors.length ? "✗" : "!"} ${label}: ${errors.length} error(s), ${warnings.length} warning(s)`);
  for (const f of [...errors, ...warnings]) {
    console.log(`  ${f.level === "error" ? "error" : "warn "}  ${f.where}\n         ${f.message}`);
  }
  if (errors.length) failed++;
}

process.exit(failed ? 1 : 0);
