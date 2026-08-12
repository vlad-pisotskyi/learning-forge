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
  "validated",
] as const;

export type Stage = (typeof STAGES)[number];

const planVersion = z.literal(PLAN_VERSION);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const fileSlug = z.string().regex(/^[a-z][a-z0-9-]{1,60}$/, "expected kebab-case");

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
 * One research shard: one question, answered once, checkpointed on its own. The
 * shard is the unit of loss — a dead agent costs this file and nothing else.
 */
export const researchShardSchema = z
  .object({
    planVersion,
    shard: fileSlug,
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
export type ResearchShard = z.infer<typeof researchShardSchema>;
export type SourceDraft = z.infer<typeof sourceDraftSchema>;
export type ChapterPlan = z.infer<typeof chapterPlanSchema>;
export type ChallengePlan = z.infer<typeof challengePlanSchema>;
export type TopicPlan = z.infer<typeof topicPlanSchema>;

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
  evalSpec: (challengeId: string) => `.hidden/eval/${challengeId}.eval.ts`,
  reference: () => ".hidden/solution",
  /** Where a dry run stages a mini topic so the eval set's relative paths hold. */
  tryDir: (root: string, slug: string) => `${paths.cacheDir(root, slug)}/try`,
} as const;

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
    language: plan.language,
    estimatedHours: challenge.estimatedHours,
    brief: "brief.md",
    rubric: "rubric.md",
    interface: challenge.interface,
    eval: { ...challenge.eval, spec: paths.evalSpec(challenge.id) },
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
