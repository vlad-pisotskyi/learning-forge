/**
 * Proves the deterministic half of the generator writes a tree the validator
 * accepts.
 *
 * The load-bearing test is "a scaffolded topic plus the fixture's authored
 * content satisfies the contract". It derives its plan from the fixture and
 * overlays only the parts a model would write — chapter bodies, quizzes, briefs,
 * eval sets, corpus — keeping every scaffold-generated manifest and every piece
 * of frontmatter. So if the scaffold gets `order`, a quiz path, or a challenge
 * manifest wrong, that test fails and says where.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { sourcesFileSchema } from "../src/contract.ts";
import {
  PLAN_VERSION,
  paths,
  UNSTAMPED,
  referenceEntrypoint,
  topicPlanSchema,
  type TopicPlan,
} from "../src/forge-plan.ts";
import {
  applyPlan,
  checkPlanFile,
  initTopic,
  mergeSources,
  promoteToValidated,
  recordVerdicts,
  statusOf,
  evalChallenge,
  parseMetrics,
  initProgress,
} from "../src/forge-scaffold.ts";
import { validateTopic } from "../src/validate.ts";

const FIXTURE = new URL("../../contract/fixtures/tiny-topic", import.meta.url).pathname;
const SLUG = "tiny-topic";
const AT = "2026-08-01";
const clock = () => AT;
const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Indexed access with the bounds check every one of these cases would repeat. */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`nothing at index ${index}`);
  return item;
}

const REPO = new URL("../..", import.meta.url).pathname;
const TEMPLATES = new URL("../../.claude/skills/forge-generate/templates", import.meta.url).pathname;

/**
 * A temp repo root with the real role templates in place, so stamping is exercised
 * against the templates that actually ship rather than against fixtures of them.
 */
function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "forge-root-"));
  temps.push(root);
  cpSync(TEMPLATES, join(root, ".claude/skills/forge-generate/templates"), { recursive: true });
  // A real checkout has its dependencies installed, and the eval sets a challenge stages
  // import vitest by name. Symlinking rather than copying keeps makeRoot cheap.
  symlinkSync(join(REPO, "node_modules"), join(root, "node_modules"), "dir");
  return root;
}

function splitChapter(raw: string): { frontmatter: any; body: string } {
  const end = raw.indexOf("\n---", 4);
  const afterFence = raw.indexOf("\n", end + 1);
  return { frontmatter: parseYaml(raw.slice(4, end)), body: raw.slice(afterFence + 1) };
}

/**
 * The plan the fixture would have come from. Derived rather than hand-copied, so
 * a change to the fixture cannot leave this test asserting against a topic that
 * no longer exists.
 */
function planFromFixture(): TopicPlan {
  const manifest = JSON.parse(readFileSync(join(FIXTURE, "topic.json"), "utf8"));
  const concepts = JSON.parse(readFileSync(join(FIXTURE, "concepts.json"), "utf8")).concepts;
  const owned = new Set<string>();

  const chapters = readdirSync(join(FIXTURE, "chapters"))
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => {
      const raw = readFileSync(join(FIXTURE, "chapters", file), "utf8");
      const { frontmatter, body } = splitChapter(raw);
      // First chapter to cite an excerpt owns it: one excerpt, one owner.
      const cites = [...new Set([...body.matchAll(/\{\{(S\d{2,3})\.([a-z]{1,3})\}\}/g)].map((m) => `${m[1]}.${m[2]}`))]
        .filter((ref) => !owned.has(ref) && owned.add(ref));
      return {
        id: frontmatter.id,
        slug: file.slice(5, -3),
        title: frontmatter.title,
        requires: frontmatter.requires,
        teaches: frontmatter.teaches,
        estimatedMinutes: frontmatter.estimatedMinutes,
        cites,
        outline: [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1]),
      };
    });

  const challenges = readdirSync(join(FIXTURE, "challenges"))
    .sort()
    .map((dir) => {
      const manifestPath = join(FIXTURE, "challenges", dir, "challenge.json");
      const challenge = JSON.parse(readFileSync(manifestPath, "utf8"));
      return {
        id: challenge.id,
        slug: dir.slice(4),
        title: challenge.title,
        afterChapter: challenge.afterChapter,
        exercises: challenge.exercises,
        estimatedHours: challenge.estimatedHours,
        // Omitted when it matches the topic, so the fallback stays exercised by c01 and
        // the override stays exercised by c02.
        ...(challenge.language === manifest.language ? {} : { language: challenge.language }),
        interface: challenge.interface,
        eval: { runner: challenge.eval.runner, metrics: challenge.eval.metrics },
      };
    });

  return topicPlanSchema.parse({
    planVersion: PLAN_VERSION,
    slug: SLUG,
    title: manifest.title,
    summary: manifest.summary,
    language: manifest.language,
    concepts,
    chapters,
    challenges,
  });
}

function approve(root: string, plan: TopicPlan) {
  const path = paths.planApproved(root, plan.slug);
  mkdirSync(join(root, ".forge-cache", plan.slug), { recursive: true });
  writeFileSync(path, `${JSON.stringify(plan, null, 2)}\n`);
}

/** Everything a model authors, copied over a scaffolded tree. */
function overlayAuthoredContent(root: string, plan: TopicPlan) {
  const topicDir = paths.topicDir(root, SLUG);
  cpSync(join(FIXTURE, "corpus"), join(topicDir, "corpus"), { recursive: true });
  cpSync(join(FIXTURE, "sources.json"), join(topicDir, "sources.json"));
  cpSync(join(FIXTURE, "quizzes"), join(topicDir, "quizzes"), { recursive: true });

  for (const chapter of plan.chapters) {
    const rel = paths.chapterFile(chapter);
    const scaffolded = readFileSync(join(topicDir, rel), "utf8");
    const head = scaffolded.slice(0, scaffolded.indexOf("\n---", 4) + 5);
    const authored = splitChapter(readFileSync(join(FIXTURE, rel), "utf8")).body;
    writeFileSync(join(topicDir, rel), `${head}\n${authored}`);
  }
  for (const challenge of plan.challenges) {
    const rel = paths.challengeDir(challenge);
    for (const part of ["brief.md", "rubric.md", "starter", ".hidden"]) {
      rmSync(join(topicDir, rel, part), { recursive: true, force: true });
      cpSync(join(FIXTURE, rel, part), join(topicDir, rel, part), { recursive: true });
    }
  }
}

const shard = (name: string, sources: unknown[]) => ({
  planVersion: PLAN_VERSION,
  shard: name,
  question: `What does ${name} establish?`,
  completedAt: AT,
  sources,
});

const draft = (url: string, quotes: string[]) => ({
  kind: "docs",
  title: `Notes on ${url}`,
  published: "2024",
  url,
  retrieved: AT,
  primary: true,
  excerpts: quotes.map((quote, i) => ({
    key: String.fromCharCode(97 + i),
    locator: `¶${i + 1}`,
    quote,
  })),
});

describe("forge init", () => {
  it("creates the tree the contract names, and no manifest", () => {
    const root = makeRoot();
    initTopic(root, SLUG, clock);
    const topicDir = paths.topicDir(root, SLUG);

    for (const path of ["chapters", "quizzes", "challenges", "corpus"]) {
      expect(existsSync(join(topicDir, path)), path).toBe(true);
    }
    for (const role of ["teach", "help", "judge"]) {
      expect(existsSync(join(topicDir, ".claude/skills", role, "SKILL.md")), role).toBe(true);
    }
    expect(existsSync(paths.runState(root, SLUG))).toBe(true);
    // topic.json and concepts.json are projections of a plan that does not exist
    // yet; writing placeholders would put files on disk that break their schemas.
    expect(existsSync(join(topicDir, "topic.json"))).toBe(false);
    expect(existsSync(join(topicDir, "concepts.json"))).toBe(false);
  });

  it("refuses to re-init a topic that already has a manifest", () => {
    const root = makeRoot();
    initTopic(root, SLUG, clock);
    writeFileSync(join(paths.topicDir(root, SLUG), "topic.json"), "{}");
    expect(() => initTopic(root, SLUG, clock)).toThrow(/already has a topic.json/);
  });
});

describe("forge sources", () => {
  it("assigns ids in shard order and folds a duplicate excerpt", () => {
    const root = makeRoot();
    initTopic(root, SLUG, clock);
    const shared = "A widget spine carries the load between the two flanges under all rated conditions.";
    const dir = paths.researchDir(root, SLUG);
    writeFileSync(
      join(dir, "a-anatomy.json"),
      JSON.stringify(shard("a-anatomy", [draft("https://example.com/one", [shared])])),
    );
    writeFileSync(
      join(dir, "b-fastening.json"),
      JSON.stringify(
        shard("b-fastening", [
          draft("https://example.com/one", [shared, "Torque below the rated window leaves the joint able to work loose."]),
          draft("https://example.com/two", ["Alignment is measured across the diagonal, never along one edge alone."]),
        ]),
      ),
    );

    const result = mergeSources(root, SLUG, clock);
    expect(result.problems).toEqual([]);
    expect(result.merged).toBe(1);

    const written = sourcesFileSchema.parse(
      JSON.parse(readFileSync(join(paths.topicDir(root, SLUG), "sources.json"), "utf8")),
    );
    expect(written.sources.map((s) => s.id)).toEqual(["S01", "S02"]);
    expect(at(written.sources, 0).url).toBe("https://example.com/one");
    expect(at(written.sources, 0).excerpts.map((e) => e.key)).toEqual(["a", "b"]);
    expect(at(written.sources, 1).excerpts.map((e) => e.key)).toEqual(["a"]);
  });

  it("folds two spellings of one document into one source", () => {
    const root = makeRoot();
    initTopic(root, SLUG, clock);
    writeFileSync(
      join(paths.researchDir(root, SLUG), "a-encoding.json"),
      JSON.stringify(
        shard("a-encoding", [
          draft("https://www.rfc-editor.org/rfc/rfc3629", ["The octet values C0, C1, F5 to FF never appear in UTF-8."]),
          draft("https://encoding.spec.whatwg.org/#utf-8-encoder", ["The encoder emits the bytes for one scalar value."]),
          draft("https://www.rfc-editor.org/rfc/rfc9839", ["A different document that shares a host and a path prefix."]),
        ]),
      ),
    );
    writeFileSync(
      join(paths.researchDir(root, SLUG), "b-decoding.json"),
      JSON.stringify(
        shard("b-decoding", [
          draft("https://rfc-editor.org/rfc/rfc3629.txt", ["Implementations MUST protect against decoding invalid sequences."]),
          draft("https://encoding.spec.whatwg.org/#utf-8-decoder", ["The decoder emits U+FFFD when the byte is out of range."]),
        ]),
      ),
    );

    const result = mergeSources(root, SLUG, clock);
    expect(result.problems).toEqual([]);
    expect(result.folded).toBe(2);
    expect(result.sources).toBe(3);

    const written = sourcesFileSchema.parse(
      JSON.parse(readFileSync(join(paths.topicDir(root, SLUG), "sources.json"), "utf8")),
    );
    expect(at(written.sources, 0).excerpts.map((e) => e.key)).toEqual(["a", "b"]);
    expect(at(written.sources, 2).excerpts).toHaveLength(1);
  });

  it("folds the arXiv mirrors of one paper into one source", () => {
    // The first real research run produced this: two shards, two papers, four entries,
    // because the abstract page and the ar5iv full-text render are different hosts.
    const root = makeRoot();
    initTopic(root, SLUG, clock);
    writeFileSync(
      join(paths.researchDir(root, SLUG), "a-rag.json"),
      JSON.stringify(
        shard("a-rag", [
          draft("https://arxiv.org/abs/2005.11401", ["Parametric and non-parametric memory are combined."]),
          draft("https://arxiv.org/abs/1234.56789", ["A different paper entirely, and it stays its own source."]),
        ]),
      ),
    );
    writeFileSync(
      join(paths.researchDir(root, SLUG), "b-rag.json"),
      JSON.stringify(
        shard("b-rag", [
          draft("https://ar5iv.labs.arxiv.org/html/2005.11401v2", ["RAG-Sequence conditions on one retrieved passage."]),
          draft("https://arxiv.org/pdf/2005.11401", ["RAG-Token may draw each token from a different passage."]),
        ]),
      ),
    );

    const result = mergeSources(root, SLUG, clock);
    expect(result.problems).toEqual([]);
    expect(result.sources).toBe(2);
    expect(result.folded).toBe(2);

    const written = sourcesFileSchema.parse(
      JSON.parse(readFileSync(join(paths.topicDir(root, SLUG), "sources.json"), "utf8")),
    );
    expect(at(written.sources, 0).excerpts).toHaveLength(3);
    expect(at(written.sources, 1).excerpts).toHaveLength(1);
  });

  it("takes the more precise date, the later retrieval, and the honest primary flag", () => {
    const root = makeRoot();
    initTopic(root, SLUG, clock);
    const quote = "A quote long enough to satisfy the contract's floor.";
    writeFileSync(
      join(paths.researchDir(root, SLUG), "a-first.json"),
      JSON.stringify(
        shard("a-first", [
          { ...draft("https://example.com/doc#one", [quote]), published: "2003", retrieved: "2026-01-01" },
        ]),
      ),
    );
    writeFileSync(
      join(paths.researchDir(root, SLUG), "b-second.json"),
      JSON.stringify(
        shard("b-second", [
          {
            ...draft("https://example.com/doc", ["The second shard reached the same document by another route."]),
            published: "2003-11",
            retrieved: "2026-02-02",
            primary: false,
            identifier: "RFC 3629",
          },
        ]),
      ),
    );

    expect(mergeSources(root, SLUG, clock).problems).toEqual([]);
    const written = sourcesFileSchema.parse(
      JSON.parse(readFileSync(join(paths.topicDir(root, SLUG), "sources.json"), "utf8")),
    );
    expect(written.sources).toHaveLength(1);
    const only = at(written.sources, 0);
    expect(only.published).toBe("2003-11");
    expect(only.retrieved).toBe("2026-02-02");
    expect(only.primary).toBe(false);
    expect(only.identifier).toBe("RFC 3629");
    expect(only.url).toBe("https://example.com/doc");
  });

  it("is deterministic: the same shards produce the same file", () => {
    const root = makeRoot();
    initTopic(root, SLUG, clock);
    writeFileSync(
      join(paths.researchDir(root, SLUG), "only.json"),
      JSON.stringify(shard("only", [draft("https://example.com/one", ["A quote long enough to satisfy the contract's floor."])])),
    );
    const path = join(paths.topicDir(root, SLUG), "sources.json");
    mergeSources(root, SLUG, clock);
    const first = readFileSync(path, "utf8");
    mergeSources(root, SLUG, clock);
    expect(readFileSync(path, "utf8")).toBe(first);
  });

  it("reports a shard whose name does not match its filename", () => {
    const root = makeRoot();
    initTopic(root, SLUG, clock);
    writeFileSync(
      join(paths.researchDir(root, SLUG), "named-one.json"),
      JSON.stringify(shard("named-two", [draft("https://example.com/one", ["A quote long enough to satisfy the floor."])])),
    );
    expect(mergeSources(root, SLUG, clock).problems.join(" ")).toMatch(/does not match the filename/);
  });
});

describe("forge apply", () => {
  it("scaffolds a tree that satisfies the contract once the authored content lands", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    approve(root, plan);

    const result = applyPlan(root, SLUG, clock);
    expect(result.problems).toEqual([]);
    expect(result.orphans).toEqual([]);

    overlayAuthoredContent(root, plan);
    const report = validateTopic(paths.topicDir(root, SLUG), true);
    expect(report.findings).toEqual([]);
  });

  it("leaves authored prose alone while refreshing frontmatter from the plan", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    approve(root, plan);
    applyPlan(root, SLUG, clock);

    const rel = paths.chapterFile(at(plan.chapters, 0));
    const path = join(paths.topicDir(root, SLUG), rel);
    const head = readFileSync(path, "utf8");
    writeFileSync(path, `${head.slice(0, head.indexOf("\n---", 4) + 5)}\n## Authored\n\nReal prose.\n`);

    approve(root, {
      ...plan,
      chapters: plan.chapters.map((c, i) => (i === 0 ? { ...c, estimatedMinutes: 42, title: "A renamed chapter" } : c)),
    });
    applyPlan(root, SLUG, clock);

    const after = readFileSync(path, "utf8");
    expect(after).toContain("Real prose.");
    expect(after).toContain("estimatedMinutes: 42");
    expect(after).toContain("title: A renamed chapter");
  });

  it("keeps an audited chapter's status and audit record", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    approve(root, plan);
    applyPlan(root, SLUG, clock);

    const rel = paths.chapterFile(at(plan.chapters, 0));
    const path = join(paths.topicDir(root, SLUG), rel);
    writeFileSync(
      path,
      `---
id: ${at(plan.chapters, 0).id}
title: ${at(plan.chapters, 0).title}
order: 1
requires: []
teaches: [${at(plan.chapters, 0).teaches.join(", ")}]
quiz: ${paths.quizFile(at(plan.chapters, 0).id)}
estimatedMinutes: ${at(plan.chapters, 0).estimatedMinutes}
status: verified
audit:
  faithfulness:
    verdict: pass
    at: ${AT}
    claims: 4
    supported: 4
    unsupported: 0
    contradicted: 0
    unreachable: 0
  critique:
    verdict: pass
    at: ${AT}
---

## Authored

Real prose.
`,
    );
    applyPlan(root, SLUG, clock);
    const after = readFileSync(path, "utf8");
    expect(after).toContain("status: verified");
    expect(after).toContain("verdict: pass");
    expect(after).toContain("Real prose.");
  });

  it("refuses a plan whose challenge needs a concept the learner has not met", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    approve(root, {
      ...plan,
      challenges: plan.challenges.map((c) => ({ ...c, afterChapter: "ch01", exercises: ["alignment-check"] })),
    });
    const result = applyPlan(root, SLUG, clock);
    expect(result.problems.join(" ")).toMatch(/exercises alignment-check/);
    expect(existsSync(join(paths.topicDir(root, SLUG), "topic.json"))).toBe(false);
  });

  it("refuses a plan that allocates one excerpt to two chapters", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    const ref = at(at(plan.chapters, 0).cites, 0);
    approve(root, {
      ...plan,
      chapters: plan.chapters.map((c, i) => (i === 1 ? { ...c, cites: [...c.cites, ref] } : c)),
    });
    expect(applyPlan(root, SLUG, clock).problems.join(" ")).toMatch(/allocated to both/);
  });

  it("reports a chapter the plan no longer mentions instead of deleting it", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    approve(root, plan);
    applyPlan(root, SLUG, clock);

    const dropped = paths.chapterFile(at(plan.chapters, 1));
    // Dropping a chapter drops the concepts only it taught, or the plan check
    // rejects the revision before any of this happens.
    const kept = new Set(at(plan.chapters, 0).teaches);
    approve(root, {
      ...plan,
      concepts: plan.concepts.filter((c) => kept.has(c.id)),
      chapters: [at(plan.chapters, 0)],
      challenges: plan.challenges.map((c) => ({ ...c, afterChapter: "ch01", exercises: at(plan.chapters, 0).teaches })),
    });
    const result = applyPlan(root, SLUG, clock);
    expect(result.orphans).toContain(dropped);
    expect(existsSync(join(paths.topicDir(root, SLUG), dropped))).toBe(true);
  });
});

describe("forge check", () => {
  it("names an excerpt no chapter took responsibility for", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    cpSync(join(FIXTURE, "sources.json"), join(paths.topicDir(root, SLUG), "sources.json"));

    const draftPath = paths.planDraft(root, SLUG);
    const dropped = at(at(plan.chapters, 1).cites, 0);
    writeFileSync(
      draftPath,
      JSON.stringify({
        ...plan,
        chapters: plan.chapters.map((c, i) => (i === 1 ? { ...c, cites: c.cites.slice(1) } : c)),
      }),
    );
    // ch02 cites exactly one excerpt in the fixture, so dropping it leaves the
    // plan schema-invalid rather than merely incomplete. Either way the map does
    // not reach the owner.
    const result = checkPlanFile(root, SLUG);
    expect(result.problems.length).toBeGreaterThan(0);

    writeFileSync(draftPath, JSON.stringify(plan));
    const clean = checkPlanFile(root, SLUG);
    expect(clean.problems).toEqual([]);
    expect(clean.unallocated).toEqual([]);
    expect(clean.allocated).toBe(3);
    expect(dropped).toMatch(/^S\d\d\./);
  });

  it("rejects a chapter citing an excerpt that does not exist", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    cpSync(join(FIXTURE, "sources.json"), join(paths.topicDir(root, SLUG), "sources.json"));
    writeFileSync(
      paths.planDraft(root, SLUG),
      JSON.stringify({
        ...plan,
        chapters: plan.chapters.map((c, i) => (i === 0 ? { ...c, cites: [...c.cites, "S99.z"] } : c)),
      }),
    );
    expect(checkPlanFile(root, SLUG).problems.join(" ")).toMatch(/S99\.z, which is not in sources\.json/);
  });
});

describe("forge eval", () => {
  /** A challenge whose eval set really imports the entrypoint, run on plain node. */
  function stageRunnable(root: string, plan: TopicPlan, evalBody: string) {
    const onNode = {
      ...plan,
      challenges: plan.challenges.map((c) => ({ ...c, eval: { ...c.eval, runner: "node" as const } })),
    };
    approve(root, onNode);
    applyPlan(root, SLUG, clock);
    const challenge = at(onNode.challenges, 0);
    const dir = join(paths.topicDir(root, SLUG), paths.challengeDir(challenge));
    writeFileSync(
      join(dir, referenceEntrypoint(challenge.interface.entrypoint)),
      "export function checkBuild() {\n  return [];\n}\n",
    );
    writeFileSync(join(dir, paths.evalSpec(challenge.id)), evalBody);
    return { dir, challenge };
  }

  // The eval set reports each declared metric on its own line; that convention is
  // how the Judge and the CLI read scores back out of an arbitrary runner.
  const passingEval = `import { checkBuild } from "../../work/src/index.ts";
if (typeof checkBuild !== "function") throw new Error("entrypoint does not export checkBuild");
if (checkBuild().length !== 0) throw new Error("expected no problems for a sound build");
console.log("metric detection-rate 1.0");
console.log("metric false-positive-rate 0.0");
`;

  it("runs the held-out set against the reference solution", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    stageRunnable(root, plan, passingEval);

    const result = evalChallenge(root, SLUG, "c01", true);
    expect(result.problems).toEqual([]);
    expect(result.passed, result.output).toBe(true);
    expect(result.metrics.map((m) => [m.name, m.value, m.ok])).toEqual([
      ["detection-rate", 1, true],
      ["false-positive-rate", 0, true],
    ]);
    // The eval set imported work/src/index.ts and got the reference, which is the
    // whole point: relative paths resolve exactly as they will for a learner.
    expect(existsSync(join(result.staged, "work/src/index.ts"))).toBe(true);
  });

  it("scores the learner's work, not the reference, by default", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    const { dir, challenge } = stageRunnable(root, plan, passingEval);
    // The learner's own attempt, deliberately different from the reference.
    mkdirSync(join(dir, "work/src"), { recursive: true });
    writeFileSync(join(dir, "work/src/index.ts"), "export function checkBuild() {\n  return [];\n}\n");

    const result = evalChallenge(root, SLUG, challenge.id);
    expect(result.against).toBe("work");
    expect(result.passed, result.output).toBe(true);
  });

  it("says what is missing when the submission never implemented the interface", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    stageRunnable(root, plan, passingEval);
    // work/ is empty, which is where every learner starts.
    expect(evalChallenge(root, SLUG, "c01").problems.join(" ")).toMatch(/nothing at work\/src\/index\.ts/);
  });

  it("treats a metric the evaluation set never printed as a defect in the challenge", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    stageRunnable(root, plan, `console.log("metric detection-rate 1.0");\n`);

    const result = evalChallenge(root, SLUG, "c01", true);
    expect(result.passed).toBe(false);
    expect(result.problems.join(" ")).toMatch(/no value for: false-positive-rate/);
  });

  it("fails a run whose metric came in under its threshold", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    stageRunnable(
      root,
      plan,
      `console.log("metric detection-rate 0.4");\nconsole.log("metric false-positive-rate 0.0");\n`,
    );

    const result = evalChallenge(root, SLUG, "c01", true);
    expect(result.passed).toBe(false);
    expect(result.problems).toEqual([]);
    expect(result.metrics.find((m) => m.name === "detection-rate")?.ok).toBe(false);
    expect(result.metrics.find((m) => m.name === "false-positive-rate")?.ok).toBe(true);
  });

  it("reports failure when the reference does not satisfy its own evaluation set", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    stageRunnable(
      root,
      plan,
      `import { checkBuild } from "../../work/src/index.ts";\nif (checkBuild().length === 0) throw new Error("the reference missed every planted fault");\n`,
    );

    const result = evalChallenge(root, SLUG, "c01", true);
    expect(result.passed).toBe(false);
    expect(result.output).toMatch(/planted fault/);
  });

  it("refuses while the reference or the evaluation set is still a stub", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    approve(root, plan);
    applyPlan(root, SLUG, clock);
    expect(evalChallenge(root, SLUG, "c01", true).problems.join(" ")).toMatch(/still a stub/);
  });

  it("names the path the reference has to occupy when it is somewhere else", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    approve(root, plan);
    applyPlan(root, SLUG, clock);

    const challenge = at(plan.challenges, 0);
    const dir = join(paths.topicDir(root, SLUG), paths.challengeDir(challenge));
    rmSync(join(dir, referenceEntrypoint(challenge.interface.entrypoint)));
    writeFileSync(join(dir, ".hidden/solution/somewhere-else.ts"), "export const x = 1;\n");
    expect(evalChallenge(root, SLUG, "c01", true).problems.join(" ")).toMatch(/must place \.hidden\/solution\/src\/index\.ts/);
  });
});

describe("role stamping", () => {
  it("replaces the init placeholders with stamped templates", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);

    const teachPath = join(paths.topicDir(root, SLUG), paths.roleSkill("teach"));
    expect(readFileSync(teachPath, "utf8")).toContain("forge:stub");

    approve(root, plan);
    expect(applyPlan(root, SLUG, clock).problems).toEqual([]);

    for (const role of ["teach", "help", "judge"]) {
      const text = readFileSync(join(paths.topicDir(root, SLUG), paths.roleSkill(role)), "utf8");
      expect(text, role).not.toContain("forge:stub");
      expect(text, role).not.toMatch(UNSTAMPED);
      expect(text, role).toContain(SLUG);
      expect(text, role).toContain(plan.title);
      expect(parseYaml(text.slice(4, text.indexOf("\n---", 4))).name, role).toBe(role);
    }
  });

  it("gives the graded roles a forked context so they cannot see the conversation", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    approve(root, plan);
    applyPlan(root, SLUG, clock);

    const frontmatterOf = (role: string) => {
      const text = readFileSync(join(paths.topicDir(root, SLUG), paths.roleSkill(role)), "utf8");
      return parseYaml(text.slice(4, text.indexOf("\n---", 4)));
    };
    // The Helper and Judge run as subagents; that is where their tool restrictions
    // and their isolation come from. The Teacher is a conversation and must not.
    for (const role of ["help", "judge"]) {
      expect(frontmatterOf(role).context, role).toBe("fork");
      expect(frontmatterOf(role).agent, role).toMatch(/^topic-/);
      expect(frontmatterOf(role).background, role).toBe(false);
    }
    expect(frontmatterOf("teach").context).toBeUndefined();
  });

  it("refuses to apply when a role template is missing", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    approve(root, plan);
    rmSync(paths.roleTemplate(root, "judge"));
    expect(applyPlan(root, SLUG, clock).problems.join(" ")).toMatch(/missing role template/);
  });
});

describe("forge progress", () => {
  it("creates a progress file the validator accepts, and leaves an existing one alone", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    approve(root, plan);
    applyPlan(root, SLUG, clock);
    overlayAuthoredContent(root, plan);

    expect(initProgress(root, SLUG, "2026-08-02T09:00:00Z")).toBe(true);
    expect(validateTopic(paths.topicDir(root, SLUG), true).findings).toEqual([]);

    const path = join(paths.topicDir(root, SLUG), ".state/progress.json");
    const first = readFileSync(path, "utf8");
    expect(initProgress(root, SLUG, "2026-08-03T09:00:00Z")).toBe(false);
    expect(readFileSync(path, "utf8")).toBe(first);
  });
});

describe("forge promote", () => {
  it("refuses a topic the validator still complains about, and promotes one it does not", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    approve(root, plan);
    applyPlan(root, SLUG, clock);

    const manifestPath = join(paths.topicDir(root, SLUG), "topic.json");
    expect(promoteToValidated(root, SLUG).promoted).toBe(false);
    expect(JSON.parse(readFileSync(manifestPath, "utf8")).status).toBe("draft");

    overlayAuthoredContent(root, plan);
    expect(promoteToValidated(root, SLUG).promoted).toBe(true);
    expect(JSON.parse(readFileSync(manifestPath, "utf8")).status).toBe("validated");
  });

  it("keeps an earned status and the original date when a revised map is applied", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    approve(root, plan);
    applyPlan(root, SLUG, clock);
    overlayAuthoredContent(root, plan);
    promoteToValidated(root, SLUG);

    approve(root, { ...plan, summary: `${plan.summary} Revised.` });
    applyPlan(root, SLUG, () => "2026-08-09");

    const manifest = JSON.parse(readFileSync(join(paths.topicDir(root, SLUG), "topic.json"), "utf8"));
    expect(manifest.status).toBe("validated");
    expect(manifest.generatedAt).toBe(AT);
    expect(manifest.summary).toMatch(/Revised\.$/);
  });
});

describe("forge status", () => {
  it("names what is still owed and which excerpts nothing cites", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    approve(root, plan);
    applyPlan(root, SLUG, clock);
    cpSync(join(FIXTURE, "sources.json"), join(paths.topicDir(root, SLUG), "sources.json"));

    const status = statusOf(root, SLUG);
    expect(status.stage).toBe("apply");
    const owed = (kind: string) => status.outstanding.find((o) => o.kind === kind)?.ids;
    expect(owed("chapters")).toEqual(["ch01", "ch02"]);
    expect(owed("quizzes")).toEqual(["ch01", "ch02"]);
    expect(owed("challenges")).toEqual(["c01", "c02"]);
    expect(status.excerpts.uncited).toEqual(["S01.a", "S01.b", "S02.a"]);
    expect(status.excerpts.unallocated).toEqual([]);
    expect(status.next).toMatch(/chapters stage/);
  });

  it("counts a written chapter as done", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    approve(root, plan);
    applyPlan(root, SLUG, clock);
    overlayAuthoredContent(root, plan);

    const status = statusOf(root, SLUG);
    expect(status.outstanding.find((o) => o.kind === "chapters")?.ids).toEqual([]);
    expect(status.outstanding.find((o) => o.kind === "quizzes")?.ids).toEqual([]);
    expect(status.excerpts.uncited).toEqual([]);
  });
});

describe("parseMetrics", () => {
  // Vitest labels captured output with the file that produced it. Without using that
  // label, a metric line from anywhere else in the run becomes this challenge's score,
  // and which one wins depends on file scheduling.
  const SPEC = "c01.eval.ts";

  it("keeps the lines the challenge's own spec printed", () => {
    const output = [
      "stdout | challenges/c01-assemble-widget/.hidden/eval/c01.eval.ts > scores",
      "metric detection-rate 0.95",
      "metric false-positive-rate 0.02",
    ].join("\n");
    expect([...parseMetrics(output, SPEC)]).toEqual([
      ["detection-rate", 0.95],
      ["false-positive-rate", 0.02],
    ]);
  });

  it("ignores lines another spec printed, however late they arrive", () => {
    const output = [
      "stdout | challenges/c01-assemble-widget/.hidden/eval/c01.eval.ts > scores",
      "metric detection-rate 0.95",
      "stdout | challenges/c02-something-else/.hidden/eval/c02.eval.ts > scores",
      "metric detection-rate 0.01",
      "metric false-positive-rate 0.99",
    ].join("\n");
    expect(parseMetrics(output, SPEC).get("detection-rate")).toBe(0.95);
    expect(parseMetrics(output, SPEC).has("false-positive-rate")).toBe(false);
  });

  it("keeps unattributed lines, which is how the node runner reports", () => {
    // One process, one spec, no headers. Unattributed output belongs to the spec by
    // construction there.
    expect([...parseMetrics("metric recall 0.5", SPEC)]).toEqual([["recall", 0.5]]);
  });

  it("reads negative and integer values, and ignores prose that mentions a metric", () => {
    const output = ["metric drift -0.25", "metric hits 12", "the metric detection-rate is fine"].join("\n");
    expect([...parseMetrics(output, SPEC)]).toEqual([
      ["drift", -0.25],
      ["hits", 12],
    ]);
  });
});

describe("forge eval on the vitest runner", () => {
  /**
   * A temp topic carrying the fixture's real challenge material on the runner its
   * manifest actually declares. Every other eval case in this file rewrites the runner
   * to `node` first, which is exactly how the vitest path stayed broken while its tests
   * passed.
   */
  function stageFixtureChallenge(root: string): { topicDir: string; challengeDir: string } {
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    approve(root, plan);
    applyPlan(root, SLUG, clock);
    const topicDir = paths.topicDir(root, SLUG);
    cpSync(join(FIXTURE, "corpus"), join(topicDir, "corpus"), { recursive: true });
    const rel = paths.challengeDir(at(plan.challenges, 0));
    for (const sub of ["starter", ".hidden"]) {
      cpSync(join(FIXTURE, rel, sub), join(topicDir, rel, sub), { recursive: true });
    }
    return { topicDir, challengeDir: join(topicDir, rel) };
  }

  /** A submission at the entrypoint, over a copy of the starter, as a learner would have. */
  function submit(challengeDir: string, body: string) {
    cpSync(join(challengeDir, "starter"), join(challengeDir, "work"), { recursive: true });
    writeFileSync(join(challengeDir, "work/src/index.ts"), body);
  }

  it("proves the reference solution passes its own held-out set", () => {
    const root = makeRoot();
    stageFixtureChallenge(root);

    const result = evalChallenge(root, SLUG, "c01", true);
    expect(result.problems).toEqual([]);
    expect(result.ran).toBe(true);
    expect(result.metrics.map((m) => [m.name, m.value, m.ok])).toEqual([
      ["detection-rate", 1, true],
      ["false-positive-rate", 0, true],
    ]);
    expect(result.passed, result.output).toBe(true);
  });

  it("stages work/ as starter plus the code under test", () => {
    // The reference imports a module the starter provides. Staging the reference alone
    // makes that import fail, and the challenge is then reported unsolvable by its own
    // reference. A type-only import would survive erasure and hide this.
    const root = makeRoot();
    stageFixtureChallenge(root);
    const result = evalChallenge(root, SLUG, "c01", true);
    expect(existsSync(join(result.staged, "work/src/types.ts"))).toBe(true);
    expect(existsSync(join(result.staged, "work/src/index.ts"))).toBe(true);
  });

  it("never stages the reference solution beside the code being scored", () => {
    const root = makeRoot();
    const { challengeDir } = stageFixtureChallenge(root);
    submit(challengeDir, "export function checkBuild() {\n  return [];\n}\n");

    const result = evalChallenge(root, SLUG, "c01");
    expect(existsSync(join(result.staged, ".hidden/eval"))).toBe(true);
    expect(existsSync(join(result.staged, ".hidden/solution"))).toBe(false);
  });

  it("scores only its own spec, with an unrelated eval set in the same tree", () => {
    // This is the regression for the defect that made a pass impossible: the generated
    // config collected every *.eval.ts under the process cwd, so the un-staged original
    // ran against an empty work/ and failed the run whatever the reference scored, and
    // any stray metric line could win the scrape.
    const root = makeRoot();
    stageFixtureChallenge(root);
    writeFileSync(
      join(root, "stray.eval.ts"),
      `import { it } from "vitest";\n` +
        `it("stray", () => {\n` +
        `  console.log("metric detection-rate 0.01");\n` +
        `  console.log("metric false-positive-rate 0.99");\n` +
        `});\n`,
    );

    const result = evalChallenge(root, SLUG, "c01", true);
    expect(result.output).not.toContain("stray");
    expect(result.metrics.map((m) => m.value)).toEqual([1, 0]);
    expect(result.passed, result.output).toBe(true);
  });

  it("fails a submission that reports nothing, on detection rather than false positives", () => {
    const root = makeRoot();
    const { challengeDir } = stageFixtureChallenge(root);
    submit(challengeDir, "export function checkBuild() {\n  return [];\n}\n");

    const result = evalChallenge(root, SLUG, "c01");
    expect(result.ran).toBe(true);
    const value = (name: string) => result.metrics.find((m) => m.name === name);
    expect(value("detection-rate")?.value).toBe(0);
    expect(value("detection-rate")?.ok).toBe(false);
    // Reporting nothing is not a clean sheet, but it is not a false positive either.
    expect(value("false-positive-rate")?.value).toBe(0);
    expect(result.passed).toBe(false);
  });

  it("fails a submission that calls every build broken, on false positives", () => {
    const root = makeRoot();
    const { challengeDir } = stageFixtureChallenge(root);
    submit(
      challengeDir,
      `import type { Build, Problem } from "./types.ts";\n` +
        `export function checkBuild(_build: Build): Problem[] {\n` +
        `  return [{ fault: "seat-not-inspected", detail: "assume the worst" }];\n` +
        `}\n`,
    );

    const result = evalChallenge(root, SLUG, "c01");
    const value = (name: string) => result.metrics.find((m) => m.name === name);
    expect(value("false-positive-rate")?.value).toBeGreaterThan(0.1);
    expect(value("false-positive-rate")?.ok).toBe(false);
    expect(result.passed).toBe(false);
  });
});

describe("forge eval on the python runner", () => {
  /**
   * The reason this block exists. A runner that is only ever exercised by a manifest
   * some test rewrote is a runner nobody has run, which is how the vitest path stayed
   * broken while its tests passed. c02 is a real Python challenge in the fixture, on
   * the runner its own manifest declares, graded end to end.
   */
  function stagePythonChallenge(root: string): { topicDir: string; challengeDir: string } {
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    approve(root, plan);
    applyPlan(root, SLUG, clock);
    const topicDir = paths.topicDir(root, SLUG);
    cpSync(join(FIXTURE, "corpus"), join(topicDir, "corpus"), { recursive: true });
    const rel = paths.challengeDir(at(plan.challenges, 1));
    for (const sub of ["starter", ".hidden"]) {
      cpSync(join(FIXTURE, rel, sub), join(topicDir, rel, sub), { recursive: true });
    }
    return { topicDir, challengeDir: join(topicDir, rel) };
  }

  function submit(challengeDir: string, body: string) {
    cpSync(join(challengeDir, "starter"), join(challengeDir, "work"), { recursive: true });
    writeFileSync(join(challengeDir, "work/checker.py"), body);
  }

  it("scaffolds the spec and the reference with Python extensions", () => {
    const plan = planFromFixture();
    const challenge = at(plan.challenges, 1);
    expect(paths.evalSpec(challenge.id, challenge.eval.runner)).toBe(".hidden/eval/c02.eval.py");
    expect(referenceEntrypoint(challenge.interface.entrypoint)).toBe(".hidden/solution/checker.py");
  });

  it("proves the reference solution passes its own held-out set", () => {
    const root = makeRoot();
    stagePythonChallenge(root);

    const result = evalChallenge(root, SLUG, "c02", true);
    expect(result.problems).toEqual([]);
    expect(result.ran).toBe(true);
    expect(result.metrics.map((m) => [m.name, m.value, m.ok])).toEqual([
      ["classification-accuracy", 1, true],
      ["in-window-miss-rate", 0, true],
    ]);
    expect(result.passed, result.output).toBe(true);
  });

  it("reaches the corpus from the staged work tree", () => {
    // The reference resolves corpus/fasteners.json by walking up from its own file, so
    // this asserts the staging layout mirrors a real topic rather than merely running.
    const root = makeRoot();
    stagePythonChallenge(root);
    const result = evalChallenge(root, SLUG, "c02", true);
    expect(existsSync(join(result.staged, "work/checker.py"))).toBe(true);
    expect(result.output).not.toContain("FileNotFoundError");
  });

  it("never stages the reference solution beside the code being scored", () => {
    const root = makeRoot();
    const { challengeDir } = stagePythonChallenge(root);
    submit(challengeDir, "def classify(reading):\n    return 'unrated'\n");

    const result = evalChallenge(root, SLUG, "c02");
    expect(existsSync(join(result.staged, ".hidden/eval"))).toBe(true);
    expect(existsSync(join(result.staged, ".hidden/solution"))).toBe(false);
  });

  it("fails a classifier that answers in-window every time, on accuracy not on misses", () => {
    // The pair of metrics is two-sided on purpose. This submission is perfect on one of
    // them, which is exactly why one metric would have passed it.
    const root = makeRoot();
    const { challengeDir } = stagePythonChallenge(root);
    submit(challengeDir, "def classify(reading):\n    return 'in-window'\n");

    const result = evalChallenge(root, SLUG, "c02");
    expect(result.ran).toBe(true);
    const value = (name: string) => result.metrics.find((m) => m.name === name);
    expect(value("in-window-miss-rate")?.value).toBe(0);
    expect(value("in-window-miss-rate")?.ok).toBe(true);
    expect(value("classification-accuracy")?.ok).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("fails a classifier that treats the window bounds as exclusive", () => {
    // The one rule the challenge is built around. Six of the sixteen held-out readings
    // sit on a bound, so getting this wrong costs both metrics.
    const root = makeRoot();
    const { challengeDir } = stagePythonChallenge(root);
    submit(
      challengeDir,
      "import json\n" +
        "from pathlib import Path\n" +
        "CORPUS = Path(__file__).resolve().parents[3] / 'corpus' / 'fasteners.json'\n" +
        "WINDOWS = {e['id']: e['window'] for e in json.loads(CORPUS.read_text())['fasteners']}\n" +
        "def classify(reading):\n" +
        "    window = WINDOWS.get(reading['fastener'])\n" +
        "    if window is None:\n" +
        "        return 'unrated'\n" +
        "    if reading['newtonMetres'] <= window['min']:\n" +
        "        return 'under'\n" +
        "    if reading['newtonMetres'] >= window['max']:\n" +
        "        return 'over'\n" +
        "    return 'in-window'\n",
    );

    const result = evalChallenge(root, SLUG, "c02");
    const value = (name: string) => result.metrics.find((m) => m.name === name);
    expect(value("in-window-miss-rate")?.value).toBeGreaterThan(0.1);
    expect(value("in-window-miss-rate")?.ok).toBe(false);
    expect(result.passed).toBe(false);
  });
});

describe("forge verify", () => {
  /** A topic that would pass the validator, ready to be audited. */
  function auditable(root: string) {
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    approve(root, plan);
    applyPlan(root, SLUG, clock);
    overlayAuthoredContent(root, plan);
    return plan;
  }

  /**
   * Rulings whose quotes really do appear in the fixture's sources.json, because the
   * recorder checks them. Building these by hand is the point: a test that fed the
   * recorder invented spans would pass while proving the opposite of what it claims.
   */
  const REAL_SPANS = [
    { ref: "S01.a", quote: "The shroud carries no load" },
    { ref: "S01.b", quote: "The seat is the machined face where the two halves meet" },
    { ref: "S02.a", quote: "An M6 flange bolt is rated to 9 newton metres" },
  ] as const;

  const supported = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      claim: `The chapter asserts something checkable, number ${i + 1}.`,
      ...at(REAL_SPANS, i % REAL_SPANS.length),
      ruling: "supported" as const,
    }));

  function writeAudit(root: string, chapter: string, claims: unknown[]) {
    writeFileSync(
      paths.auditFile(root, SLUG, chapter),
      json({ planVersion: PLAN_VERSION, chapter, auditedAt: AT, claims }),
    );
  }

  function writeCritique(root: string, chapter: string, findings: unknown[] = []) {
    writeFileSync(
      paths.critiqueFile(root, SLUG, chapter),
      json({ planVersion: PLAN_VERSION, chapter, auditedAt: AT, findings }),
    );
  }

  const json = (data: unknown) => `${JSON.stringify(data, null, 2)}\n`;

  function frontmatterOf(root: string, chapter: { id: string; slug: string }): any {
    const path = join(paths.topicDir(root, SLUG), paths.chapterFile(chapter as never));
    return splitChapter(readFileSync(path, "utf8")).frontmatter;
  }

  it("derives the counts and the verdict from the rulings", () => {
    const root = makeRoot();
    const plan = auditable(root);
    const chapter = at(plan.chapters, 0);
    writeAudit(root, chapter.id, [
      ...supported(3),
      { claim: "A claim the source does not carry at all.", ref: "S01.b", quote: "NOTHING FOUND", ruling: "unsupported", note: "the excerpt is about something else entirely" },
    ]);
    writeCritique(root, chapter.id);

    const result = recordVerdicts(root, SLUG, clock);
    const audit = frontmatterOf(root, chapter).audit;
    expect(audit.faithfulness).toEqual({
      verdict: "fail",
      at: AT,
      claims: 4,
      supported: 3,
      unsupported: 1,
      overstated: 0,
      contradicted: 0,
      unreachable: 0,
    });
    // One unsupported claim is a failed chapter, whatever anyone would have preferred.
    expect(at(result.chapters, 0).status).toBe("draft");
    expect(frontmatterOf(root, chapter).status).toBe("draft");
  });

  it("verifies a chapter when both agents pass it", () => {
    const root = makeRoot();
    const plan = auditable(root);
    const chapter = at(plan.chapters, 0);
    writeAudit(root, chapter.id, supported(5));
    writeCritique(root, chapter.id, [
      { severity: "advisory", kind: "example-missing", detail: "the second section would land better with a worked example after the definition" },
    ]);

    recordVerdicts(root, SLUG, clock);
    const front = frontmatterOf(root, chapter);
    expect(front.status).toBe("verified");
    expect(front.audit.faithfulness.verdict).toBe("pass");
    expect(front.audit.critique.verdict).toBe("pass");
    // Advisory findings are recorded and do not block.
    expect(front.audit.critique.notes).toMatch(/0 blocking, 1 advisory/);
  });

  it("fails a chapter on a blocking critique finding, however clean the citations", () => {
    const root = makeRoot();
    const plan = auditable(root);
    const chapter = at(plan.chapters, 0);
    writeAudit(root, chapter.id, supported(5));
    writeCritique(root, chapter.id, [
      { severity: "blocking", kind: "prerequisite-gap", detail: "the chapter uses inverse document frequency before anything has defined it" },
    ]);

    recordVerdicts(root, SLUG, clock);
    expect(frontmatterOf(root, chapter).status).toBe("draft");
    expect(frontmatterOf(root, chapter).audit.critique.verdict).toBe("fail");
  });

  it("refuses a supported ruling that found nothing", () => {
    // The schema is what makes "supported" cost something. Without it, an auditor that
    // never opened the source can still type the word.
    const root = makeRoot();
    const plan = auditable(root);
    const chapter = at(plan.chapters, 0);
    writeAudit(root, chapter.id, [
      { claim: "Something the auditor did not actually check.", ref: "S01.a", quote: "NOTHING FOUND", ruling: "supported" },
    ]);
    writeCritique(root, chapter.id);

    const result = recordVerdicts(root, SLUG, clock);
    expect(result.problems.join(" ")).toMatch(/cannot quote NOTHING FOUND/);
    expect(frontmatterOf(root, chapter).status).not.toBe("verified");
  });

  it("catches a span that does not appear in the excerpt it cites", () => {
    // The failure the judge literature rates worst for a citation auditor: a fluent
    // quotation of something the source never said. A prompt cannot close this. The
    // recorder resolves the marker and looks.
    const root = makeRoot();
    const plan = auditable(root);
    const chapter = at(plan.chapters, 0);
    writeAudit(root, chapter.id, [
      {
        claim: "A claim resting on a quotation nobody wrote.",
        ref: "S01.a",
        quote: "the shroud is torqued to eleven newton metres before the spine is seated",
        ruling: "supported",
      },
    ]);
    writeCritique(root, chapter.id);

    const result = recordVerdicts(root, SLUG, clock);
    expect(result.problems.join(" ")).toMatch(/does not appear in S01\.a/);
    // And nothing is stamped, because an audit with one invented quote is not an audit.
    expect(frontmatterOf(root, chapter).audit).toBeUndefined();
  });

  it("accepts a span re-wrapped across lines, and rejects a paraphrase", () => {
    const root = makeRoot();
    const plan = auditable(root);
    const chapter = at(plan.chapters, 0);
    const rewrapped = { claim: "A claim quoted across a line break.", ref: "S01.a", quote: "The shroud\n  carries   no load", ruling: "supported" as const };
    writeAudit(root, chapter.id, [rewrapped]);
    writeCritique(root, chapter.id);
    expect(recordVerdicts(root, SLUG, clock).problems).toEqual([]);

    writeAudit(root, chapter.id, [
      { claim: "A claim resting on a paraphrase.", ref: "S01.a", quote: "the shroud does not bear any load", ruling: "supported" },
    ]);
    expect(recordVerdicts(root, SLUG, clock).problems.join(" ")).toMatch(/does not appear/);
  });

  it("counts an overstated claim as its own ruling and fails the chapter", () => {
    // The source says a range, the chapter says a rule. This is the error a no-hedging
    // house style manufactures, and the measured judge literature folds it into
    // "supported" and therefore never sees it.
    const root = makeRoot();
    const plan = auditable(root);
    const chapter = at(plan.chapters, 0);
    writeAudit(root, chapter.id, [
      ...supported(2),
      {
        claim: "Every flange bolt in service is torqued to nine newton metres.",
        ref: "S02.a",
        quote: "An M6 flange bolt is rated to 9 newton metres",
        ruling: "overstated",
        note: "the source rates one fastener type; the chapter generalises it to every bolt in service",
      },
    ]);
    writeCritique(root, chapter.id);

    recordVerdicts(root, SLUG, clock);
    const audit = frontmatterOf(root, chapter).audit;
    expect(audit.faithfulness.overstated).toBe(1);
    expect(audit.faithfulness.supported).toBe(2);
    expect(audit.faithfulness.verdict).toBe("fail");
  });

  it("stamps nothing until both agents have ruled", () => {
    const root = makeRoot();
    const plan = auditable(root);
    const chapter = at(plan.chapters, 0);
    writeAudit(root, chapter.id, supported(3));

    const result = recordVerdicts(root, SLUG, clock);
    expect(at(result.chapters, 0).critique).toBe("pending");
    expect(result.stamped).toEqual([]);
    expect(frontmatterOf(root, chapter).audit).toBeUndefined();
  });

  it("rejects a verdict file that reports on a different chapter", () => {
    const root = makeRoot();
    const plan = auditable(root);
    const chapter = at(plan.chapters, 0);
    const other = at(plan.chapters, 1);
    writeFileSync(
      paths.auditFile(root, SLUG, chapter.id),
      json({ planVersion: PLAN_VERSION, chapter: other.id, auditedAt: AT, claims: supported(2) }),
    );
    writeCritique(root, chapter.id);

    expect(recordVerdicts(root, SLUG, clock).problems.join(" ")).toMatch(/reports on chapter/);
  });

  it("leaves a topic that never passed the validator alone", () => {
    // Statuses move in one direction, and verified sits above validated. Two agents
    // liking the prose is not a route around the mechanical check.
    const root = makeRoot();
    const plan = auditable(root);
    for (const chapter of plan.chapters) {
      writeAudit(root, chapter.id, supported(3));
      writeCritique(root, chapter.id);
    }

    const result = recordVerdicts(root, SLUG, clock);
    expect(result.chapters.every((row) => row.status === "verified")).toBe(true);
    expect(result.topicStatus).toBe("draft");
    expect(result.problems.join(" ")).toMatch(/run npm run forge -- promote/);
  });

  it("promotes the topic to verified once it is validated and every chapter passes", () => {
    const root = makeRoot();
    const plan = auditable(root);
    expect(promoteToValidated(root, SLUG).promoted).toBe(true);
    for (const chapter of plan.chapters) {
      writeAudit(root, chapter.id, supported(3));
      writeCritique(root, chapter.id);
    }

    const result = recordVerdicts(root, SLUG, clock);
    expect(result.topicStatus).toBe("verified");
    // And the stamped material still satisfies the contract, which is the check that
    // ties this to the validator's own rule about what a verified chapter must carry.
    expect(validateTopic(paths.topicDir(root, SLUG), true).findings).toEqual([]);
  });
});
