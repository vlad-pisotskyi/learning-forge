/**
 * Checks a generated topic against contract/TOPIC-CONTRACT.md.
 * The CLI wrapper is validate-topic.ts; this module is what the tests import.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { isStub, referenceEntrypoint } from "./forge-plan.ts";
import {
  ALLOW_HEDGE,
  HEDGES,
  MARKER,
  MIN_CHAPTER_WORDS,
  ROLE_SKILLS,
  WORDS_PER_MARKER,
  challengeManifestSchema,
  chapterFrontmatterSchema,
  conceptsFileSchema,
  progressFileSchema,
  quizFileSchema,
  quizKeyFileSchema,
  quizKeyPath,
  sourcesFileSchema,
  topicManifestSchema,
  type ChallengeManifest,
  type ChapterFrontmatter,
} from "./contract.ts";

export type Level = "error" | "warn";
export type Finding = { level: Level; where: string; message: string };

export class Report {
  readonly findings: Finding[] = [];
  error(where: string, message: string) {
    this.findings.push({ level: "error", where: this.rel(where), message });
  }
  warn(where: string, message: string) {
    this.findings.push({ level: "warn", where: this.rel(where), message });
  }
  private rel(where: string) {
    return where.startsWith("/") ? relative(process.cwd(), where) : where;
  }
  get errors() {
    return this.findings.filter((f) => f.level === "error");
  }
  get warnings() {
    return this.findings.filter((f) => f.level === "warn");
  }
}

/* ------------------------------------------------------------------ helpers */

function readJson(report: Report, path: string): unknown | undefined {
  if (!existsSync(path)) {
    report.error(path, "missing required file");
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    report.error(path, `not valid JSON: ${(err as Error).message}`);
    return undefined;
  }
}

function check<T>(
  report: Report,
  path: string,
  schema: z.ZodType<T>,
  data: unknown,
): T | undefined {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  for (const issue of parsed.error.issues) {
    const at = issue.path.length ? issue.path.join(".") : "(root)";
    report.error(path, `${at}: ${issue.message}`);
  }
  return undefined;
}

function splitFrontmatter(
  raw: string,
): { frontmatter: unknown; body: string } | undefined {
  if (!raw.startsWith("---\n")) return undefined;
  const end = raw.indexOf("\n---", 4);
  if (end === -1) return undefined;
  const head = raw.slice(4, end);
  const afterFence = raw.indexOf("\n", end + 1);
  const body = afterFence === -1 ? "" : raw.slice(afterFence + 1);
  return {
    frontmatter: parseYaml(head),
    body,
    };
}

/** Fenced code is never prose: strip it before any prose-level check. */
function stripFences(text: string): string {
  return text.replace(/^ {0,3}(```|~~~)[\s\S]*?^ {0,3}\1[^\n]*$/gm, "");
}

function stripBlockquotes(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s{0,3}>/.test(line))
    .join("\n");
}

/**
 * The three AI-writing tells that a program can catch without judgement.
 *
 * Everything else on that list, forced triads, inflated significance, participle
 * padding, is a judgement call and belongs to the writer and the critique agent.
 * These three are literal characters, so they are checked here instead of trusted.
 *
 * Warnings rather than errors on purpose: `--strict` promotes them, and the
 * generator and `forge promote` both run strict, so new material is blocked either
 * way without invalidating anything already on disk.
 */
function checkProseStyle(report: Report, file: string, raw: string) {
  // Quoted source text is someone else's wording, and code is not prose.
  const prose = stripBlockquotes(stripFences(raw));

  const dashes = (prose.match(/[—–]/g) ?? []).length;
  if (dashes) {
    report.warn(
      file,
      `${dashes} em or en dash(es) in prose; use a period, comma, colon, or parentheses instead`,
    );
  }
  const curly = (prose.match(/[“”]/g) ?? []).length;
  if (curly) {
    report.warn(file, `${curly} curly quotation mark(s); use straight quotes`);
  }
  const emoji = (prose.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  if (emoji) {
    report.warn(file, `${emoji} emoji in prose; teaching material does not decorate`);
  }
}

function countWords(text: string): number {
  return (text.match(/\b[\p{L}\p{N}][\p{L}\p{N}'’-]*\b/gu) ?? []).length;
}

function isNonEmptyDir(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory() && readdirSync(path).length > 0;
}

function listFiles(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .sort();
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/**
 * A path under `corpus/` named by a challenge file. At least one segment has to follow
 * the directory name, so prose that mentions `corpus/` without naming a file in it is
 * not a reference and is not checked.
 *
 * Each segment is built as name-then-extensions rather than as a character class
 * containing `.`, so a path ending a sentence does not swallow the full stop. Writing
 * it the loose way reported `corpus/rows.json.` as missing, which is a false error
 * against a file that is there.
 */
const CORPUS_REF = /(?<![\w-])corpus(?:\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)+/g;

/* ---------------------------------------------------------------- the checks */

type Chapter = {
  id: string;
  file: string;
  frontmatter: ChapterFrontmatter;
  body: string;
};

function loadChapters(report: Report, topicDir: string): Chapter[] {
  const dir = join(topicDir, "chapters");
  const chapters: Chapter[] = [];
  for (const name of listFiles(dir, ".md")) {
    const file = join(dir, name);
    const match = /^(ch\d{2})-([a-z0-9-]+)\.md$/.exec(name);
    if (!match) {
      report.error(file, "filename must be <chapterId>-<slug>.md, e.g. ch01-what-is-retrieval.md");
      continue;
    }
    const split = splitFrontmatter(readFileSync(file, "utf8"));
    if (!split) {
      report.error(file, "missing YAML frontmatter delimited by --- lines");
      continue;
    }
    const frontmatter = check(report, file, chapterFrontmatterSchema, split.frontmatter);
    if (!frontmatter) continue;
    if (frontmatter.id !== match[1]) {
      report.error(file, `frontmatter id "${frontmatter.id}" does not match filename prefix "${match[1]}"`);
      continue;
    }
    chapters.push({
      id: frontmatter.id,
      file,
      frontmatter,
      body: split.body,
    });
  }
  return chapters;
}

function checkChapterBody(report: Report, chapter: Chapter) {
  checkProseStyle(report, chapter.file, chapter.body);
  const prose = stripFences(chapter.body);
  const words = countWords(stripBlockquotes(prose));

  if (words < MIN_CHAPTER_WORDS) {
    report.error(chapter.file, `${words} words of prose; the floor is ${MIN_CHAPTER_WORDS}`);
  }

  const headings = (prose.match(/^##\s+\S/gm) ?? []).length;
  if (headings < 2) {
    report.error(chapter.file, `${headings} "##" heading(s); a chapter needs at least 2`);
  }

  MARKER.lastIndex = 0;
  const markerCount = [...prose.matchAll(MARKER)].length;
  const required = Math.max(1, Math.floor(words / WORDS_PER_MARKER));
  if (markerCount < required) {
    report.error(
      chapter.file,
      `${markerCount} citation marker(s) for ${words} words; at 1 per ${WORDS_PER_MARKER} words this chapter needs ${required}`,
    );
  }

  // Hedging, paragraph by paragraph so an allow-hedge escape stays local.
  const scannable = stripBlockquotes(prose);
  for (const paragraph of scannable.split(/\n\s*\n/)) {
    const escape = ALLOW_HEDGE.exec(paragraph);
    if (escape) {
      if (!escape[1]) {
        report.error(chapter.file, "allow-hedge comment carries no reason");
      }
      continue;
    }
    for (const hedge of HEDGES) {
      const pattern = new RegExp(`\\b${hedge.replace(/ /g, "\\s+")}\\b`, "i");
      if (pattern.test(paragraph)) {
        const line = paragraph.split("\n")[0]?.slice(0, 70) ?? "";
        report.error(
          chapter.file,
          `hedge "${hedge}" in prose near: "${line}…" — state the fact, or say it is contested and cite both sides`,
        );
      }
    }
  }
}

export function validateTopic(topicDir: string, strictFlag: boolean): Report {
  const report = new Report();
  const dirSlug = basename(topicDir);

  /* --- manifest ---------------------------------------------------------- */
  const manifest = check(
    report,
    join(topicDir, "topic.json"),
    topicManifestSchema,
    readJson(report, join(topicDir, "topic.json")),
  );
  if (!manifest) return report;
  if (manifest.slug !== dirSlug) {
    report.error(join(topicDir, "topic.json"), `slug "${manifest.slug}" does not match directory name "${dirSlug}"`);
  }
  if (Date.parse(manifest.generatedAt) > Date.now()) {
    report.error(join(topicDir, "topic.json"), `generatedAt ${manifest.generatedAt} is in the future`);
  }

  const strict = strictFlag || manifest.status !== "draft";

  /* --- concepts and sources --------------------------------------------- */
  const concepts = check(
    report,
    join(topicDir, "concepts.json"),
    conceptsFileSchema,
    readJson(report, join(topicDir, "concepts.json")),
  );
  const sources = check(
    report,
    join(topicDir, "sources.json"),
    sourcesFileSchema,
    readJson(report, join(topicDir, "sources.json")),
  );

  const conceptIds = new Set(concepts?.concepts.map((c) => c.id) ?? []);
  if (concepts) {
    const seen = new Set<string>();
    for (const c of concepts.concepts) {
      if (seen.has(c.id)) report.error(join(topicDir, "concepts.json"), `duplicate concept id "${c.id}"`);
      seen.add(c.id);
    }
  }

  const excerptRefs = new Set<string>();
  if (sources) {
    const path = join(topicDir, "sources.json");
    const seenSources = new Set<string>();
    for (const source of sources.sources) {
      if (seenSources.has(source.id)) report.error(path, `duplicate source id "${source.id}"`);
      seenSources.add(source.id);
      if (Date.parse(source.retrieved) > Date.now()) {
        report.error(path, `${source.id}: retrieved ${source.retrieved} is in the future`);
      }
      if (!source.primary) {
        report.warn(path, `${source.id} is not a primary source; the sourcing rule prefers primary`);
      }
      if (source.kind === "paper" || source.kind === "book") {
        if (!source.authors?.length) report.error(path, `${source.id}: ${source.kind} needs authors`);
        if (!source.identifier) report.warn(path, `${source.id}: no DOI/arXiv identifier`);
      }
      const seenKeys = new Set<string>();
      for (const excerpt of source.excerpts) {
        if (seenKeys.has(excerpt.key)) report.error(path, `${source.id}: duplicate excerpt key "${excerpt.key}"`);
        seenKeys.add(excerpt.key);
        excerptRefs.add(`${source.id}.${excerpt.key}`);
      }
    }
  }

  /* --- chapters ---------------------------------------------------------- */
  const chapters = loadChapters(report, topicDir);
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const orderOf = new Map(manifest.chapters.map((id, i) => [id, i + 1]));

  for (const id of manifest.chapters) {
    if (!byId.has(id)) report.error(join(topicDir, "chapters"), `topic.json lists ${id} but no chapter file has that id`);
  }
  for (const chapter of chapters) {
    if (!orderOf.has(chapter.id)) {
      report.error(chapter.file, `chapter is not listed in topic.json.chapters; park drafts outside the topic directory`);
    }
  }
  {
    const seen = new Set<string>();
    for (const id of manifest.chapters) {
      if (seen.has(id)) report.error(join(topicDir, "topic.json"), `chapters lists ${id} twice`);
      seen.add(id);
    }
  }

  const conceptFirstTaught = new Map<string, number>();
  const conceptTeachCount = new Map<string, number>();

  for (const chapter of chapters) {
    const { frontmatter: fm, file } = chapter;
    const declaredOrder = orderOf.get(chapter.id);
    if (declaredOrder !== undefined && fm.order !== declaredOrder) {
      report.error(file, `order ${fm.order} but topic.json puts ${chapter.id} at position ${declaredOrder}`);
    }
    for (const required of fm.requires) {
      const requiredOrder = orderOf.get(required);
      if (requiredOrder === undefined) {
        report.error(file, `requires "${required}", which is not a chapter in this topic`);
      } else if (declaredOrder !== undefined && requiredOrder >= declaredOrder) {
        report.error(file, `requires "${required}", which comes at or after this chapter in the order`);
      }
    }
    for (const concept of fm.teaches) {
      if (!conceptIds.has(concept)) {
        report.error(file, `teaches "${concept}", which is not in concepts.json`);
        continue;
      }
      conceptTeachCount.set(concept, (conceptTeachCount.get(concept) ?? 0) + 1);
      const at = declaredOrder ?? fm.order;
      conceptFirstTaught.set(concept, Math.min(conceptFirstTaught.get(concept) ?? at, at));
    }
    if (fm.status === "verified") {
      const audit = fm.audit;
      if (!audit) {
        report.error(file, "status is verified but there is no audit block");
      } else {
        if (audit.faithfulness.verdict !== "pass") report.error(file, "status is verified but the faithfulness audit did not pass");
        if (audit.critique.verdict !== "pass") report.error(file, "status is verified but the critique did not pass");
        const f = audit.faithfulness;
        if (f.supported + f.unsupported + f.contradicted + f.unreachable !== f.claims) {
          report.error(file, `audit claim counts do not add up: ${f.supported}+${f.unsupported}+${f.contradicted}+${f.unreachable} ≠ ${f.claims}`);
        }
        if (f.unsupported > 0 || f.contradicted > 0 || f.unreachable > 0) {
          report.error(file, "faithfulness audit passed while recording unsupported, contradicted, or unreachable claims");
        }
      }
    }
    checkChapterBody(report, chapter);
  }

  for (const [concept, count] of conceptTeachCount) {
    if (count > 2) {
      report.warn(join(topicDir, "concepts.json"), `"${concept}" is taught by ${count} chapters; the chapter map probably never decided where it belongs`);
    }
  }
  for (const concept of conceptIds) {
    if (!conceptTeachCount.has(concept)) {
      report.error(join(topicDir, "concepts.json"), `"${concept}" is taught by no chapter`);
    }
  }

  /* --- citation markers -------------------------------------------------- */
  const citedExcerpts = new Set<string>();
  for (const chapter of chapters) {
    const prose = stripFences(chapter.body);
    MARKER.lastIndex = 0;
    for (const m of prose.matchAll(MARKER)) {
      const ref = `${m[1]}.${m[2]}`;
      citedExcerpts.add(ref);
      if (sources && !excerptRefs.has(ref)) {
        report.error(chapter.file, `citation marker {{${ref}}} resolves to nothing in sources.json`);
      }
    }
    // A stray `{{...}}` that is not a well-formed marker is a typo, not prose.
    for (const stray of prose.matchAll(/\{\{([^}]*)\}\}/g)) {
      if (!/^S\d{2,3}\.[a-z]{1,3}$/.test(stray[1] ?? "")) {
        report.error(chapter.file, `malformed citation marker {{${stray[1]}}}; expected {{S07.a}}`);
      }
    }
  }
  for (const ref of excerptRefs) {
    if (!citedExcerpts.has(ref)) {
      report.error(join(topicDir, "sources.json"), `excerpt ${ref} is cited by no chapter`);
    }
  }

  /* --- quizzes ----------------------------------------------------------- */
  const quizFiles = new Set(listFiles(join(topicDir, "quizzes"), ".json"));
  for (const chapter of chapters) {
    const quizPath = join(topicDir, chapter.frontmatter.quiz);
    const expected = `quizzes/${chapter.id}.quiz.json`;
    if (chapter.frontmatter.quiz !== expected) {
      report.error(chapter.file, `quiz path must be "${expected}"`);
    }
    quizFiles.delete(`${chapter.id}.quiz.json`);
    const quiz = check(report, quizPath, quizFileSchema, readJson(report, quizPath));
    if (!quiz) continue;
    if (quiz.chapter !== chapter.id) {
      report.error(quizPath, `chapter "${quiz.chapter}" does not match the owning chapter ${chapter.id}`);
    }
    if (quiz.passing.atLeast > quiz.questions.length) {
      report.error(quizPath, `passing.atLeast is ${quiz.passing.atLeast} but there are only ${quiz.questions.length} questions`);
    }
    const taught = new Set(chapter.frontmatter.teaches);
    const covered = new Set<string>();
    const seenQ = new Set<string>();
    for (const q of quiz.questions) {
      if (seenQ.has(q.id)) report.error(quizPath, `duplicate question id "${q.id}"`);
      seenQ.add(q.id);
      if (!taught.has(q.concept)) {
        report.error(quizPath, `${q.id} tests "${q.concept}", which ${chapter.id} does not teach`);
      }
      covered.add(q.concept);
    }
    for (const concept of taught) {
      if (!covered.has(concept)) report.error(quizPath, `no question covers "${concept}", which ${chapter.id} teaches`);
    }
    if (!quiz.questions.some((q) => q.kind !== "recall")) {
      report.error(quizPath, "every question is recall; add an application or discrimination question");
    }
    // The visible file is the one the Teacher reads. It must not point at the key.
    if (readFileSync(quizPath, "utf8").includes(".hidden")) {
      report.error(quizPath, "mentions .hidden; the visible quiz must not point at its answer key");
    }

    /* --- the answer key, which only the grader reads --- */
    const keyRelative = quizKeyPath(chapter.id);
    const keyPath = join(topicDir, keyRelative);
    const key = check(report, keyPath, quizKeyFileSchema, readJson(report, keyPath));
    if (!key) continue;
    if (key.chapter !== chapter.id) {
      report.error(keyPath, `chapter "${key.chapter}" does not match the owning chapter ${chapter.id}`);
    }
    // One answer per question, no extras. A key that has drifted from its quiz
    // grades the learner against questions nobody asked.
    const answered = new Set<string>();
    for (const a of key.answers) {
      if (answered.has(a.id)) report.error(keyPath, `duplicate answer for "${a.id}"`);
      answered.add(a.id);
      if (!seenQ.has(a.id)) report.error(keyPath, `answers "${a.id}", which the quiz does not ask`);
      for (const ref of a.sourceRefs ?? []) {
        if (sources && !excerptRefs.has(ref)) report.error(keyPath, `${a.id}: sourceRef ${ref} resolves to nothing`);
      }
    }
    for (const q of quiz.questions) {
      if (!answered.has(q.id)) report.error(keyPath, `no answer for question "${q.id}"`);
    }
  }
  for (const orphan of listFiles(join(topicDir, "quizzes", ".hidden"), ".json")) {
    const owner = orphan.replace(/\.key\.json$/, "");
    if (!chapters.some((c) => c.id === owner)) {
      report.error(join(topicDir, "quizzes", ".hidden", orphan), "answer key belongs to no chapter");
    }
  }
  for (const orphan of quizFiles) {
    report.error(join(topicDir, "quizzes", orphan), "quiz belongs to no chapter");
  }

  /* --- challenges -------------------------------------------------------- */
  const challengeDirs = existsSync(join(topicDir, "challenges"))
    ? readdirSync(join(topicDir, "challenges"), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : [];
  const foundChallengeIds = new Set<string>();

  for (const name of challengeDirs) {
    const dir = join(topicDir, "challenges", name);
    const match = /^(c\d{2})-([a-z0-9-]+)$/.exec(name);
    if (!match) {
      report.error(dir, "challenge directory must be named <challengeId>-<slug>, e.g. c01-lexical-search");
      continue;
    }
    const manifestPath = join(dir, "challenge.json");
    const challenge: ChallengeManifest | undefined = check(
      report,
      manifestPath,
      challengeManifestSchema,
      readJson(report, manifestPath),
    );
    if (!challenge) continue;
    if (challenge.id !== match[1]) {
      report.error(manifestPath, `id "${challenge.id}" does not match directory prefix "${match[1]}"`);
      continue;
    }
    foundChallengeIds.add(challenge.id);
    if (!manifest.challenges.includes(challenge.id)) {
      report.error(manifestPath, "challenge is not listed in topic.json.challenges");
    }
    if (challenge.language !== manifest.language) {
      report.warn(manifestPath, `language "${challenge.language}" differs from the topic's "${manifest.language}"`);
    }

    const afterOrder = orderOf.get(challenge.afterChapter);
    if (afterOrder === undefined) {
      report.error(manifestPath, `afterChapter "${challenge.afterChapter}" is not a chapter in this topic`);
    }
    for (const concept of challenge.exercises) {
      if (!conceptIds.has(concept)) {
        report.error(manifestPath, `exercises "${concept}", which is not in concepts.json`);
        continue;
      }
      const firstTaught = conceptFirstTaught.get(concept);
      if (firstTaught === undefined) continue;
      if (afterOrder !== undefined && firstTaught > afterOrder) {
        report.error(
          manifestPath,
          `exercises "${concept}", first taught in chapter position ${firstTaught}, but the challenge sits after position ${afterOrder}`,
        );
      }
    }

    for (const [label, rel] of [
      ["brief", challenge.brief],
      ["rubric", challenge.rubric],
      ["eval.spec", challenge.eval.spec],
    ] as const) {
      const path = join(dir, rel);
      if (!existsSync(path)) {
        report.error(path, `${label} does not exist`);
      } else if (statSync(path).size === 0) {
        report.error(path, `${label} is empty`);
      } else if (label !== "eval.spec") {
        checkProseStyle(report, path, readFileSync(path, "utf8"));
      }
    }
    if (!isNonEmptyDir(join(dir, challenge.reference))) {
      report.error(join(dir, challenge.reference), "reference solution is missing or empty");
    } else {
      // A non-empty directory was the whole of this check, which let a reference that
      // implements nothing pass while `forge eval --reference` was the only thing that
      // would have noticed. The mirrored entrypoint is the file the evaluation set
      // actually imports once the reference is staged.
      const referenceRel = referenceEntrypoint(challenge.interface.entrypoint);
      const referencePath = join(dir, referenceRel);
      if (!existsSync(referencePath)) {
        report.error(
          referencePath,
          `the reference must place ${referenceRel}, mirroring the entrypoint ${challenge.interface.entrypoint} that the evaluation set imports`,
        );
      } else if (isStub(readFileSync(referencePath, "utf8"))) {
        report.error(referencePath, "the reference entrypoint is still a stub");
      }
    }

    // An evaluation set that never reaches the learner's code cannot be scoring it. This
    // is the mechanical half of "the reference passes its own evaluation set"; the other
    // half is running it, which `forge eval --reference` does.
    const specPath = join(dir, challenge.eval.spec);
    if (existsSync(specPath) && statSync(specPath).size > 0) {
      const spec = readFileSync(specPath, "utf8");
      if (isStub(spec)) {
        report.error(specPath, "the evaluation set is still a stub");
      } else if (!spec.includes("work/")) {
        report.error(
          specPath,
          `does not import ${challenge.interface.entrypoint}, so it is not scoring the submission`,
        );
      }
      // Whether the metric is actually printed is settled by running the thing:
      // `forge eval` fails a challenge whose evaluation set reports no value for a
      // declared metric. So this asks the weaker question the source text can answer,
      // which is whether the evaluation set knows the metric exists at all. Matching
      // the literal `metric <name>` instead warned on every metric of a correct
      // evaluation set that printed them through a helper taking the name as an
      // argument, which is checking spelling rather than behaviour.
      for (const metric of challenge.eval.metrics) {
        if (!spec.includes(metric.name)) {
          report.warn(
            specPath,
            `never mentions the declared metric "${metric.name}", so it cannot be printing "metric ${metric.name} <value>" for the runner to read`,
          );
        }
      }
    }
    if (!isNonEmptyDir(join(dir, "starter"))) {
      report.warn(join(dir, "starter"), "no starter scaffolding");
    }
    if (isNonEmptyDir(join(dir, "work"))) {
      report.warn(join(dir, "work"), "learner work present; this directory is local-only and must stay gitignored");
    }

    // Nothing outside .hidden/ may point at what is inside it.
    for (const file of [join(dir, challenge.brief), join(dir, challenge.rubric), ...walk(join(dir, "starter"))]) {
      if (!existsSync(file) || statSync(file).isDirectory()) continue;
      if (readFileSync(file, "utf8").includes(".hidden")) {
        report.error(file, "mentions .hidden; learner-facing files must not point at hidden material");
      }
    }

    // A corpus is optional. A challenge whose input is an argument has nothing to load
    // from disk, and an empty corpus/ is the right state for that topic. What is not
    // optional is that a corpus file a challenge names actually exists, so the check is
    // on the reference rather than on the directory being non-empty.
    const corpusRefs = new Map<string, string>();
    for (const file of [
      join(dir, challenge.brief),
      join(dir, challenge.rubric),
      ...walk(join(dir, "starter")),
      ...walk(join(dir, dirname(challenge.eval.spec))),
    ]) {
      if (!existsSync(file) || statSync(file).isDirectory()) continue;
      for (const [ref] of readFileSync(file, "utf8").matchAll(CORPUS_REF)) {
        if (!corpusRefs.has(ref)) corpusRefs.set(ref, file);
      }
    }
    for (const [ref, file] of corpusRefs) {
      if (!existsSync(join(topicDir, ref))) {
        report.error(file, `names ${ref}, which does not exist`);
      }
    }
  }
  for (const id of manifest.challenges) {
    if (!foundChallengeIds.has(id)) {
      report.error(join(topicDir, "challenges"), `topic.json lists ${id} but no challenge directory has that id`);
    }
  }

  /* --- role skills ------------------------------------------------------- */
  for (const role of ROLE_SKILLS) {
    const path = join(topicDir, ".claude", "skills", role, "SKILL.md");
    if (!existsSync(path)) report.error(path, `the topic's ${role} skill is missing`);
  }

  /* --- progress (optional) ---------------------------------------------- */
  const progressPath = join(topicDir, ".state", "progress.json");
  if (existsSync(progressPath)) {
    const progress = check(report, progressPath, progressFileSchema, readJson(report, progressPath));
    if (progress) {
      if (progress.topic !== manifest.slug) report.error(progressPath, `topic "${progress.topic}" does not match "${manifest.slug}"`);
      for (const id of Object.keys(progress.chapters)) {
        if (!orderOf.has(id)) report.error(progressPath, `records chapter ${id}, which does not exist`);
      }
      for (const id of Object.keys(progress.challenges)) {
        if (!foundChallengeIds.has(id)) report.error(progressPath, `records challenge ${id}, which does not exist`);
      }
      for (const concept of progress.weakConcepts) {
        if (!conceptIds.has(concept)) report.error(progressPath, `weakConcepts names "${concept}", which is not a concept`);
      }
    }
  }

  /* --- topic status gate ------------------------------------------------- */
  if (manifest.status === "verified") {
    const unverified = chapters.filter((c) => c.frontmatter.status !== "verified").map((c) => c.id);
    if (unverified.length) {
      report.error(join(topicDir, "topic.json"), `status is verified but these chapters are not: ${unverified.join(", ")}`);
    }
  }

  if (strict) {
    for (const warning of report.warnings) warning.level = "error";
  }
  return report;
}
