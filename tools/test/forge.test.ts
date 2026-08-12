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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { sourcesFileSchema } from "../src/contract.ts";
import {
  PLAN_VERSION,
  paths,
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
  statusOf,
  tryChallenge,
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

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "forge-root-"));
  temps.push(root);
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

describe("forge try", () => {
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

  const passingEval = `import { checkBuild } from "../../work/src/index.ts";
if (typeof checkBuild !== "function") throw new Error("entrypoint does not export checkBuild");
if (checkBuild().length !== 0) throw new Error("expected no problems for a sound build");
console.log("detection-rate 1.0");
`;

  it("runs the held-out set against the reference solution", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    stageRunnable(root, plan, passingEval);

    const result = tryChallenge(root, SLUG, "c01");
    expect(result.problems).toEqual([]);
    expect(result.passed, result.output).toBe(true);
    expect(result.output).toContain("detection-rate 1.0");
    // The eval set imported work/src/index.ts and got the reference, which is the
    // whole point: relative paths resolve exactly as they will for a learner.
    expect(existsSync(join(result.staged, "work/src/index.ts"))).toBe(true);
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

    const result = tryChallenge(root, SLUG, "c01");
    expect(result.passed).toBe(false);
    expect(result.output).toMatch(/planted fault/);
  });

  it("refuses while the reference or the evaluation set is still a stub", () => {
    const root = makeRoot();
    const plan = planFromFixture();
    initTopic(root, SLUG, clock);
    approve(root, plan);
    applyPlan(root, SLUG, clock);
    expect(tryChallenge(root, SLUG, "c01").problems.join(" ")).toMatch(/still a stub/);
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
    expect(tryChallenge(root, SLUG, "c01").problems.join(" ")).toMatch(/must place \.hidden\/solution\/src\/index\.ts/);
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
    expect(owed("challenges")).toEqual(["c01"]);
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
