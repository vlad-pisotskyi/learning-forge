# How topic material is written

Every word a learner reads comes out of this repo: chapter prose, quiz questions, briefs,
rubrics, and what the three roles say in conversation. All of it should read as though a
competent engineer wrote it for another engineer, because prose that reads as machine
output gets skimmed, and skimmed material does not teach.

This is the standard. It is derived from Wikipedia's "Signs of AI writing", maintained by
WikiProject AI Cleanup, at https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing.

Three of these rules are checked by the validator, as warnings that `--strict` turns into
errors. The rest are yours to hold.

## Checked mechanically

No em dashes or en dashes. Use a period, a comma, a colon, or parentheses. This is the
single most reliable tell, so it is a hard constraint rather than a preference.

Straight quotes, not curly ones.

No emoji. Teaching material does not decorate.

Quoted source text inside a blockquote is exempt from all three, since it is someone
else's wording and changing it would be falsifying a quote.

## Not checked, and just as important

**Say the thing instead of announcing it.** Cut "let's look at", "here's what you need to
know", "in this section we will". A heading followed by a sentence that restates the
heading is padding; delete the sentence and start with the content.

**No inflated significance.** Nothing "plays a crucial role", "marks a pivotal moment",
"underscores the importance of", or "reflects a broader shift". If a fact matters, the
reader can see that from the fact.

**Use "is" and "has".** Not "serves as", "stands as", "represents", "boasts", "features".
Copula avoidance is how ordinary sentences get inflated into important-sounding ones.

**Drop participle tails.** A clause ending in "highlighting...", "ensuring...",
"reflecting...", "showcasing...", or "contributing to..." almost always adds nothing that
the main clause did not already say. Cut it or make it a real sentence.

**Avoid the words that cluster in machine prose.** delve, crucial, key (as an adjective),
pivotal, landscape (figurative), tapestry, testament, underscore, showcase, intricate,
interplay, foster, enhance, vibrant, robust, seamless, leverage (as a verb). None is
forbidden in isolation. Several in a paragraph is a confession.

**Do not force triads.** Three items because there are three items is fine. Three because
three sounds complete is a pattern the reader will start to notice and then cannot stop
noticing.

**Vary sentence length.** Machine prose settles into an even mid-length cadence. Real
writing alternates. A short sentence for emphasis is good; four in a row is manufactured
drama.

**Skip the closing flourish.** No "in summary", no "this represents an important step", no
upbeat send-off. End on the last thing worth saying.

**No sycophancy in role replies.** Not "great question", not "you're absolutely right".
The learner asked something; answer it. Respect reads as a straight answer.

**Name specifics.** "Researchers have noted" and "studies show" are placeholders where a
citation belongs. In this repo, a claim either carries a marker resolving to a quoted
excerpt or it does not go in.

**No boldface as decoration**, and no lists whose items are a bold phrase, a colon, then a
sentence restating the phrase. Write the sentences.

**Lowercase headings**, except for proper nouns and acronyms. Not Title Case.

## What not to overcorrect

Plain, dry prose is correct for teaching material. This standard removes inflation, not
clarity, and it does not ask for personality: no first person, no jokes, no opinions in
chapter prose. The right voice for a chapter is a good textbook's, which is neutral
because the subject carries the interest.

Do not flatten a precise technical word because it sounds formal. "Monotonic",
"idempotent", and "orthogonal" are the correct words when they are the correct words.

Do not strip a hedge that the source itself hedges. That is the one failure the
no-hedging rule invites, and turning a source's "often" into a chapter's "always"
produces a false claim from a style rule. State the narrower fact, or say the question is
open and cite both sides.

## Before finishing

Read it back and ask two questions. Would a person write this sentence? Does every claim
in it come from a source that is actually cited? A sentence that fails either one gets
rewritten or cut.
