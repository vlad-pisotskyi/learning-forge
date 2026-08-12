# Stage: chapters

Ends with every chapter body and every quiz written, and the validator naming no
chapter problems.

## 1. Read the worklist off disk

```
npm run forge -- status <slug>
```

The outstanding chapter and quiz ids are the worklist. It is read from disk rather
than remembered, so a session that died mid-stage resumes correctly with no special
handling.

Read `.forge-cache/<slug>/map.approved.json` for the plan. Do not read finished
chapters — the map carries what a writer needs to know about them.

## 2. Write chapters, three at a time

Delegate each outstanding chapter to the `forge-chapter-writer` subagent. Give it,
and only it:

- the topic slug and the chapter's path
- the chapter's entry from the approved map: title, `teaches`, `requires`, outline,
  and its allocated excerpt refs
- the concept blurbs for everything it teaches
- the titles and taught concepts of earlier chapters, so it can build on them without
  reading them
- the quiz path it owes

The writer has no web search, no fetch, and no shell. It cannot look anything up and
it cannot run the validator, so every claim rests on an excerpt already in
`sources.json` and the checking between batches is yours.

Launch at most three at once. Each writer owns exactly one chapter file and one quiz
file, so parallel writers never touch the same file. The chapter file on disk is the
checkpoint — a writer that dies costs one chapter. Run `npm run forge -- status <slug>`
after each batch to read the remaining worklist back.

## 3. Check the batch

```
npm run validate -- topics/<slug>
npm run forge -- status <slug>
```

Expect complaints about chapters and challenges that are still stubs; ignore those.
Act on findings that name a chapter this batch wrote. `forge status` adds the check the
validator cannot make: whether each chapter cited the excerpts the map allocated to it,
rather than ones belonging to a neighbour. The validator only asks whether an excerpt
was cited by someone. Send a chapter back to a fresh
writer with the findings rather than patching prose yourself, because a chapter
patched from outside tends to lose the citation discipline the writer was holding.

Two failures deserve attention beyond what the validator can see:

**A hedge removed from a hedged source.** The no-hedging rule pushes writers toward
turning "often" into "always". That is not a style problem, it is a false claim, and
the faithfulness auditor is pointed straight at it. When a source hedges, either
state the narrower fact it actually supports, or state that the question is open and
cite both sides.

**Citation density satisfied by decoration.** The floor is one marker per 150 words.
A chapter that meets the floor by attaching markers to sentences they do not support
passes the validator and fails the audit.

## 4. Finish the stage

When the worklist is empty and the validator names no chapter problems, report the
chapter count, the total word count, whether any excerpt is still uncited, and stop.
Challenges are a separate invocation.
