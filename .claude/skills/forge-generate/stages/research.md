# Stage: research

Ends with `topics/<slug>/sources.json` holding every source the topic will cite,
each excerpt copied verbatim with a locator and a retrieval date. No chapter map,
no prose, no opinions about chapter order yet.

This stage is the only one with web access. Everything the rest of the run is
allowed to claim has to be pinned here first.

## 1. Split the subject into shards

A shard is one question, narrow enough that one agent can answer it well and
checkpoint it in a single pass. For a twelve-chapter topic, expect six to twelve
shards.

Write the split to `.forge-cache/<slug>/shards.md` before spawning anything, one
line per shard: the shard name in kebab-case, then the question. That file is the
run's memory of what was planned, so a resumed session can tell a shard that failed
from a shard that was never started.

A good shard is a question with an answer that lives in primary sources: "how does
the original BM25 formulation define term saturation, and what does the paper say
about the k1 and b parameters". A bad shard is a topic heading: "BM25". Headings
produce surveys, and a survey cannot be pinned to a quote.

Name the shards so their alphabetical order matches their teaching order where that
is natural. Source ids are handed out in shard order, so `S01` then lands in the
early material and the numbering reads sensibly. A two-digit prefix is the plainest
way to get that, as in `01-rag-formulation`, and the shard name may open with it.
Whatever the name is, it has to match the filename, which the merge checks.

## 2. Run the shards, three at a time

Delegate each shard to the `forge-researcher` subagent. Give it the shard name, the
question, and the target file `.forge-cache/<slug>/research/<shard>.json`. The `shard`
field inside the file has to equal the filename without its extension, or the merge
rejects it.

Launch at most three concurrently. When a batch returns, confirm each shard file
exists and parses before starting the next batch. A shard that failed gets one
retry; a shard that fails twice gets recorded in `shards.md` as unresolved and the
map stage works without it.

Do not read the shard files into this context. The merge step reads them, and the
map stage reads the merged result.

One instruction worth putting in every shard prompt: the arXiv id belongs in `identifier`,
and the `url` is the page the quote was actually read from. Those are two different jobs
and running them together is a defect this repo has already paid for. An abstract page may
carry excerpts quoted from the abstract and nothing else, because a locator naming Section
5.1 against a page holding only the abstract can never be checked, and the contract asks
for a locator precise enough to find the passage again. Quote from the full-text render
and cite it. The merge folds the abstract page, the PDF, and the ar5iv renders onto one
identifier, so a full-text URL costs the topic nothing: it still resolves to one source
carrying the id the validator wants.

Another is a budget on fetching. A shard that crawls outward from whatever it lands on
first pays for the whole surface of a large documentation site to reach the four pages
that matter. Where an index over the material exists, meaning a repository's generated
wiki, a specification's table of contents, a paper's related-work section, the shard
reads that first and writes down a shortlist before fetching anything: the specific
pages and files it expects to carry the definitions, one line each on what it expects to
find there. Then it fetches what the shortlist names and aims for around ten fetches,
recording in `openQuestions` why it went further if it did. Ten is not a wall. A shard
starved of sources produces a chapter that hedges, and no later stage can fix that.

The shortlist is a pointer and never evidence, including evidence about what a page
contains, so a shortlisted page that does not hold what was predicted is a miss to record
and move past rather than a claim to write down. Its text does not travel either: an
index page is long, and carrying it forward alongside everything the shard then fetches
spends more than the crawl it replaced. An index generated about a document rather than
published by it cannot be quoted at all, because the claim would then rest on a machine
paraphrase, and a quote that is verbatim from a wrong paraphrase is the one failure the
auditor cannot catch.

## 3. Merge

```
npm run forge -- sources <slug>
```

This folds every shard into `sources.json`, hands out source ids in shard order, and
folds duplicate excerpts from different shards into one entry. It also folds URL
spellings that name the same document: the host without `www.`, the path without a
trailing slash or a `.txt`/`.html` extension, the fragment dropped, and every arXiv
mirror of a paper onto its identifier. Two shards reaching one RFC through
`/rfc/rfc3629` and `/rfc/rfc3629.txt`, or one paper through `arxiv.org/abs/` and
`ar5iv.labs.arxiv.org/html/`, found one source, not two, and the merge says so. A merge that finds a problem writes nothing and names the shard
responsible, so `sources.json` either does not exist or is trustworthy.

Read the summary it prints, not the file. It reports the source count, the excerpt
count, how many of the sources are primary, and how many entries were folded into one
document each. A folded count is expected when shards overlap and is not a defect.

## 4. Check the quotes against the documents

```
npm run forge -- sources <slug> --verify
```

This re-fetches every source and reports, per excerpt, whether it is still in the
document it names. Nothing else in the run does this: the auditor rules a claim
against an excerpt and `forge verify` confirms the auditor quoted the excerpt
correctly, but only this step asks whether the excerpt was ever in the source.

It is advisory, and it has to be read rather than obeyed. A published document is not
a string. List numbering is generated by stylesheets and is absent from the document
text, tables carry rules a quotation reasonably omits, and a quote copied from a
rendered page picks up typographic quotation marks the source never had. Those show
up as `not found` or as `verbatim apart from formatting` and neither is a defect.

What to act on:

- **A source where almost nothing was found.** Not only the ones that scored zero. A
  source that verified one excerpt out of thirteen has a wrong URL just as surely, and it
  reads as a partial success only because one quote happened to come from the page that
  was pinned. Either the quotes are not that document's or the URL points somewhere the
  text does not live. A URL that resolves to a summary page is the common case and it is a
  real defect: the contract requires a locator precise enough to find the passage again,
  and one that leads to the wrong page is not.
- **A source that could not be fetched.** Pin something a reader can reach.

Fix these by re-running the shard that produced the source, not by editing
`sources.json`. The merge owns that file.

## 5. Report and stop

Report the shard count, the source count, the excerpt count, how many sources are
primary, and any shard left unresolved.

Then run the validator over the topic and report its warnings as it words them:

```
npm run validate -- topics/<slug> --strict
```

Do not decide by eye which sources would trip a rule. The validator holds the conditions,
they have moved before, and a report derived from the tool is still right on the day the
tool changes. `promote` runs `--strict`, so anything warned about is something the topic
cannot reach `validated` while carrying.

Two of them concern this stage, and both are cheaper to fix now than after twelve chapters
cite the source. One asks for an identifier on the kinds of source that have one. The other
asks whether the topic's reading leans too heavily on secondary material, which is a
question about the balance and not about any single `primary: false` entry. When either
fires, the fix is to replace the source or correct its kind. Then stop. The map stage is a
separate invocation.

## What counts as done

Every excerpt in `sources.json` is a verbatim quote from a source that was actually
fetched, long enough to stand on its own, with a locator precise enough for the
faithfulness auditor to find it again. A quote reconstructed from memory is a defect
that survives every later check in this repo, because every later check trusts this
file.
