/**
 * The excerpt check is the only thing standing between a fabricated quotation and
 * every downstream verdict in this repo, so its two failure directions both matter:
 * calling an honest quote missing trains everyone to ignore it, and calling an
 * invented quote present defeats the point.
 */
import { describe, expect, it } from "vitest";
import { checkSources, plainText, ruleOn } from "../src/source-check.ts";

const RFC = `
   Implementers of UTF-8 need to consider the security aspects of how
   they handle illegal UTF-8 sequences.

Yergeau                     Standards Track                     [Page 9]

RFC 3629                        UTF-8                     November 2003

   A parser which prohibits the octet sequence 2f 2e 2e 2f ("/../") may
   still permit the illegal sequence 2f c0 ae 2e 2f.
`;

const HTML = `
<!doctype html><style>p { color: red }</style><script>var x = "not prose";</script>
<p>A parser which prohibits the octet sequence 2f 2e 2e 2f (&quot;/../&quot;) may
still permit the illegal sequence 2f c0 ae 2e 2f.</p>
<ol><li>If byte is end-of-queue, set the code point to failure.</li>
<li>Otherwise, push the byte to the output.</li></ol>
<p>The term ‘maximal subpart’ refers to the longest valid prefix.</p>
`;

describe("ruling on a pinned excerpt", () => {
  it("finds a quote that the source wrapped across lines", () => {
    expect(ruleOn("Implementers of UTF-8 need to consider the security aspects", RFC)).toBe("verbatim");
  });

  it("finds a quote that spans a page break", () => {
    const quote = "they handle illegal UTF-8 sequences. A parser which prohibits the octet sequence";
    expect(ruleOn(quote, RFC)).toBe("verbatim");
  });

  it("finds a quote whose punctuation the page stored as entities", () => {
    expect(ruleOn('the octet sequence 2f 2e 2e 2f ("/../") may still permit', HTML)).toBe("verbatim");
  });

  it("ignores script and style content, which is not prose", () => {
    expect(plainText(HTML)).not.toContain("not prose");
    expect(plainText(HTML)).not.toContain("color: red");
  });

  it("calls a quote copied with typographic quotation marks a formatting difference", () => {
    expect(ruleOn("The term 'maximal subpart' refers to the longest valid prefix.", HTML)).toBe("spacing");
  });

  it("forgives list numbering, which a stylesheet drew and the document never held", () => {
    expect(ruleOn("1. If byte is end-of-queue, set the code point to failure.", HTML)).toBe("spacing");
  });

  it("does not treat a bracketed cross-reference as a list enumerator", () => {
    // The page links the section number, so tag stripping leaves "10 )" in the
    // document while the quote has "10)". Folding one side and not the other would
    // report an honest quote as missing.
    const doc = "problems. See Security Considerations (<a href='#s10'>section 10</a>) below.";
    expect(ruleOn("problems. See Security Considerations (section 10) below.", doc)).toBe("spacing");
  });

  it("does not forgive digits that carry meaning", () => {
    // The enumerator rule must not reach a specification's byte ranges. If it ever
    // does, a wrong range reads as a formatting difference and the check is worthless.
    const doc = "The range 0000 0080-0000 07FF is encoded as two octets.";
    expect(ruleOn("The range 0000 0080-0000 07FF is encoded as two octets.", doc)).toBe("verbatim");
    expect(ruleOn("The range 0000 0080-0000 06FF is encoded as two octets.", doc)).toBe("missing");
    expect(ruleOn("The range 0000 0080-0000 07FF is encoded as three octets.", doc)).toBe("missing");
  });

  it("calls an invented quote missing", () => {
    expect(ruleOn("UTF-8 permits a five-octet sequence for compatibility with UCS-4.", RFC)).toBe("missing");
  });
});

describe("checking a whole sources file", () => {
  const source = {
    id: "S01",
    url: "https://example.invalid/spec",
    excerpts: [
      { key: "a", locator: "§1", quote: "Implementers of UTF-8 need to consider the security aspects" },
      { key: "b", locator: "§2", quote: "UTF-8 permits a five-octet sequence for compatibility with UCS-4." },
    ],
  };

  it("rules on every excerpt of every source", async () => {
    const checks = await checkSources([source], async () => RFC);
    expect(checks[0]?.fetched).toBe(true);
    expect(checks[0]?.excerpts.map((e) => e.verdict)).toEqual(["verbatim", "missing"]);
  });

  it("records a source it could not fetch as unfetched, not as a pile of bad excerpts", async () => {
    const checks = await checkSources([source], async () => {
      throw new Error("HTTP 404");
    });
    expect(checks[0]?.fetched).toBe(false);
    expect(checks[0]?.note).toBe("HTTP 404");
    expect(checks[0]?.excerpts).toEqual([]);
  });
});
