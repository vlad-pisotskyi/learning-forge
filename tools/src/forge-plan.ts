/**
 * The Forge's internal plan and checkpoint shapes.
 *
 * These are not part of the topic contract. Nothing a learner reads is described
 * here — this is the generator talking to its own future self across sessions, so
 * it can be changed without a contract version bump.
 *
 * The split that matters: a plan holds *decisions* and nothing else. Every path,
 * filename, and derived field is computed by the functions at the bottom of this
 * file. A field that can be derived is a field that can disagree with itself, so
 * the plan does not carry one.
 */
import { z } from "zod";
import {
  CHALLENGE_ID,
  CHAPTER_ID,
  CONCEPT_ID,
  CONTRACT_VERSION,
  EXCERPT_REF,
  SLUG,
  challengeManifestSchema,
  conceptsFileSchema,
  sourcesFileSchema,
} from "./contract.ts";

export const PLAN_VERSION = 1;

/** Bumped when the generator's own behaviour changes, recorded in topic.json. */
export const GENERATOR = { skill: "forge-generate", version: "0.1.0" } as const;

/**
 * Stages run in this order, one per invocation. The cursor in run.json names the
 * stage that is *finished*, so a fresh topic sits at `init`.
 */
export const STAGES = [
  "init",
  "research",
  "map",
  "apply",
  "chapters",
  "challenges",
  "verify",
  "validated",
] as const;

export type Stage = (typeof STAGES)[number];

const planVersion = z.literal(PLAN_VERSION);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const fileSlug = z.string().regex(/^[a-z][a-z0-9-]{1,60}$/, "expected kebab-case");

/**
 * A shard name may open with a digit, which a chapter or challenge slug may not.
 *
 * The research playbook asks for shard names whose alphabetical order matches their
 * teaching order, because source ids are handed out in that order. A numeric prefix is
 * how anyone actually does that, and `01-rag-formulation` is the name the first real run
 * chose for all eight of its shards. The shared slug rule rejected every one of them: it
 * was written for chapter and challenge slugs, which are `ch01` and `c01` and start with a
 * letter by convention, and the tests used `a-anatomy` and `b-fastening`, so nothing ever
 * put the two conventions in the same room.
 */
const shardSlug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/, "expected kebab-case");

/** A source as a research shard reports it, before ids are handed out. */
export const sourceDraftSchema = sourcesFileSchema.shape.sources.element.omit({ id: true });

export const runStateSchema = z
  .object({
    planVersion,
    slug: z.string().regex(SLUG),
    stage: z.enum(STAGES),
    updated: isoDay,
    log: z.array(
      z.object({ stage: z.enum(STAGES), at: isoDay, note: z.string().min(1) }).strict(),
    ),
  })
  .strict();

/**
 * What an auditor writes in `quote` when the cited excerpt says nothing on the point.
 *
 * A sentinel rather than an empty string, because an empty field reads as a field the
 * auditor forgot rather than a search it actually ran and came back from.
 */
export const NOTHING_FOUND = "NOTHING FOUND";

/**
 * One chapter's faithfulness audit, as the auditor hands it over.
 *
 * It carries rulings and nothing else. No verdict field, no counts: the CLI derives both
 * from the rulings, so an auditor cannot report a pass over a chapter with three
 * unsupported claims in it. That is the same trick the quiz split uses. Where a rule can
 * be made structural instead of trusted, it is.
 *
 * `span` is the passage from the cited excerpt that carries the claim. It is required for
 * a `supported` ruling and refused for any other, which is what stops "supported" from
 * being a thing the auditor can assert without looking.
 */
export const chapterAuditSchema = z
  .object({
    planVersion,
    chapter: z.string().regex(CHAPTER_ID),
    auditedAt: isoDay,
    claims: z
      .array(
        z
          .object({
            /** The claim as the auditor decomposed it, standing alone. */
            claim: z.string().min(10).max(600),
            /** The marker the chapter attached to it. Absent means the claim carries none. */
            ref: z.string().regex(EXCERPT_REF).optional(),
            /**
             * The nearest thing the cited excerpt actually says, quoted verbatim, or
             * NOTHING_FOUND when it says nothing on the point.
             *
             * Declared before `ruling` on purpose. Writing the evidence before the
             * verdict is the best-measured mitigation in the judge literature, and it is
             * cheap: reordering alone moved one reported agreement score from 0.06 to
             * 0.23. Reading order is not execution order for a model that emits JSON in
             * field order, so the field order is the intervention.
             */
            quote: z.string().min(1).max(1200),
            ruling: z.enum([
              "supported",
              "overstated",
              "unsupported",
              "contradicted",
              "unreachable",
            ]),
            /** Why, for anything that is not plainly supported. */
            note: z.string().min(10).max(600).optional(),
          })
          .strict()
          .refine((claim) => claim.ruling !== "supported" || claim.quote !== NOTHING_FOUND, {
            message: `a "supported" ruling cannot quote ${NOTHING_FOUND}`,
          })
          .refine((claim) => claim.ruling === "supported" || claim.note !== undefined, {
            message: "a ruling other than supported must say why",
          })
          .refine((claim) => claim.ruling === "unreachable" || claim.ref !== undefined, {
            message: "a claim ruled against a source must name the marker it cites",
          }),
      )
      .min(1),
  })
  .strict();

/**
 * One chapter's pedagogical critique.
 *
 * A critique verdict cannot be derived the way a faithfulness verdict can, since quality
 * is the judgement being asked for. So the derivable part is made derivable: the verdict
 * is a pass when no finding is blocking, and the critic records findings rather than a
 * grade. A critic that wants to fail a chapter has to name what is wrong with it.
 */
export const chapterCritiqueSchema = z
  .object({
    planVersion,
    chapter: z.string().regex(CHAPTER_ID),
    auditedAt: isoDay,
    findings: z.array(
      z
        .object({
          kind: z.enum([
            "prerequisite-gap",
            "ordering",
            "concept-not-taught",
            "concept-not-exercised",
            "unexplained-term",
            "example-missing",
            "quiz-mismatch",
            "prose",
          ]),
          detail: z.string().min(20).max(1200),
          /**
           * Last on purpose, for the same reason `quote` precedes `ruling` in an audit:
           * naming the problem before grading its weight is the one mitigation in the
           * judge literature with a clean measured effect.
           */
          severity: z.enum(["blocking", "advisory"]),
        })
        .strict(),
    ),
    /** What the chapter does well, so a revision does not remove it. */
    keep: z.array(z.string().min(10).max(400)).optional(),
  })
  .strict();

/**
 * One research shard: one question, answered once, checkpointed on its own. The
 * shard is the unit of loss — a dead agent costs this file and nothing else.
 */
export const researchShardSchema = z
  .object({
    planVersion,
    shard: shardSlug,
    question: z.string().min(10),
    completedAt: isoDay,
    sources: z.array(sourceDraftSchema).min(1),
    /** Anything the shard could not settle. The map stage reads these. */
    openQuestions: z.array(z.string().min(5)).optional(),
  })
  .strict();

export const chapterPlanSchema = z
  .object({
    id: z.string().regex(CHAPTER_ID),
    slug: fileSlug,
    title: z.string().min(4).max(80),
    requires: z.array(z.string().regex(CHAPTER_ID)),
    teaches: z.array(z.string().regex(CONCEPT_ID)).min(1),
    estimatedMinutes: z.number().int().min(5).max(120),
    /**
     * The excerpts this chapter is responsible for citing. Allocation happens
     * once, at map time, which is what makes the contract's two-way citation rule
     * satisfiable by construction instead of by luck: every excerpt is allocated
     * to exactly one chapter, and every chapter must cite everything allocated
     * to it.
     */
    cites: z.array(z.string().regex(EXCERPT_REF)).min(1),
    /** Section headings the writer must cover, in order. */
    outline: z.array(z.string().min(3)).min(2),
  })
  .strict();

export const challengePlanSchema = z
  .object({
    id: z.string().regex(CHALLENGE_ID),
    slug: fileSlug,
    title: z.string().min(4).max(80),
    afterChapter: z.string().regex(CHAPTER_ID),
    exercises: z.array(z.string().regex(CONCEPT_ID)).min(1),
    estimatedHours: z.number().min(0.5).max(40),
    /**
     * Omitted means the topic's language. Present means this challenge is deliberately
     * in another one, which is a decision and not something derivable: a topic taught in
     * TypeScript still has to run a document-layout challenge in Python, because that is
     * where the ecosystem is. Optional rather than required so every existing plan stays
     * valid.
     */
    language: z.string().min(1).optional(),
    interface: challengeManifestSchema.shape.interface,
    eval: challengeManifestSchema.shape.eval.omit({ spec: true }),
  })
  .strict();

export const topicPlanSchema = z
  .object({
    planVersion,
    slug: z.string().regex(SLUG),
    title: z.string().min(4).max(80),
    summary: z.string().min(20).max(400),
    language: z.string().min(1),
    concepts: conceptsFileSchema.shape.concepts,
    chapters: z.array(chapterPlanSchema).min(1),
    challenges: z.array(challengePlanSchema).min(1),
  })
  .strict();

export type RunState = z.infer<typeof runStateSchema>;
export type ChapterAudit = z.infer<typeof chapterAuditSchema>;
export type ChapterCritique = z.infer<typeof chapterCritiqueSchema>;
export type ResearchShard = z.infer<typeof researchShardSchema>;
export type SourceDraft = z.infer<typeof sourceDraftSchema>;
export type ChapterPlan = z.infer<typeof chapterPlanSchema>;
export type ChallengePlan = z.infer<typeof challengePlanSchema>;
export type TopicPlan = z.infer<typeof topicPlanSchema>;
export type ChallengeRunner = z.infer<typeof challengeManifestSchema>["eval"]["runner"];

/* ------------------------------------------------------- path conventions */

/**
 * Every derived path lives here. The scaffold writes them, `forge status` reads
 * them, and the tests assert against them, so a convention can only be wrong in
 * one place.
 */
export const paths = {
  topicDir: (root: string, slug: string) => `${root}/topics/${slug}`,
  cacheDir: (root: string, slug: string) => `${root}/.forge-cache/${slug}`,
  runState: (root: string, slug: string) => `${paths.cacheDir(root, slug)}/run.json`,
  researchDir: (root: string, slug: string) => `${paths.cacheDir(root, slug)}/research`,
  shard: (root: string, slug: string, shard: string) =>
    `${paths.researchDir(root, slug)}/${shard}.json`,
  /** The map as proposed. The owner reads this one. */
  planDraft: (root: string, slug: string) => `${paths.cacheDir(root, slug)}/map.json`,
  /** The map as approved. Only this one is ever applied. */
  planApproved: (root: string, slug: string) =>
    `${paths.cacheDir(root, slug)}/map.approved.json`,

  chapterFile: (chapter: ChapterPlan) => `chapters/${chapter.id}-${chapter.slug}.md`,
  quizFile: (chapterId: string) => `quizzes/${chapterId}.quiz.json`,
  challengeDir: (challenge: ChallengePlan) => `challenges/${challenge.id}-${challenge.slug}`,
  /**
   * `.eval.ts` for the JavaScript runners, `.eval.py` for `python`. The runner decides
   * the extension because the runner is what spawns the file: a spec named `.ts` handed
   * to `python3` is a syntax error rather than a failing evaluation. Defaulting to the
   * TypeScript spelling keeps every existing call site and every existing topic correct.
   */
  evalSpec: (challengeId: string, runner: ChallengeRunner = "node") =>
    `.hidden/eval/${challengeId}.eval.${runner === "python" ? "py" : "ts"}`,
  reference: () => ".hidden/solution",
  /**
   * Where the verification agents leave their rulings. One file per chapter per agent, so
   * a dead auditor costs one chapter rather than the pass, and `forge verify` can be run
   * again over whatever is already on disk.
   */
  verdictDir: (root: string, slug: string) => `${paths.cacheDir(root, slug)}/verdicts`,
  auditFile: (root: string, slug: string, chapterId: string) =>
    `${paths.verdictDir(root, slug)}/${chapterId}.audit.json`,
  critiqueFile: (root: string, slug: string, chapterId: string) =>
    `${paths.verdictDir(root, slug)}/${chapterId}.critique.json`,
  /** Where a run stages a mini topic so the eval set's relative paths hold. */
  tryDir: (root: string, slug: string) => `${paths.cacheDir(root, slug)}/try`,
  /** The role templates the generator stamps into every topic. */
  roleTemplate: (root: string, role: string) =>
    `${root}/.claude/skills/forge-generate/templates/${role}.md`,
  roleSkill: (role: string) => `.claude/skills/${role}/SKILL.md`,
} as const;

/**
 * What a role template has substituted into it. Deliberately tiny: a template that
 * embedded the chapter list would go stale the first time the map changed, so the
 * roles read `topic.json` at runtime and only identity is stamped.
 */
export function stampTemplate(template: string, plan: { slug: string; title: string }): string {
  return template.replaceAll("<<SLUG>>", plan.slug).replaceAll("<<TITLE>>", plan.title);
}

/** Anything left unsubstituted is a template bug, and a silent one if unchecked. */
export const UNSTAMPED = /<<[A-Z_]+>>/;

/**
 * `.hidden/solution/` mirrors `work/`, so the reference solution can be staged at
 * the entrypoint the evaluation set imports. Without a fixed mapping there is no
 * way to run the held-out set against the reference, and "the challenge is
 * solvable" stays an assertion nobody checked.
 */
export function referenceEntrypoint(entrypoint: string): string {
  return `${paths.reference()}/${entrypoint.replace(/^work\//, "")}`;
}

/** Marks a file the scaffold created and an author still owes content for. */
export const STUB_MARKER = "forge:stub";

export const isStub = (text: string): boolean => text.includes(STUB_MARKER);

/* ------------------------------------------------------------ derivations */

/**
 * The topic manifest is a projection of the plan. It is never authored.
 *
 * `generatedAt` and `status` are the two fields the plan has no opinion on: the
 * first records when the topic was first written, the second is earned by passing
 * the validator and the verification agents. A caller applying a revised map
 * passes the existing values through.
 */
export function manifestFromPlan(
  plan: TopicPlan,
  generatedAt: string,
  status: "draft" | "validated" | "verified" = "draft",
) {
  return {
    contractVersion: CONTRACT_VERSION,
    slug: plan.slug,
    title: plan.title,
    summary: plan.summary,
    generatedAt,
    generator: { ...GENERATOR },
    language: plan.language,
    status,
    chapters: plan.chapters.map((c) => c.id),
    challenges: plan.challenges.map((c) => c.id),
  };
}

/** Chapter frontmatter, with `order` taken from position so the two cannot drift. */
export function frontmatterFromPlan(plan: TopicPlan, chapter: ChapterPlan) {
  return {
    id: chapter.id,
    title: chapter.title,
    order: plan.chapters.findIndex((c) => c.id === chapter.id) + 1,
    requires: chapter.requires,
    teaches: chapter.teaches,
    quiz: paths.quizFile(chapter.id),
    estimatedMinutes: chapter.estimatedMinutes,
    status: "draft" as const,
  };
}

export function challengeManifestFromPlan(plan: TopicPlan, challenge: ChallengePlan) {
  return {
    contractVersion: CONTRACT_VERSION,
    id: challenge.id,
    title: challenge.title,
    afterChapter: challenge.afterChapter,
    exercises: challenge.exercises,
    language: challenge.language ?? plan.language,
    estimatedHours: challenge.estimatedHours,
    brief: "brief.md",
    rubric: "rubric.md",
    interface: challenge.interface,
    eval: { ...challenge.eval, spec: paths.evalSpec(challenge.id, challenge.eval.runner) },
    reference: paths.reference(),
  };
}

/**
 * Plan-level checks the topic contract cannot make, because they are about the
 * plan rather than about material on disk. Catching these before any prose is
 * written is the entire reason the map stage stops for approval.
 */
export function checkPlan(plan: TopicPlan): string[] {
  const problems: string[] = [];
  const conceptIds = new Set(plan.concepts.map((c) => c.id));
  const orderOf = new Map(plan.chapters.map((c, i) => [c.id, i + 1]));

  const seenChapter = new Set<string>();
  const seenSlug = new Set<string>();
  for (const [index, chapter] of plan.chapters.entries()) {
    if (chapter.id !== `ch${String(index + 1).padStart(2, "0")}`) {
      problems.push(`chapters[${index}]: id ${chapter.id} does not match its position ${index + 1}`);
    }
    if (seenChapter.has(chapter.id)) problems.push(`duplicate chapter id ${chapter.id}`);
    seenChapter.add(chapter.id);
    if (seenSlug.has(chapter.slug)) problems.push(`duplicate chapter slug ${chapter.slug}`);
    seenSlug.add(chapter.slug);

    for (const required of chapter.requires) {
      const at = orderOf.get(required);
      if (at === undefined) problems.push(`${chapter.id} requires ${required}, which is not in the plan`);
      else if (at >= index + 1) problems.push(`${chapter.id} requires ${required}, which does not come earlier`);
    }
    for (const concept of chapter.teaches) {
      if (!conceptIds.has(concept)) problems.push(`${chapter.id} teaches ${concept}, which is not a planned concept`);
    }
  }

  const taught = new Set(plan.chapters.flatMap((c) => c.teaches));
  for (const concept of plan.concepts) {
    if (!taught.has(concept.id)) problems.push(`concept ${concept.id} is taught by no chapter`);
  }

  // One excerpt, one owner. Two chapters citing the same excerpt is allowed by
  // the contract but means the map never decided where the idea belongs.
  const owner = new Map<string, string>();
  for (const chapter of plan.chapters) {
    for (const ref of chapter.cites) {
      const already = owner.get(ref);
      if (already) problems.push(`excerpt ${ref} is allocated to both ${already} and ${chapter.id}`);
      else owner.set(ref, chapter.id);
    }
  }

  const seenChallenge = new Set<string>();
  for (const [index, challenge] of plan.challenges.entries()) {
    if (challenge.id !== `c${String(index + 1).padStart(2, "0")}`) {
      problems.push(`challenges[${index}]: id ${challenge.id} does not match its position ${index + 1}`);
    }
    if (seenChallenge.has(challenge.id)) problems.push(`duplicate challenge id ${challenge.id}`);
    seenChallenge.add(challenge.id);

    const after = orderOf.get(challenge.afterChapter);
    if (after === undefined) {
      problems.push(`${challenge.id} sits after ${challenge.afterChapter}, which is not in the plan`);
      continue;
    }
    for (const concept of challenge.exercises) {
      if (!conceptIds.has(concept)) {
        problems.push(`${challenge.id} exercises ${concept}, which is not a planned concept`);
        continue;
      }
      const firstTaught = plan.chapters.findIndex((c) => c.teaches.includes(concept)) + 1;
      if (firstTaught === 0 || firstTaught > after) {
        problems.push(
          `${challenge.id} exercises ${concept}, first taught at position ${firstTaught || "nowhere"}, but sits after position ${after}`,
        );
      }
    }
  }
  return problems;
}

/**
 * Which excerpts exist, and which the plan has taken responsibility for. An
 * unallocated excerpt is research that was done and then dropped.
 */
export function excerptRefs(sources: z.infer<typeof sourcesFileSchema>): string[] {
  return sources.sources.flatMap((s) => s.excerpts.map((e) => `${s.id}.${e.key}`));
}
