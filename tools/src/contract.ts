/**
 * Machine-readable half of contract/TOPIC-CONTRACT.md.
 *
 * When the spec changes, change it there first, then here, then the validator's
 * cross-file checks, then the fixture. The fixture moves last and always moves.
 */
import { z } from "zod";

export const CONTRACT_VERSION = 3;

export const SLUG = /^[a-z][a-z0-9-]{1,48}$/;
export const CHAPTER_ID = /^ch\d{2}$/;
export const CHALLENGE_ID = /^c\d{2}$/;
export const SOURCE_ID = /^S\d{2,3}$/;
export const EXCERPT_KEY = /^[a-z]{1,3}$/;
export const CONCEPT_ID = /^[a-z][a-z0-9-]{1,40}$/;
export const QUESTION_ID = /^q\d+$/;

/** A citation marker: `{{S07.a}}`. Global, so callers must reset `lastIndex`. */
export const MARKER = /\{\{(S\d{2,3})\.([a-z]{1,3})\}\}/g;

/** An excerpt reference as written in JSON: `S07.a`. */
export const EXCERPT_REF = /^S\d{2,3}\.[a-z]{1,3}$/;

/** Rejected in chapter prose. Blockquotes and fenced code are exempt. */
export const HEDGES = [
  "may",
  "might",
  "perhaps",
  "possibly",
  "probably",
  "arguably",
  "some argue",
  "some say",
  "it is believed",
  "is thought to",
  "seems to",
  "tends to",
  "it could be argued",
  "generally considered",
  "widely considered",
] as const;

export const ALLOW_HEDGE = /<!--\s*allow-hedge:\s*([^>]*?)\s*-->/;

export const MIN_CHAPTER_WORDS = 400;
export const WORDS_PER_MARKER = 150;

const version = z.literal(CONTRACT_VERSION);
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .refine((d) => !Number.isNaN(Date.parse(d)), "not a real date");
const isoInstant = z.string().datetime({ offset: true });
const conceptId = z.string().regex(CONCEPT_ID);
const chapterId = z.string().regex(CHAPTER_ID);
const excerptRef = z.string().regex(EXCERPT_REF);
const httpUrl = z.string().url().startsWith("http");

export const topicStatus = z.enum(["draft", "validated", "verified"]);
export const chapterStatus = z.enum(["draft", "verified"]);

export const topicManifestSchema = z
  .object({
    contractVersion: version,
    slug: z.string().regex(SLUG),
    title: z.string().min(4).max(80),
    summary: z.string().min(20).max(400),
    generatedAt: isoDay,
    generator: z
      .object({ skill: z.string().min(1), version: z.string().min(1) })
      .strict(),
    language: z.string().min(1),
    status: topicStatus,
    chapters: z.array(chapterId).min(1),
    challenges: z.array(z.string().regex(CHALLENGE_ID)).min(1),
  })
  .strict();

export const conceptsFileSchema = z
  .object({
    contractVersion: version,
    concepts: z
      .array(
        z
          .object({
            id: conceptId,
            label: z.string().min(3).max(60),
            blurb: z.string().min(10).max(200),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const auditVerdict = z.enum(["pass", "fail", "pending"]);

export const chapterFrontmatterSchema = z
  .object({
    id: chapterId,
    title: z.string().min(4).max(80),
    order: z.number().int().positive(),
    requires: z.array(chapterId),
    teaches: z.array(conceptId).min(1),
    quiz: z.string().min(1),
    estimatedMinutes: z.number().int().min(5).max(120),
    status: chapterStatus,
    audit: z
      .object({
        faithfulness: z
          .object({
            verdict: auditVerdict,
            at: isoDay,
            claims: z.number().int().nonnegative(),
            supported: z.number().int().nonnegative(),
            unsupported: z.number().int().nonnegative(),
            /**
             * The source says "often" and the chapter says "always". Its own count
             * because the measured judge literature folds this into "supported" and
             * therefore misses it, and because a no-hedging house style manufactures
             * exactly this error.
             */
            overstated: z.number().int().nonnegative(),
            contradicted: z.number().int().nonnegative(),
            unreachable: z.number().int().nonnegative(),
          })
          .strict(),
        critique: z
          .object({ verdict: auditVerdict, at: isoDay, notes: z.string().optional() })
          .strict(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * The visible half of a quiz: prompts and the bar, no answers.
 *
 * `.strict()` is what enforces the split. A generator that leaves `answer` or
 * `accept` in this file gets a schema error rather than a quiet leak.
 */
export const quizFileSchema = z
  .object({
    contractVersion: version,
    chapter: chapterId,
    questions: z
      .array(
        z
          .object({
            id: z.string().regex(QUESTION_ID),
            concept: conceptId,
            kind: z.enum(["recall", "application", "discrimination"]),
            prompt: z.string().min(15).max(500).endsWith("?"),
          })
          .strict(),
      )
      .min(3)
      .max(8),
    passing: z.object({ atLeast: z.number().int().min(2) }).strict(),
  })
  .strict();

/** The hidden half: what a right answer contains. Read only by the quiz grader. */
export const quizKeyFileSchema = z
  .object({
    contractVersion: version,
    chapter: chapterId,
    answers: z
      .array(
        z
          .object({
            id: z.string().regex(QUESTION_ID),
            answer: z.string().min(10).max(800),
            accept: z.array(z.string().min(3)).min(1).max(5),
            sourceRefs: z.array(excerptRef).optional(),
          })
          .strict(),
      )
      .min(3)
      .max(8),
  })
  .strict();

export const sourcesFileSchema = z
  .object({
    contractVersion: version,
    sources: z
      .array(
        z
          .object({
            id: z.string().regex(SOURCE_ID),
            /**
             * `report` is measured work published outside a venue: a company technical
             * report, a lab write-up. It is separate from `paper` because the identifier
             * warning below is scoped to the kinds that have an identifier to record, and
             * separate from `docs` because a report says what somebody found rather than
             * how to use something.
             */
            kind: z.enum(["paper", "report", "docs", "spec", "book", "dataset", "code", "standard"]),
            title: z.string().min(4).max(300),
            authors: z.array(z.string().min(2)).optional(),
            published: z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/),
            url: httpUrl,
            identifier: z.string().min(3).optional(),
            retrieved: isoDay,
            primary: z.boolean(),
            excerpts: z
              .array(
                z
                  .object({
                    key: z.string().regex(EXCERPT_KEY),
                    locator: z.string().min(1),
                    quote: z.string().min(20).max(1500),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const challengeManifestSchema = z
  .object({
    contractVersion: version,
    id: z.string().regex(CHALLENGE_ID),
    title: z.string().min(4).max(80),
    afterChapter: chapterId,
    exercises: z.array(conceptId).min(1),
    language: z.string().min(1),
    estimatedHours: z.number().min(0.5).max(40),
    brief: z.string().min(1),
    rubric: z.string().min(1),
    interface: z
      .object({
        entrypoint: z.string().startsWith("work/"),
        exports: z
          .array(
            z
              .object({
                name: z.string().min(1),
                signature: z.string().min(2),
                description: z.string().min(10),
              })
              .strict(),
          )
          .min(1),
      })
      .strict(),
    eval: z
      .object({
        runner: z.enum(["vitest", "node", "python"]),
        spec: z.string().startsWith(".hidden/"),
        metrics: z
          .array(
            z
              .object({
                name: z.string().min(1),
                threshold: z.number(),
                direction: z.enum(["gte", "lte"]),
              })
              .strict(),
          )
          .min(1),
      })
      .strict(),
    reference: z.string().startsWith(".hidden/"),
  })
  .strict();

export const progressFileSchema = z
  .object({
    contractVersion: version,
    topic: z.string().regex(SLUG),
    updated: isoInstant,
    chapters: z.record(
      chapterId,
      z
        .object({
          status: z.enum(["unread", "in-progress", "passed", "needs-review"]),
          quizScore: z.number().int().nonnegative().optional(),
          quizOf: z.number().int().positive().optional(),
          missedConcepts: z.array(conceptId).optional(),
          at: isoInstant.optional(),
        })
        .strict(),
    ),
    weakConcepts: z.array(conceptId),
    challenges: z.record(
      z.string().regex(CHALLENGE_ID),
      z
        .object({
          status: z.enum(["not-started", "in-progress", "submitted", "passed"]),
          attempts: z.number().int().nonnegative(),
          best: z.record(z.string(), z.number()).optional(),
          rubricScore: z.number().min(0).max(100).optional(),
          rubricGaps: z.array(z.string()).optional(),
          at: isoInstant.optional(),
        })
        .strict(),
    ),
  })
  .strict();

export type TopicManifest = z.infer<typeof topicManifestSchema>;
export type ConceptsFile = z.infer<typeof conceptsFileSchema>;
export type ChapterFrontmatter = z.infer<typeof chapterFrontmatterSchema>;
export type QuizFile = z.infer<typeof quizFileSchema>;
export type QuizKeyFile = z.infer<typeof quizKeyFileSchema>;
export type SourcesFile = z.infer<typeof sourcesFileSchema>;
export type ChallengeManifest = z.infer<typeof challengeManifestSchema>;
export type ProgressFile = z.infer<typeof progressFileSchema>;

export const ROLE_SKILLS = ["teach", "help", "judge"] as const;

/** Where a chapter's answer key lives, relative to the topic root. */
export const quizKeyPath = (chapterId: string) => `quizzes/.hidden/${chapterId}.key.json`;
