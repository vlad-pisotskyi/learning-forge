# Stage: map

Ends with `.forge-cache/<slug>/map.json` written, checking clean, and the owner
asked to approve it. This is the one stage that stops for a human.

The map is where the topic is actually designed. A wrong chapter order found after
twelve chapters exist costs twelve chapters; found here it costs a paragraph.

## 1. Read the sources

Read `topics/<slug>/sources.json` in full. This is the one place in the run where
reading everything is correct, because the map allocates excerpts, and an excerpt
cannot be allocated without knowing what it says.

Read `.forge-cache/<slug>/shards.md` too, including anything a shard left unresolved.

## 2. Decide the chapter sequence

Work from what the sources support, not from a syllabus you already have in mind. A
chapter exists because there is material to teach and excerpts to teach it from.

- Concepts first. Name every concept the topic teaches, give each a one-sentence
  blurb, and assign each to the chapter that introduces it. A concept no chapter
  teaches is either a missing chapter or noise, and the plan check rejects it.
- A chapter cannot teach more concepts than its quiz has room for questions, because
  a question names one concept and every taught concept needs one. The plan check
  enforces the ceiling; the contract's quiz section carries the number. A chapter
  pressing against it is usually two chapters.
- Order by dependency. `requires` names chapters that must come earlier. Forward
  references and cycles are rejected.
- Allocate every excerpt to exactly one chapter. The chapter that owns an excerpt is
  the chapter responsible for citing it. An excerpt nobody owns is research that was
  done and dropped, and `forge check` names it.
- Give each chapter an outline: the `##` headings in order. The chapter writer treats
  the outline as the section list, so an outline that skips a step produces a chapter
  that skips it.
- Size chapters so `estimatedMinutes` is honest. Twenty to thirty minutes is a
  chapter. Ninety minutes is three chapters that have not been separated.

## 3. Decide the challenges

Each challenge sits after a chapter and exercises concepts taught at or before it.
The plan check enforces that direction; it cannot catch the opposite failure, a
challenge that exercises nothing the chapters bothered to teach, so check that
yourself.

Pin the interface here: the entrypoint under `work/`, and every export with its
signature and a one-line description. The hidden evaluation set imports these
signatures, so they are a public contract and the brief will state them. Pin the
metrics and thresholds too, because the learner is told the bar they are being held
to.

Pin the runner as well, and set the challenge's own `language` when it differs from the
topic's. Both are decisions only this stage makes. `vitest` and `node` run TypeScript and
JavaScript; `python` spawns `python3` and needs nothing installed. A topic taught in one
language can practise in another, and a subject whose tooling lives in Python should say
so here rather than have a challenge author discover it.

## 4. Write the map and check it

Write `.forge-cache/<slug>/map.json` against the shape in `tools/src/forge-plan.ts`
(`topicPlanSchema`). Every path, filename, `order`, and quiz reference is derived by
the CLI, so the map holds decisions only.

```
npm run forge -- check <slug>
```

Fix everything it names, then run it again. Do not show the owner a map that does
not check clean.

## 5. Ask for approval, then stop

Give the owner a compact summary in prose, not the raw JSON:

- the chapter sequence, one line each: id, title, what it teaches, how long
- where each challenge sits and what it asks for
- how many excerpts each chapter owns
- anything the research left unresolved, and what the map did about it
- any judgement call worth overruling: a chapter that could reasonably split, an
  ordering that could go either way, a concept that nearly did not earn a chapter

Then say plainly that approving means copying `map.json` to `map.approved.json`, and
stop. Do not make that copy. Do not begin writing chapters.

Once the owner approves:

```
npm run forge -- apply <slug>
npm run forge -- status <slug>
```

`apply` is safe to re-run after a map revision. It rewrites what the plan owns,
leaves authored prose alone, and reports any file the plan no longer accounts for
rather than deleting it.
