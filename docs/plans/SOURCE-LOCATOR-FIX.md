# Plan: excerpts pinned to a page that cannot contain them

Written 2026-08-14, from the first `--verify` run over a real topic. This is a plan of
record and is frozen. Deferred deliberately: the fix needs web-capable agents and a
research re-run, and it was recorded rather than started.

## What the run said

```
npm run forge -- sources agentic-retrieval --verify
129 verbatim, 33 verbatim apart from formatting, 63 not found
```

Twenty-eight sources, 225 excerpts. Twenty-eight percent of the excerpts the topic is
about to rest on could not be found in the document they name.

Two operational notes before the finding, because both cost a run.

Node's `fetch` is blocked inside the command sandbox. The first attempt failed all
twenty-eight fetches, including hosts that are on the allowlist. Run this one outside the
sandbox.

That failed run printed `0 verbatim, 0 verbatim apart from formatting, 0 not found` and
exited 0. A run that checked nothing is indistinguishable from a clean run at the summary
line, which is the same defect class as the eval bug fixed in `5c9d332`: a check that
reports success when it did no work. Worth fixing on its own, and cheaper than the rest of
this document. A verify run should refuse to summarise when it fetched nothing.

## The finding

Per source, sorted by how badly it did:

| source | verified | url form |
|---|---|---|
| S03 | 1 of 13 | `arxiv.org/abs/` |
| S02 | 1 of 7 | `arxiv.org/abs/` |
| S11 | 3 of 7 | vendor research page |
| S01 | 10 of 17 | `ar5iv.labs.arxiv.org/html/` |
| S17 | 2 of 4 | `arxiv.org/html/` |
| S18 | 2 of 4 | `arxiv.org/html/` |
| S24 | 1 of 2 | dataset card |
| S06 | 1 of 2 | raw source file |

Everything else verified most of its excerpts, and five sources verified all of them.

No source came back with nothing found at all, which is the case the playbook says to act
on. So the playbook's stated trigger did not fire, and there is still a defect. S02 and S03
are it.

Both pin `arxiv.org/abs/<id>`. Both carry locators naming body sections: "Section 5.1, Main
Results", "Section 3.3, Evaluation Metric", "Appendix G, Capped Recall@k Score". An arXiv
abstract page contains the title, the authors, and the abstract. It cannot contain Section
5.1, so those nineteen excerpts could never have verified against the URL recorded beside
them, no matter how faithfully they were copied.

The quotes themselves are probably fine. The researcher read the full text and recorded the
abstract page, so the passage is real and the address is wrong.

## Why the Forge caused this

`.claude/skills/forge-generate/stages/research.md`, step 2, ends with an instruction to pin
the abstract page when a paper is on arXiv, because the abstract page carries the arXiv id
the validator wants and it is the page a reader can navigate from. Both of those reasons are
correct.

`contract/TOPIC-CONTRACT.md` requires a locator precise enough that someone else can find
the passage again, and the research stage's own step 4 names a URL that resolves to a
summary page as a real defect.

So one instruction says pin the abstract page and another says do not pin a page the passage
is not on. Nothing sits between them to notice, and this is the same shape as the drift
class in `DRIFT-GUARDS.md`: two prose files stating rules that contradict each other, with
no mechanical check in the gap. The difference is that this one is not a threshold that
moved. It was wrong the day it was written, and it took a real topic and a real `--verify`
run to surface it, which is an argument for running `--verify` at the end of research rather
than treating it as optional.

The evidence that this is the cause and not a coincidence: S19, S20 and S26 also pin
`arxiv.org/abs/` and verify every excerpt, because their quotes came from the abstract. The
URL form is not the problem. Quoting past what that form contains is.

## The fix

Split the identifier from the locator. They are different jobs and the instruction currently
conflates them.

1. Rewrite step 2 of the research stage. The arXiv id goes in `identifier`, which is what
   the validator's warning actually asks for. The `url` is the page the quote was read from,
   which for anything past the abstract means the full-text render. Say plainly that an
   abstract page may only carry excerpts quoted from the abstract.
2. Say the same thing in `.claude/agents/forge-researcher.md`, which already tells the agent
   to cite the URL it actually read and does not warn about this case.
3. Re-run the S02 and S03 shards. Their quotes need re-pinning against the full text, and a
   re-run is the mechanism: `sources.json` is CLI-generated and the merge owns it, so the fix
   goes in the shard files under `.forge-cache/agentic-retrieval/research/` and then
   `npm run forge -- sources agentic-retrieval` merges again.
4. Re-run `--verify` and expect S02 and S03 to move. Do not expect 225 of 225.

## What is not a defect, and why the number stays high

Most of the remaining sixty-three misses are renderer artifacts, and the excerpt locators
say so in their own words. S03.m records that the HTML edition doubles the math variable `k`
into `kk`. S21.h records that the render writes a subscript as `y<t`. S21.g records that a
table body did not survive markdown conversion. S23 verified forty of forty-four.

That is the reason `--verify` is advisory and has to be read rather than obeyed. A published
document is not a string: list numbering comes from stylesheets, table rules are absent from
the text, and a quote copied from a rendered page picks up typographic quotation marks the
source never had. Turning this into a gate would produce a wall of false alarms and get
switched off within a week.

So the target is not zero misses. The target is zero sources whose URL cannot contain the
passages recorded against it, and a person having read the rest.

## What this run also revealed about the check itself

The playbook says to act on "a source where nothing at all was found". No source hit that,
and the worst two were still defects. One excerpt verifying out of thirteen means the URL is
wrong just as surely as zero out of thirteen does; it means one quote happened to come from
the abstract.

So the trigger is worth restating as a proportion rather than a floor, in the same way the
primary-source rule already was. A source that verified almost nothing is the thing to look
at, and "almost nothing" is the honest phrasing. That restatement belongs in step 4 of the
research stage alongside the rest of this fix.
