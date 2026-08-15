/**
 * The deterministic half of the generator.
 *
 * Everything a program can decide is decided here: the directory tree, source
 * ids, chapter `order`, quiz paths, challenge manifests, which files still owe
 * content. The model's share is prose, excerpts, questions, briefs, and code —
 * the parts that need judgement.
 *
 * Two rules hold throughout. Plan-derived files are rewritten from the plan on
 * every apply, because the plan is their only source of truth. Authored files are
 * never overwritten once they hold content; the worst this code will do to a
 * chapter is rewrite its frontmatter and leave the prose alone.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  CONTRACT_VERSION,
  MARKER,
  ROLE_SKILLS,
  challengeManifestSchema,
  quizKeyPath,
  sourcesFileSchema,
  type SourcesFile,
} from "./contract.ts";
import {
  PLAN_VERSION,
  STUB_MARKER,
  NOTHING_FOUND,
  chapterAuditSchema,
  chapterCritiqueSchema,
  challengeManifestFromPlan,
  checkPlan,
  excerptRefs,
  frontmatterFromPlan,
  isStub,
  manifestFromPlan,
  paths,
  UNSTAMPED,
  referenceEntrypoint,
  researchShardSchema,
  stampTemplate,
  runStateSchema,
  topicPlanSchema,
  type ChallengePlan,
  type RunState,
  type Stage,
  type TopicPlan,
} from "./forge-plan.ts";
import { validateTopic } from "./validate.ts";

/* ---------------------------------------------------------------- plumbing */

function writeIfChanged(path: string, text: string): boolean {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path) && readFileSync(path, "utf8") === text) return false;
  writeFileSync(path, text);
  return true;
}

const json = (data: unknown): string => `${JSON.stringify(data, null, 2)}\n`;

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** A YAML scalar or flow array, quoted by the YAML writer rather than by hand. */
function yamlScalar(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(yamlScalar).join(", ")}]`;
  return stringifyYaml(value, { lineWidth: 0 }).trim();
}

function frontmatterBlock(fields: Record<string, unknown>, nested?: Record<string, unknown>): string {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${yamlScalar(value)}`);
  const tail = nested ? stringifyYaml(nested, { lineWidth: 0 }).trimEnd() : "";
  return `---\n${lines.join("\n")}${tail ? `\n${tail}` : ""}\n---\n`;
}

function splitFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } | undefined {
  if (!raw.startsWith("---\n")) return undefined;
  const end = raw.indexOf("\n---", 4);
  if (end === -1) return undefined;
  const afterFence = raw.indexOf("\n", end + 1);
  const parsed = parseYaml(raw.slice(4, end));
  if (!parsed || typeof parsed !== "object") return undefined;
  return {
    frontmatter: parsed as Record<string, unknown>,
    body: afterFence === -1 ? "" : raw.slice(afterFence + 1),
  };
}

/** Today, as the caller sees it. Injectable so tests are not clock-dependent. */
export type Clock = () => string;
const systemClock: Clock = () => new Date().toISOString().slice(0, 10);

/* -------------------------------------------------------------- run state */

export function readRunState(root: string, slug: string): RunState | undefined {
  const path = paths.runState(root, slug);
  if (!existsSync(path)) return undefined;
  const parsed = runStateSchema.safeParse(readJsonFile(path));
  return parsed.success ? parsed.data : undefined;
}

export function recordStage(
  root: string,
  slug: string,
  stage: Stage,
  note: string,
  clock: Clock = systemClock,
): RunState {
  const at = clock();
  const previous = readRunState(root, slug);
  const state: RunState = {
    planVersion: PLAN_VERSION,
    slug,
    stage,
    updated: at,
    log: [...(previous?.log ?? []), { stage, at, note }],
  };
  writeIfChanged(paths.runState(root, slug), json(state));
  return state;
}

/* ------------------------------------------------------------------- init */

const rolePlaceholder = (role: string, slug: string) =>
  `---
name: ${role}
description: Placeholder for the ${role} role of the ${slug} topic. Not yet a working skill.
disable-model-invocation: true
---

<!-- ${STUB_MARKER} role ${role} -->

The contract puts the topic's ${role} role at this path, so the file exists from
the moment the topic does. The behavioural template arrives with the role
templates, and the generator stamps it here per topic.
`;

export type InitResult = { topicDir: string; created: string[] };

/**
 * Creates the empty tree. No manifest, no concepts, no sources — those are
 * projections of a plan that does not exist yet, and writing placeholder versions
 * of them would put files on disk that violate their own schemas.
 */
export function initTopic(root: string, slug: string, clock: Clock = systemClock): InitResult {
  const topicDir = paths.topicDir(root, slug);
  if (existsSync(join(topicDir, "topic.json"))) {
    throw new Error(`topics/${slug} already has a topic.json; init is for new topics only`);
  }
  const created: string[] = [];

  for (const dir of ["chapters", "quizzes", "challenges", "corpus"]) {
    mkdirSync(join(topicDir, dir), { recursive: true });
    created.push(`topics/${slug}/${dir}/`);
  }
  for (const role of ROLE_SKILLS) {
    const path = join(topicDir, ".claude", "skills", role, "SKILL.md");
    if (writeIfChanged(path, rolePlaceholder(role, slug))) {
      created.push(`topics/${slug}/.claude/skills/${role}/SKILL.md`);
    }
  }
  mkdirSync(paths.researchDir(root, slug), { recursive: true });
  created.push(`.forge-cache/${slug}/research/`);
  mkdirSync(paths.verdictDir(root, slug), { recursive: true });
  created.push(`.forge-cache/${slug}/verdicts/`);
  recordStage(root, slug, "init", "tree created", clock);
  created.push(`.forge-cache/${slug}/run.json`);

  return { topicDir, created };
}

/* ---------------------------------------------------------------- sources */

export type MergeResult = {
  shards: string[];
  sources: number;
  primary: number;
  excerpts: number;
  merged: number;
  folded: number;
  problems: string[];
};

/**
 * The identity of a source is the document, not the string a researcher happened to
 * type. Two shards reaching the same RFC through `/rfc/rfc3629` and
 * `/rfc/rfc3629.txt`, or the same living standard through two anchors, found one
 * source and not two. A fragment is a position inside a document, which is what the
 * `locator` field already records.
 *
 * Deliberately narrow: only spellings that name the same document by construction
 * collapse. Folding two genuinely different sources into one is a worse failure than
 * leaving a duplicate on the page where a reader can see it.
 */
/**
 * arXiv is reached through several hosts that all name a paper by one identifier: the
 * abstract page at `arxiv.org/abs/<id>`, its `/pdf/` sibling, and the full-text renders
 * at `ar5iv.org` and `ar5iv.labs.arxiv.org`. Shards researching the same paper land on
 * different ones as a matter of course, and the first real research run produced two
 * entries per paper for exactly this reason, across two shards and two papers.
 *
 * The version suffix is dropped deliberately. `2005.11401v2` and `2005.11401` are not the
 * same file, but a chapter citing an arXiv id is citing the paper, and keeping them apart
 * would leave standing the duplicate this exists to remove.
 */
const ARXIV_HOST =
  /^(?:arxiv\.org|ar5iv\.org|ar5iv\.labs\.arxiv\.org|export\.arxiv\.org|browse\.arxiv\.org)$/;
const ARXIV_PATH = /^\/(?:abs|pdf|html|format)\/(.+?)(?:v\d+)?$/;

export function sourceKey(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url.trim().toLowerCase();
  }
  const host = parsed.host.toLowerCase().replace(/^www\./, "");
  const path = parsed.pathname.replace(/\/+$/, "").replace(/\.(?:txt|html?)$/i, "");
  if (ARXIV_HOST.test(host)) {
    const onArxiv = ARXIV_PATH.exec(path);
    if (onArxiv) return `arxiv:${onArxiv[1]!.toLowerCase()}`;
  }
  return `${host}${path}${parsed.search}`;
}

/**
 * Which spelling of a paper a reader can actually find a quoted passage in. An abstract
 * page carries the abstract and nothing else, so a locator naming section 5.1 against one
 * can never be checked, and the contract asks for a locator precise enough to find the
 * passage again. A real run pinned thirteen full-text quotes to two abstract pages this
 * way, and `sources --verify` scored them 1/7 and 1/13 while every quote was genuine.
 *
 * ar5iv ranks as full text whatever the path says, because it serves the rendered paper
 * and redirects `/abs/` to `/html/`. The PDF sits between the two: it holds the passage,
 * so a reader can find it, but no checker in this repo extracts PDF text.
 */
function locatorRank(url: string): number {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 0;
  }
  const host = parsed.host.toLowerCase().replace(/^www\./, "");
  if (/^ar5iv\./.test(host)) return 2;
  if (parsed.pathname.startsWith("/html/")) return 2;
  if (parsed.pathname.startsWith("/pdf/")) return 1;
  return 0;
}

/**
 * Two shards describing one document rarely describe it identically. Nothing here is
 * a judgement call: take the more precise date, the later retrieval, and the less
 * flattering `primary`, so a disagreement about whether a source is primary surfaces
 * as the validator warning it should be rather than being resolved by shard order.
 */
function reconcile(
  held: SourcesFile["sources"][number],
  draft: Omit<SourcesFile["sources"][number], "id">,
) {
  if (draft.published.startsWith(held.published)) held.published = draft.published;
  if (draft.retrieved > held.retrieved) held.retrieved = draft.retrieved;
  if (!draft.primary) held.primary = false;
  if (!held.identifier && draft.identifier) held.identifier = draft.identifier;
  // A fragment names a position, and two shards pointing at different positions agree
  // only about the document. Keep the pointer that is true of both of them.
  if (held.url.includes("#") && draft.url !== held.url) {
    held.url = draft.url.includes("#") ? held.url.slice(0, held.url.indexOf("#")) : draft.url;
  }
  // Folding the mirrors onto one identifier is the point; keeping whichever one sorted
  // first is not a decision anybody made. Where they name the same paper, keep the
  // spelling a reader can find the quoted passage in.
  if (sourceKey(held.url).startsWith("arxiv:") && locatorRank(draft.url) > locatorRank(held.url)) {
    held.url = draft.url;
  }
}

/**
 * Folds every research shard into one `sources.json`, handing out ids in shard
 * order so the same shards always produce the same ids. Two shards that found the
 * same URL become one source with the union of their excerpts, which is the whole
 * reason ids are assigned here and not by whichever agent got there first.
 */
export function mergeSources(root: string, slug: string, clock: Clock = systemClock): MergeResult {
  const dir = paths.researchDir(root, slug);
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    : [];
  const problems: string[] = [];
  const byUrl = new Map<string, { entry: SourcesFile["sources"][number]; quotes: Set<string> }>();
  let merged = 0;
  let folded = 0;

  for (const file of files) {
    const parsed = researchShardSchema.safeParse(readJsonFile(join(dir, file)));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push(`${file}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      continue;
    }
    if (parsed.data.shard !== basename(file, ".json")) {
      problems.push(`${file}: shard name "${parsed.data.shard}" does not match the filename`);
    }
    for (const draft of parsed.data.sources) {
      const key = sourceKey(draft.url);
      const existing = byUrl.get(key);
      if (!existing) {
        byUrl.set(key, {
          entry: { ...draft, id: "S00", excerpts: [] },
          quotes: new Set(),
        });
      } else {
        folded++;
        reconcile(existing.entry, draft);
      }
      const target = byUrl.get(key)!;
      for (const excerpt of draft.excerpts) {
        if (target.quotes.has(excerpt.quote)) {
          merged++;
          continue;
        }
        target.quotes.add(excerpt.quote);
        target.entry.excerpts.push({ ...excerpt, key: "" });
      }
    }
  }

  const sources = [...byUrl.values()].map((held, index) => {
    const ordinal = index + 1;
    if (ordinal > 999) throw new Error("more than 999 sources; the source id space is exhausted");
    const width = ordinal < 100 ? 2 : 3;
    return {
      ...held.entry,
      id: `S${String(ordinal).padStart(width, "0")}`,
      excerpts: held.entry.excerpts.map((excerpt, at) => ({ ...excerpt, key: excerptKey(at) })),
    };
  });

  const file: SourcesFile = { contractVersion: CONTRACT_VERSION, sources } as SourcesFile;
  const check = sourcesFileSchema.safeParse(file);
  if (!check.success) {
    for (const issue of check.error.issues) {
      problems.push(`sources.json: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
  }
  // A merge that failed writes nothing. Every later stage treats sources.json as
  // settled fact, so leaving a half-valid one on disk is worse than leaving none.
  if (!problems.length) {
    writeIfChanged(join(paths.topicDir(root, slug), "sources.json"), json(file));
    if (sources.length) {
      recordStage(root, slug, "research", `${sources.length} source(s) from ${files.length} shard(s)`, clock);
    }
  }

  return {
    shards: files.map((f) => basename(f, ".json")),
    sources: sources.length,
    primary: sources.filter((s) => s.primary).length,
    excerpts: sources.reduce((n, s) => n + s.excerpts.length, 0),
    merged,
    folded,
    problems,
  };
}

/** `a`…`z`, then `aa`…, matching the contract's `^[a-z]{1,3}$`. */
function excerptKey(index: number): string {
  let key = "";
  let n = index;
  do {
    key = String.fromCharCode(97 + (n % 26)) + key;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return key;
}

/* ------------------------------------------------------------------ apply */

const chapterStub = (title: string) => `<!-- ${STUB_MARKER} chapter -->

Not written yet. The chapter writer replaces this whole body: ${title}.
`;

const briefStub = (title: string) => `<!-- ${STUB_MARKER} brief -->

Not written yet. The challenge author replaces this with the problem statement
for: ${title}.
`;

const rubricStub = (title: string) => `<!-- ${STUB_MARKER} rubric -->

Not written yet. The challenge author replaces this with weighted criteria
summing to 100 for: ${title}.
`;

// A stub is spawned by whichever runner the challenge declares, so it has to be written
// in that language. A Python file carrying `throw new Error(...)` fails as a syntax error
// before anything reaches the "not written yet" message it exists to deliver.
const isPythonFile = (path: string) => path.endsWith(".py");

const evalStub = (id: string, python: boolean) =>
  python
    ? `# ${STUB_MARKER} eval ${id}
# The held-out evaluation set goes here. Only the Judge runs this file.
raise SystemExit("${id}: evaluation set not written yet")
`
    : `// ${STUB_MARKER} eval ${id}
// The held-out evaluation set goes here. Only the Judge runs this file.
throw new Error("${id}: evaluation set not written yet");
`;

const solutionStub = (id: string, python: boolean) =>
  python
    ? `# ${STUB_MARKER} solution ${id}
# The reference implementation goes here. It exists so the challenge is proven
# solvable within the interface the manifest pins.
raise SystemExit("${id}: reference solution not written yet")
`
    : `// ${STUB_MARKER} solution ${id}
// The reference implementation goes here. It exists so the challenge is proven
// solvable within the interface the manifest pins.
throw new Error("${id}: reference solution not written yet");
`;

export type ApplyResult = {
  plan: TopicPlan;
  written: string[];
  refreshed: string[];
  orphans: string[];
  problems: string[];
};

/**
 * Projects the approved plan onto disk. Runs on every map revision, so it has to
 * be safe to run over a half-written topic: plan-derived files are rewritten,
 * authored files keep their content, and anything the plan no longer mentions is
 * reported as an orphan rather than deleted.
 */
export function applyPlan(root: string, slug: string, clock: Clock = systemClock): ApplyResult {
  const planPath = paths.planApproved(root, slug);
  if (!existsSync(planPath)) {
    throw new Error(`no approved plan at ${planPath}; the map stage writes map.json and the owner approves it`);
  }
  const parsed = topicPlanSchema.safeParse(readJsonFile(planPath));
  if (!parsed.success) {
    return {
      plan: undefined as unknown as TopicPlan,
      written: [],
      refreshed: [],
      orphans: [],
      problems: parsed.error.issues.map((i) => `map.approved.json: ${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const plan = parsed.data;
  if (plan.slug !== slug) {
    return { plan, written: [], refreshed: [], orphans: [], problems: [`map.approved.json: slug "${plan.slug}" does not match topics/${slug}`] };
  }
  const problems = checkPlan(plan);
  if (problems.length) return { plan, written: [], refreshed: [], orphans: [], problems };

  const topicDir = paths.topicDir(root, slug);
  const written: string[] = [];
  const refreshed: string[] = [];
  const note = (list: string[], path: string, changed: boolean) => {
    if (changed) list.push(path);
  };

  /* --- projections: always rewritten from the plan --- */
  // A revised map must not reset when the topic was written or what it has
  // earned. Everything else in the manifest comes from the plan.
  const manifestPath = join(topicDir, "topic.json");
  const previous = existsSync(manifestPath)
    ? (readJsonFile(manifestPath) as { generatedAt?: string; status?: string })
    : undefined;
  const generatedAt = typeof previous?.generatedAt === "string" ? previous.generatedAt : clock();
  const status =
    previous?.status === "validated" || previous?.status === "verified" ? previous.status : "draft";
  note(refreshed, "topic.json", writeIfChanged(manifestPath, json(manifestFromPlan(plan, generatedAt, status))));
  note(
    refreshed,
    "concepts.json",
    writeIfChanged(
      join(topicDir, "concepts.json"),
      json({ contractVersion: CONTRACT_VERSION, concepts: plan.concepts }),
    ),
  );

  /* --- chapters: frontmatter from the plan, prose left alone --- */
  for (const chapter of plan.chapters) {
    const rel = paths.chapterFile(chapter);
    const path = join(topicDir, rel);
    const planned = frontmatterFromPlan(plan, chapter);
    const existing = existsSync(path) ? splitFrontmatter(readFileSync(path, "utf8")) : undefined;

    const body = existing && !isStub(existing.body) ? existing.body : chapterStub(chapter.title);
    // A chapter that has been audited keeps its audit record and its status; the
    // plan has no opinion on either.
    const status = typeof existing?.frontmatter.status === "string" ? existing.frontmatter.status : planned.status;
    const audit = existing?.frontmatter.audit;
    const text = `${frontmatterBlock({ ...planned, status }, audit ? { audit } : undefined)}\n${body.replace(/^\n+/, "")}`;
    note(existing ? refreshed : written, rel, writeIfChanged(path, text));

    // Two halves, stubbed together. An empty `questions` array is what marks a
    // quiz unwritten; `forge status` counts anything under three as outstanding.
    const quizRel = paths.quizFile(chapter.id);
    const quizPath = join(topicDir, quizRel);
    if (!existsSync(quizPath)) {
      note(
        written,
        quizRel,
        writeIfChanged(
          quizPath,
          json({ contractVersion: CONTRACT_VERSION, chapter: chapter.id, questions: [], passing: { atLeast: 2 } }),
        ),
      );
    }
    const keyRel = quizKeyPath(chapter.id);
    const keyPath = join(topicDir, keyRel);
    if (!existsSync(keyPath)) {
      note(
        written,
        keyRel,
        writeIfChanged(keyPath, json({ contractVersion: CONTRACT_VERSION, chapter: chapter.id, answers: [] })),
      );
    }
  }

  /* --- challenges --- */
  for (const challenge of plan.challenges) {
    const rel = paths.challengeDir(challenge);
    const dir = join(topicDir, rel);
    for (const sub of ["starter", "work", ".hidden/eval", ".hidden/solution"]) {
      mkdirSync(join(dir, sub), { recursive: true });
    }
    note(
      refreshed,
      `${rel}/challenge.json`,
      writeIfChanged(join(dir, "challenge.json"), json(challengeManifestFromPlan(plan, challenge))),
    );
    stubUnlessAuthored(join(dir, "brief.md"), briefStub(challenge.title), `${rel}/brief.md`, written);
    stubUnlessAuthored(join(dir, "rubric.md"), rubricStub(challenge.title), `${rel}/rubric.md`, written);
    const specRel = paths.evalSpec(challenge.id, challenge.eval.runner);
    stubUnlessAuthored(
      join(dir, specRel),
      evalStub(challenge.id, isPythonFile(specRel)),
      `${rel}/${specRel}`,
      written,
    );
    // The reference lives at the entrypoint's path under .hidden/solution/, so a
    // dry run can stage it as work/ and the eval set's imports resolve unchanged.
    const referenceRel = referenceEntrypoint(challenge.interface.entrypoint);
    stubUnlessAuthored(
      join(dir, referenceRel),
      solutionStub(challenge.id, isPythonFile(referenceRel)),
      `${rel}/${referenceRel}`,
      written,
    );
  }

  /* --- the three roles, stamped from templates --- */
  // Generated, so always refreshed: a fix to a template has to reach every topic,
  // and a topic-specific edit here would be silently lost anyway.
  for (const role of ROLE_SKILLS) {
    const templatePath = paths.roleTemplate(root, role);
    if (!existsSync(templatePath)) {
      problems.push(`missing role template ${templatePath}`);
      continue;
    }
    const stamped = stampTemplate(readFileSync(templatePath, "utf8"), plan);
    const left = UNSTAMPED.exec(stamped);
    if (left) {
      problems.push(`${templatePath}: unsubstituted placeholder ${left[0]}`);
      continue;
    }
    const rel = paths.roleSkill(role);
    note(refreshed, rel, writeIfChanged(join(topicDir, rel), stamped));
  }
  if (problems.length) return { plan, written, refreshed, orphans: [], problems };

  recordStage(root, slug, "apply", `${plan.chapters.length} chapter(s), ${plan.challenges.length} challenge(s)`, clock);

  return { plan, written, refreshed, orphans: findOrphans(topicDir, plan), problems: [] };
}

function stubUnlessAuthored(path: string, stub: string, rel: string, written: string[]) {
  if (existsSync(path) && !isStub(readFileSync(path, "utf8"))) return;
  if (writeIfChanged(path, stub)) written.push(rel);
}

/** Files on disk the plan no longer accounts for. Reported, never deleted. */
function findOrphans(topicDir: string, plan: TopicPlan): string[] {
  const orphans: string[] = [];
  const keep = new Set(plan.chapters.map((c) => basename(paths.chapterFile(c))));
  const chaptersDir = join(topicDir, "chapters");
  if (existsSync(chaptersDir)) {
    for (const file of readdirSync(chaptersDir)) {
      if (file.endsWith(".md") && !keep.has(file)) orphans.push(`chapters/${file}`);
    }
  }
  const quizzes = new Set(plan.chapters.map((c) => basename(paths.quizFile(c.id))));
  const quizDir = join(topicDir, "quizzes");
  if (existsSync(quizDir)) {
    for (const file of readdirSync(quizDir)) {
      if (file.endsWith(".json") && !quizzes.has(file)) orphans.push(`quizzes/${file}`);
    }
  }
  const dirs = new Set(plan.challenges.map((c) => basename(paths.challengeDir(c))));
  const challengeDir = join(topicDir, "challenges");
  if (existsSync(challengeDir)) {
    for (const entry of readdirSync(challengeDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !dirs.has(entry.name)) orphans.push(`challenges/${entry.name}`);
    }
  }
  return orphans;
}

/* ----------------------------------------------------------------- status */

export type Outstanding = { kind: string; done: number; total: number; ids: string[] };

export type Status = {
  slug: string;
  stage: Stage | "unknown";
  map: { draft: boolean; approved: boolean };
  outstanding: Outstanding[];
  excerpts: { total: number; uncited: string[]; unallocated: string[] };
  /** Chapters that do not cite everything the map made them responsible for. */
  missingCitations: Array<{ chapter: string; refs: string[] }>;
  next: string;
};

/**
 * The generator's worklist, and the reason a stage can be resumed after a session
 * limit: what is left is read off disk rather than remembered.
 */
export function statusOf(root: string, slug: string): Status {
  const topicDir = paths.topicDir(root, slug);
  const state = readRunState(root, slug);
  const outstanding: Outstanding[] = [];

  const plan = readApprovedPlan(root, slug);
  const chapterFiles = plan
    ? plan.chapters.map((c) => ({ id: c.id, path: join(topicDir, paths.chapterFile(c)) }))
    : listChapterFiles(topicDir);

  const chaptersOwed = chapterFiles.filter(({ path }) => {
    if (!existsSync(path)) return true;
    const split = splitFrontmatter(readFileSync(path, "utf8"));
    return !split || isStub(split.body);
  });
  outstanding.push({
    kind: "chapters",
    done: chapterFiles.length - chaptersOwed.length,
    total: chapterFiles.length,
    ids: chaptersOwed.map((c) => c.id),
  });

  const quizzesOwed = chapterFiles.filter(({ id }) => {
    const path = join(topicDir, paths.quizFile(id));
    const keyPath = join(topicDir, quizKeyPath(id));
    if (!existsSync(path) || !existsSync(keyPath)) return true;
    const quiz = readJsonFile(path) as { questions?: unknown[] };
    const key = readJsonFile(keyPath) as { answers?: unknown[] };
    // A quiz with questions and no answers is half-written, not written.
    if (!Array.isArray(quiz.questions) || quiz.questions.length < 3) return true;
    return !Array.isArray(key.answers) || key.answers.length !== quiz.questions.length;
  });
  outstanding.push({
    kind: "quizzes",
    done: chapterFiles.length - quizzesOwed.length,
    total: chapterFiles.length,
    ids: quizzesOwed.map((c) => c.id),
  });

  const challengeDirs = plan
    ? plan.challenges.map((c) => ({ id: c.id, dir: join(topicDir, paths.challengeDir(c)), plan: c }))
    : [];
  const challengesOwed = challengeDirs.filter(({ dir, plan: challenge }) =>
    [
      join(dir, "brief.md"),
      join(dir, "rubric.md"),
      join(dir, paths.evalSpec(challenge.id, challenge.eval.runner)),
      join(dir, referenceEntrypoint(challenge.interface.entrypoint)),
    ].some((path) => !existsSync(path) || isStub(readFileSync(path, "utf8"))) ||
    !hasFiles(join(dir, "starter")),
  );
  outstanding.push({
    kind: "challenges",
    done: challengeDirs.length - challengesOwed.length,
    total: challengeDirs.length,
    ids: challengesOwed.map((c) => c.id),
  });

  /* --- citation bookkeeping --- */
  const sourcesPath = join(topicDir, "sources.json");
  const sources = existsSync(sourcesPath) ? sourcesFileSchema.safeParse(readJsonFile(sourcesPath)) : undefined;
  const allRefs = sources?.success ? excerptRefs(sources.data) : [];
  const cited = new Set<string>();
  const citedBy = new Map<string, Set<string>>();
  for (const { id, path } of chapterFiles) {
    const own = new Set<string>();
    citedBy.set(id, own);
    if (!existsSync(path)) continue;
    for (const match of readFileSync(path, "utf8").matchAll(MARKER)) {
      cited.add(`${match[1]}.${match[2]}`);
      own.add(`${match[1]}.${match[2]}`);
    }
  }
  const allocated = new Set(plan?.chapters.flatMap((c) => c.cites) ?? []);

  // Allocation is a promise the chapter has to keep. Nothing else checks that a
  // chapter cited its own excerpts rather than someone else's.
  const missingCitations = (plan?.chapters ?? [])
    .map((chapter) => ({
      chapter: chapter.id,
      refs: chapter.cites.filter((ref) => !citedBy.get(chapter.id)?.has(ref)),
    }))
    .filter((entry) => entry.refs.length > 0);

  const map = {
    draft: existsSync(paths.planDraft(root, slug)),
    approved: existsSync(paths.planApproved(root, slug)),
  };

  const status: Status = {
    slug,
    stage: state?.stage ?? "unknown",
    map,
    outstanding,
    excerpts: {
      total: allRefs.length,
      uncited: allRefs.filter((ref) => !cited.has(ref)),
      unallocated: plan ? allRefs.filter((ref) => !allocated.has(ref)) : [],
    },
    missingCitations,
    next: nextStep(state?.stage, outstanding, map, missingCitations.length > 0),
  };
  return status;
}

/**
 * The stage cursor alone cannot separate "no map yet" from "map written, waiting on
 * the owner" from "approved but not applied", because approval happens outside this
 * tool. The two plan files are what distinguish them, so `next` reads those.
 */
function nextStep(
  stage: Stage | undefined,
  outstanding: Outstanding[],
  map: { draft: boolean; approved: boolean },
  citationsMissing: boolean,
): string {
  const owed = (kind: string) => outstanding.find((o) => o.kind === kind)?.ids.length ?? 0;
  if (!stage || stage === "init") return "run the research stage";
  if (!map.approved) {
    if (!map.draft) return "run the map stage";
    return "map.json is written and unapproved; ask the owner to approve it, then run: npm run forge -- apply <slug>";
  }
  if (stage === "research" || stage === "map") return "run: npm run forge -- apply <slug>";
  if (owed("chapters") || owed("quizzes")) return "run the chapters stage";
  if (citationsMissing) return "some chapters do not cite their allocated excerpts; send those chapters back";
  if (owed("challenges")) return "run the challenges stage";
  if (stage !== "verify" && stage !== "validated") {
    return "run: npm run validate -- topics/<slug> --strict, then the verify stage";
  }
  return "run the verify stage: npm run forge -- verify <slug> to see what is still owed";
}

function readApprovedPlan(root: string, slug: string): TopicPlan | undefined {
  const path = paths.planApproved(root, slug);
  if (!existsSync(path)) return undefined;
  const parsed = topicPlanSchema.safeParse(readJsonFile(path));
  return parsed.success ? parsed.data : undefined;
}

function listChapterFiles(topicDir: string): Array<{ id: string; path: string }> {
  const dir = join(topicDir, "chapters");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^ch\d{2}-.+\.md$/.test(f))
    .sort()
    .map((f) => ({ id: f.slice(0, 4), path: join(dir, f) }));
}

function hasFiles(dir: string): boolean {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return false;
  return readdirSync(dir).some((entry) => !entry.startsWith("."));
}

/* ------------------------------------------------------------------ check */

export type CheckResult = {
  path: string;
  problems: string[];
  chapters: number;
  challenges: number;
  concepts: number;
  allocated: number;
  unallocated: string[];
};

/**
 * Rules on a map without applying it, so a broken plan is caught before the owner
 * is asked to approve one. Reads the draft by default; the approval gate is the
 * copy from `map.json` to `map.approved.json`, and only a human makes it.
 */
export function checkPlanFile(root: string, slug: string, approved = false): CheckResult {
  const path = approved ? paths.planApproved(root, slug) : paths.planDraft(root, slug);
  const empty = { path, chapters: 0, challenges: 0, concepts: 0, allocated: 0, unallocated: [] };
  if (!existsSync(path)) return { ...empty, problems: [`${path} does not exist`] };

  const parsed = topicPlanSchema.safeParse(readJsonFile(path));
  if (!parsed.success) {
    return {
      ...empty,
      problems: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const plan = parsed.data;
  const problems = plan.slug === slug ? [] : [`slug "${plan.slug}" does not match topics/${slug}`];
  problems.push(...checkPlan(plan));

  // Every excerpt research produced has to end up owned by a chapter, or it is
  // reading that was done and then dropped on the floor.
  const sourcesPath = join(paths.topicDir(root, slug), "sources.json");
  const sources = existsSync(sourcesPath) ? sourcesFileSchema.safeParse(readJsonFile(sourcesPath)) : undefined;
  const allocated = new Set(plan.chapters.flatMap((c) => c.cites));
  const unallocated = sources?.success ? excerptRefs(sources.data).filter((ref) => !allocated.has(ref)) : [];
  const known = new Set(sources?.success ? excerptRefs(sources.data) : []);
  if (known.size) {
    for (const ref of allocated) {
      if (!known.has(ref)) problems.push(`chapter cites ${ref}, which is not in sources.json`);
    }
  }
  // The contract requires every excerpt to be cited by some chapter. If the map
  // leaves one unowned, that error is guaranteed before a word is written, so it
  // is a problem here rather than a note the owner has to notice.
  for (const ref of unallocated) {
    problems.push(`no chapter is responsible for excerpt ${ref}`);
  }

  return {
    path,
    problems,
    chapters: plan.chapters.length,
    challenges: plan.challenges.length,
    concepts: plan.concepts.length,
    allocated: allocated.size,
    unallocated,
  };
}

/* --------------------------------------------------------------- progress */

/**
 * Creates a valid empty progress file, or leaves an existing one alone. The Teacher
 * could write this itself, but a file shape is exactly the thing a program should
 * own — a malformed progress file is a broken session, not a broken sentence.
 */
export function initProgress(root: string, slug: string, now = new Date().toISOString()): boolean {
  const path = join(paths.topicDir(root, slug), ".state", "progress.json");
  if (existsSync(path)) return false;
  writeIfChanged(
    path,
    json({
      contractVersion: CONTRACT_VERSION,
      topic: slug,
      updated: now,
      chapters: {},
      weakConcepts: [],
      challenges: {},
    }),
  );
  return true;
}

/* ------------------------------------------------------------ evaluation */

export type MetricRow = {
  name: string;
  value: number | undefined;
  threshold: number;
  direction: "gte" | "lte";
  ok: boolean;
};

export type EvalResult = {
  challenge: string;
  against: "work" | "reference";
  staged: string;
  command: string;
  ran: boolean;
  passed: boolean;
  metrics: MetricRow[];
  output: string;
  problems: string[];
};

/**
 * Bounds on an evaluation run. Node's default `maxBuffer` is 1 MiB, and an evaluation
 * set that prints past it is killed with its output truncated, which reads exactly like
 * an evaluation set that forgot to print its metrics. The timeout is the only thing
 * bounding a submission that loops forever.
 */
const RUN_LIMITS = {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
  timeout: 10 * 60 * 1000,
} as const;

/**
 * Vitest's entry script, resolved from this file rather than from the process cwd.
 *
 * Running it as `npx vitest` was wrong twice. `npx` installs on a miss, so a checkout
 * without its dependencies reaches for the network mid-evaluation and reports whatever
 * npm says as a defect in the evaluation set. And resolution followed the cwd, so the
 * version that ran depended on where the command was typed. Resolving from
 * `import.meta.url` pins it to the Forge's own dependency, which is the one the contract
 * means when it says `vitest`.
 */
function vitestEntry(): string | undefined {
  try {
    const pkgPath = createRequire(import.meta.url).resolve("vitest/package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      bin?: string | Record<string, string>;
    };
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.["vitest"];
    return bin ? join(dirname(pkgPath), bin) : undefined;
  } catch {
    return undefined;
  }
}

const METRIC = /^\s*metric\s+(\S+)\s+(-?\d+(?:\.\d+)?)\s*$/;

/** Vitest labels captured output with the file that produced it. */
const STDOUT_HEADER = /^std(?:out|err)\s*\|\s*(\S+)/;

/**
 * Pull `metric <name> <value>` lines out of a run's output, keeping only the ones the
 * challenge's own evaluation set printed.
 *
 * Attribution matters because the output is one merged stream. A sweep of the whole
 * thing takes the last occurrence of each name, so a metric line from anywhere else in
 * the run silently becomes this challenge's score. That is worse than an error: it
 * reports a plausible wrong number, and which number wins depends on file scheduling.
 *
 * A line before any header is kept. The `node` runner spawns one process for one spec
 * and labels nothing, so unattributed output there belongs to the spec by construction.
 */
export function parseMetrics(output: string, specFile: string): Map<string, number> {
  const reported = new Map<string, number>();
  let attributed: string | undefined;
  for (const line of output.split("\n")) {
    const header = STDOUT_HEADER.exec(line);
    if (header?.[1]) {
      attributed = header[1];
      continue;
    }
    const metric = METRIC.exec(line);
    if (!metric?.[1] || metric[2] === undefined) continue;
    if (attributed !== undefined && basename(attributed) !== specFile) continue;
    reported.set(metric[1], Number(metric[2]));
  }
  return reported;
}

/**
 * Runs a challenge's held-out evaluation set against its own reference solution.
 *
 * This is the step that turns "the challenge is solvable" from an assertion into a
 * fact. It cannot be done in place: the eval set imports the entrypoint under
 * `work/`, `work/` belongs to the learner and must stay empty, and the reference
 * lives in `.hidden/solution/`. So a mini topic is staged under `.forge-cache/`,
 * mirroring the real layout closely enough that every relative path in the eval set
 * resolves the same way it will for a learner.
 */
export function evalChallenge(
  root: string,
  slug: string,
  challengeId: string,
  againstReference = false,
): EvalResult {
  const topicDir = paths.topicDir(root, slug);
  const challengesDir = join(topicDir, "challenges");
  const dirName = existsSync(challengesDir)
    ? readdirSync(challengesDir).find((name) => name.startsWith(`${challengeId}-`))
    : undefined;
  const against = againstReference ? ("reference" as const) : ("work" as const);
  const blank = {
    challenge: challengeId,
    against,
    staged: "",
    command: "",
    ran: false,
    passed: false,
    metrics: [],
    output: "",
  };
  if (!dirName) return { ...blank, problems: [`no challenge directory for ${challengeId} under ${challengesDir}`] };

  const source = join(challengesDir, dirName);
  const manifest = challengeManifestSchema.safeParse(readJsonFile(join(source, "challenge.json")));
  if (!manifest.success) {
    return {
      ...blank,
      problems: manifest.error.issues.map((i) => `challenge.json: ${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const challenge = manifest.data;
  const referenceRel = referenceEntrypoint(challenge.interface.entrypoint);

  // Where the code under test comes from. The reference has to sit at the mirrored
  // path; the learner's is simply their work tree.
  const from = againstReference ? join(source, paths.reference()) : join(source, "work");
  const entrypointAt = againstReference
    ? join(source, referenceRel)
    : join(source, challenge.interface.entrypoint);
  if (!existsSync(entrypointAt)) {
    return {
      ...blank,
      problems: [
        againstReference
          ? `the reference solution must place ${referenceRel}, because the evaluation set imports ${challenge.interface.entrypoint}`
          : `nothing at ${challenge.interface.entrypoint}; the submission has to implement the interface the brief pins`,
      ],
    };
  }
  const specPath = join(source, challenge.eval.spec);
  if (isStub(readFileSync(specPath, "utf8"))) {
    return { ...blank, problems: [`${specPath} is still a stub`] };
  }
  if (againstReference && isStub(readFileSync(entrypointAt, "utf8"))) {
    return { ...blank, problems: [`${entrypointAt} is still a stub`] };
  }

  /* --- stage a mini topic: <try>/challenges/<dir>/ plus a corpus alongside --- */
  const stageRoot = paths.tryDir(root, slug);
  const staged = join(stageRoot, "challenges", dirName);
  rmSync(stageRoot, { recursive: true, force: true });
  mkdirSync(staged, { recursive: true });

  // Only the evaluation set is staged, never `.hidden/solution/`. When the thing being
  // scored is a learner's submission, copying the reference into the same tree would
  // leave a working answer sitting at a predictable path beside their code, and nothing
  // forces an evaluation set to import `work/` rather than whatever is nearest.
  cpSync(join(source, ".hidden", "eval"), join(staged, ".hidden", "eval"), { recursive: true });

  // `work/` is the starter plus the code under test, in that order, because that is what
  // a learner's work tree is: the brief tells them to copy the starter in and build from
  // it. Staging the reference on its own would fail any reference that imports a module
  // the starter provides, and would fail it as "the challenge is unsolvable".
  const stagedWork = join(staged, "work");
  if (existsSync(join(source, "starter"))) {
    cpSync(join(source, "starter"), stagedWork, { recursive: true });
    cpSync(join(source, "starter"), join(staged, "starter"), { recursive: true });
  }
  cpSync(from, stagedWork, { recursive: true, force: true });

  if (existsSync(join(topicDir, "corpus"))) {
    cpSync(join(topicDir, "corpus"), join(stageRoot, "corpus"), { recursive: true });
  }

  /* --- run it --- */
  const spec = join(staged, challenge.eval.spec);
  let command: string;
  let run;
  if (challenge.eval.runner === "vitest") {
    // Two things this config has to do. Vitest's default include matches *.test.ts and
    // *.spec.ts, neither of which an eval set is, so the include is what lets the
    // held-out set keep the .eval.ts name the contract gives it. And `root` pins the
    // search to the staging tree: without it vitest roots at the process cwd and
    // collects every *.eval.ts in the repository, including the un-staged original,
    // which then runs against the learner's empty work/ and fails the whole run no
    // matter how the code under test scored.
    // A plain object, not `defineConfig`, and `.mjs` rather than `.ts`. defineConfig is
    // a types helper that does nothing at runtime, and importing it would make this
    // generated file depend on resolving `vitest/config` from the staging tree, which is
    // a directory that exists to hold a copy of somebody's homework.
    const configPath = join(stageRoot, "vitest.config.mjs");
    writeIfChanged(
      configPath,
      `export default {\n` +
        `  root: ${JSON.stringify(stageRoot)},\n` +
        `  test: { root: ${JSON.stringify(stageRoot)}, include: ["**/*.eval.ts"] },\n` +
        `};\n`,
    );
    const entry = vitestEntry();
    if (!entry) {
      return {
        ...blank,
        staged,
        problems: [
          `the challenge declares the vitest runner, and vitest is not resolvable from this checkout. Run npm install.`,
        ],
      };
    }
    command = `node ${entry} run --config ${configPath} --root ${stageRoot}`;
    run = spawnSync("node", [entry, "run", "--config", configPath, "--root", stageRoot], {
      cwd: stageRoot,
      ...RUN_LIMITS,
    });
  } else if (challenge.eval.runner === "python") {
    // `python3` and nothing else. The metric protocol is a line on stdout, so a test
    // framework's assertions and reporting sit outside the only channel the scorer reads,
    // and requiring one would mean a fresh clone of this repo could not run its own
    // fixture. Same cwd as the node branch, so a spec that puts `work` on sys.path
    // resolves it the way a TypeScript spec resolves its relative import.
    command = `python3 ${spec}`;
    run = spawnSync("python3", [spec], { cwd: staged, ...RUN_LIMITS });
  } else {
    command = `node ${spec}`;
    run = spawnSync("node", [spec], { cwd: staged, ...RUN_LIMITS });
  }
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();

  /* --- read the metrics back out --- */
  const reported = parseMetrics(output, basename(spec));
  const metrics: MetricRow[] = challenge.eval.metrics.map((declared) => {
    const value = reported.get(declared.name);
    return {
      name: declared.name,
      value,
      threshold: declared.threshold,
      direction: declared.direction,
      ok:
        value !== undefined &&
        (declared.direction === "gte" ? value >= declared.threshold : value <= declared.threshold),
    };
  });

  // Three failures that look alike in the output and are not alike at all. Reporting a
  // spawn failure or a kill as "your evaluation set printed no metrics" blames the
  // author for a problem in the tooling, which is how a 1 MiB output limit gets
  // diagnosed as a missing console.log.
  const problems: string[] = [];
  if (run.error) {
    problems.push(`the evaluation set could not be run: ${run.error.message}`);
  } else if (run.signal) {
    problems.push(
      `the evaluation set was killed by ${run.signal}. It either ran past the ${
        RUN_LIMITS.timeout / 1000
      } second limit or printed more than ${RUN_LIMITS.maxBuffer / (1024 * 1024)} MiB.`,
    );
  } else {
    const missing = metrics.filter((m) => m.value === undefined).map((m) => m.name);
    if (missing.length) {
      problems.push(
        `the evaluation set reported no value for: ${missing.join(", ")}. It must print one "metric <name> <value>" line per declared metric.`,
      );
    }
  }

  return {
    challenge: challengeId,
    against,
    staged,
    command,
    // Started, and exited on its own terms. A process that never spawned and one the
    // kernel killed both used to report the same way, which is what let a kill be
    // misattributed to the evaluation set.
    ran: run.error === undefined && run.status !== null,
    passed: run.status === 0 && metrics.every((m) => m.ok),
    metrics,
    output,
    problems,
  };
}

/* ---------------------------------------------------------------- promote */

export type PromoteResult = { promoted: boolean; errors: number; warnings: number };

/**
 * Moves `draft` to `validated`, and only that. `validated` means the validator
 * passed under `--strict`, so the promotion runs the validator rather than taking
 * anyone's word for it. `verified` is the verification agents' to give, not this
 * function's.
 */
export function promoteToValidated(root: string, slug: string): PromoteResult {
  const report = validateTopic(paths.topicDir(root, slug), true);
  if (report.errors.length || report.warnings.length) {
    return { promoted: false, errors: report.errors.length, warnings: report.warnings.length };
  }
  const path = join(paths.topicDir(root, slug), "topic.json");
  const manifest = readJsonFile(path) as Record<string, unknown>;
  if (manifest.status === "verified") return { promoted: false, errors: 0, warnings: 0 };
  manifest.status = "validated";
  writeIfChanged(path, json(manifest));
  return { promoted: true, errors: 0, warnings: 0 };
}

/* ----------------------------------------------------------------- verify */

export type ChapterVerdictRow = {
  chapter: string;
  faithfulness: "pass" | "fail" | "pending";
  critique: "pass" | "fail" | "pending";
  claims: number;
  blocking: number;
  status: "draft" | "verified";
};

export type VerifyResult = {
  chapters: ChapterVerdictRow[];
  topicStatus: string;
  stamped: string[];
  problems: string[];
};

/**
 * Stamps the verification agents' rulings into chapter frontmatter.
 *
 * The agents write one JSON file per chapter under `.forge-cache/<slug>/verdicts/`, this
 * reads them and writes the audit block. Two reasons it works that way rather than
 * letting an agent edit frontmatter directly. Frontmatter is the CLI's to write, which is
 * the rule the whole generator is built on. And a file per chapter per agent means a dead
 * auditor costs one chapter, and running this again over what is already on disk is safe.
 *
 * Every number in the audit block is derived here from the rulings, and so is the
 * faithfulness verdict. An auditor cannot write "pass" over a chapter with an unsupported
 * claim in it, because it never gets to write the word.
 */
export function recordVerdicts(root: string, slug: string, clock: Clock = systemClock): VerifyResult {
  const topicDir = paths.topicDir(root, slug);
  const problems: string[] = [];
  const stamped: string[] = [];
  const rows: ChapterVerdictRow[] = [];

  const plan = readApprovedPlan(root, slug);
  const chapterFiles = plan
    ? plan.chapters.map((c) => ({ id: c.id, path: join(topicDir, paths.chapterFile(c)) }))
    : listChapterFiles(topicDir);

  // Marker to the passage it resolves to, so a quoted span can be checked against the
  // source it says it came from.
  const excerpts = new Map<string, string>();
  const sourcesPath = join(topicDir, "sources.json");
  if (existsSync(sourcesPath)) {
    const sources = sourcesFileSchema.safeParse(readJsonFile(sourcesPath));
    if (sources.success) {
      for (const source of sources.data.sources) {
        for (const excerpt of source.excerpts) {
          excerpts.set(`${source.id}.${excerpt.key}`, excerpt.quote);
        }
      }
    } else {
      problems.push("sources.json does not parse, so no quoted span can be checked");
    }
  }

  for (const { id, path } of chapterFiles) {
    if (!existsSync(path)) {
      problems.push(`${id}: no chapter file at ${path}`);
      continue;
    }
    const split = splitFrontmatter(readFileSync(path, "utf8"));
    if (!split) {
      problems.push(`${id}: chapter has no frontmatter`);
      continue;
    }

    const auditPath = paths.auditFile(root, slug, id);
    const critiquePath = paths.critiqueFile(root, slug, id);

    let faithfulness: Record<string, unknown> | undefined;
    let claims = 0;
    if (existsSync(auditPath)) {
      const parsed = chapterAuditSchema.safeParse(readJsonFile(auditPath));
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          problems.push(`${id}.audit.json: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
        }
      } else if (parsed.data.chapter !== id) {
        problems.push(`${id}.audit.json: reports on chapter ${parsed.data.chapter}`);
      } else {
        // Every quoted span is checked against the excerpt it claims to come from. This
        // is the one judge failure the literature says is worst for us: fabricated
        // citations flip a reported 12 to 29 percent of verdicts, and a model asked to
        // quote a supporting passage will supply a fluent one whether or not it exists.
        // Asking it not to is a prompt. Checking is arithmetic.
        const forged = parsed.data.claims.filter((claim) => {
          if (claim.quote === NOTHING_FOUND) return false;
          if (!claim.ref) return false;
          const excerpt = excerpts.get(claim.ref);
          if (excerpt === undefined) return true;
          return !loose(excerpt).includes(loose(claim.quote));
        });
        for (const claim of forged) {
          const known = claim.ref !== undefined && excerpts.has(claim.ref);
          problems.push(
            known
              ? `${id}.audit.json: the span quoted for "${claim.claim.slice(0, 60)}..." does not appear in ${claim.ref}`
              : `${id}.audit.json: "${claim.claim.slice(0, 60)}..." cites ${claim.ref ?? "no excerpt"}, which is not in sources.json`,
          );
        }
        if (forged.length === 0) {
          const tally = (ruling: string) =>
            parsed.data.claims.filter((claim) => claim.ruling === ruling).length;
          claims = parsed.data.claims.length;
          const supported = tally("supported");
          faithfulness = {
            // Derived, not reported. Every claim supported or there is no pass.
            verdict: supported === claims ? "pass" : "fail",
            at: parsed.data.auditedAt,
            claims,
            supported,
            unsupported: tally("unsupported"),
            overstated: tally("overstated"),
            contradicted: tally("contradicted"),
            unreachable: tally("unreachable"),
          };
        }
      }
    }

    let critique: Record<string, unknown> | undefined;
    let blocking = 0;
    if (existsSync(critiquePath)) {
      const parsed = chapterCritiqueSchema.safeParse(readJsonFile(critiquePath));
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          problems.push(`${id}.critique.json: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
        }
      } else if (parsed.data.chapter !== id) {
        problems.push(`${id}.critique.json: reports on chapter ${parsed.data.chapter}`);
      } else {
        blocking = parsed.data.findings.filter((f) => f.severity === "blocking").length;
        const advisory = parsed.data.findings.length - blocking;
        critique = {
          verdict: blocking === 0 ? "pass" : "fail",
          at: parsed.data.auditedAt,
          ...(parsed.data.findings.length
            ? { notes: `${blocking} blocking, ${advisory} advisory` }
            : {}),
        };
      }
    }

    const passed =
      faithfulness?.["verdict"] === "pass" && critique?.["verdict"] === "pass";
    rows.push({
      chapter: id,
      faithfulness: (faithfulness?.["verdict"] as ChapterVerdictRow["faithfulness"]) ?? "pending",
      critique: (critique?.["verdict"] as ChapterVerdictRow["critique"]) ?? "pending",
      claims,
      blocking,
      status: passed ? "verified" : "draft",
    });

    // Nothing to stamp until both agents have ruled. A half-audited chapter keeps
    // whatever it had, so a partial pass cannot look like a finished one.
    if (faithfulness === undefined || critique === undefined) continue;

    const { audit: _dropped, ...rest } = split.frontmatter;
    const frontmatter: Record<string, unknown> = { ...rest, status: passed ? "verified" : "draft" };
    const text = `${frontmatterBlock(frontmatter, { audit: { faithfulness, critique } })}\n${split.body.replace(/^\n+/, "")}`;
    if (writeIfChanged(path, text)) stamped.push(relative(root, path));
  }

  /* --- the topic's own status --- */
  const manifestPath = join(topicDir, "topic.json");
  let topicStatus = "draft";
  if (existsSync(manifestPath)) {
    const manifest = readJsonFile(manifestPath) as Record<string, unknown>;
    topicStatus = String(manifest["status"] ?? "draft");
    const everyChapterVerified = rows.length > 0 && rows.every((row) => row.status === "verified");
    if (everyChapterVerified && topicStatus === "validated") {
      manifest["status"] = "verified";
      writeIfChanged(manifestPath, json(manifest));
      topicStatus = "verified";
    } else if (everyChapterVerified && topicStatus === "draft") {
      // Statuses move in one direction and verified sits above validated. A topic that
      // never passed the validator does not skip it because two agents liked the prose.
      problems.push(
        "every chapter is verified, but the topic is still draft; run npm run forge -- promote <slug> first",
      );
    }
  }

  recordStage(root, slug, "verify", `${rows.filter((r) => r.status === "verified").length}/${rows.length} chapters verified`, clock);
  return { chapters: rows, topicStatus, stamped, problems };
}

/**
 * Whitespace-insensitive, case-insensitive text, for comparing a quoted span against the
 * passage it came from. An auditor that re-wraps a quote across lines has still quoted
 * it; one that paraphrases has not, and this still catches that.
 */
function loose(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}
