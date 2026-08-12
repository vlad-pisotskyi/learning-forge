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
early material and the numbering reads sensibly.

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

## 3. Merge

```
npm run forge -- sources <slug>
```

This folds every shard into `sources.json`, hands out source ids in shard order, and
folds duplicate excerpts from different shards into one entry. A merge that finds a
problem writes nothing and names the shard responsible, so `sources.json` either does
not exist or is trustworthy.

Read the summary it prints, not the file. It reports the source count, the excerpt
count, and how many of the sources are primary.

## 4. Report and stop

Report the shard count, the source count, the excerpt count, how many sources are
primary, and any shard left unresolved. Flag the non-primary sources explicitly, and
any paper with no DOI or arXiv identifier: each of those is a validator warning, and
`promote` runs the validator under `--strict`, so the topic cannot reach `validated`
while one remains. Better to replace a secondary source with the primary it describes
now than after twelve chapters cite it. Then stop. The map stage is a separate
invocation.

## What counts as done

Every excerpt in `sources.json` is a verbatim quote from a source that was actually
fetched, long enough to stand on its own, with a locator precise enough for the
faithfulness auditor to find it again. A quote reconstructed from memory is a defect
that survives every later check in this repo, because every later check trusts this
file.
