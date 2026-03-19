import { describe, expect, test } from "bun:test";
import {
  backtickFenceLength,
  encodeLinkLabel,
  encodeLinkUrl,
  escapeHtmlAttr,
  escapeHtmlContent,
  escapeMarkdown,
} from "../escape.ts";

// ---------------------------------------------------------------------------
// escapeHtmlAttr
// ---------------------------------------------------------------------------

describe("escapeHtmlAttr", () => {
  test("& → &amp;", () => {
    expect(escapeHtmlAttr("a & b")).toBe("a &amp; b");
  });

  test('" → &quot;', () => {
    expect(escapeHtmlAttr('say "hello"')).toBe("say &quot;hello&quot;");
  });

  test("< → &lt;", () => {
    expect(escapeHtmlAttr("a < b")).toBe("a &lt; b");
  });

  test("> → &gt;", () => {
    expect(escapeHtmlAttr("a > b")).toBe("a &gt; b");
  });

  test("single quote is NOT escaped — do not use in single-quoted attribute contexts", () => {
    expect(escapeHtmlAttr("it's fine")).toBe("it's fine");
  });

  test("empty string returns empty string", () => {
    expect(escapeHtmlAttr("")).toBe("");
  });

  test("all escapable chars together", () => {
    expect(escapeHtmlAttr('& " < >')).toBe("&amp; &quot; &lt; &gt;");
  });

  test("already-escaped input is double-escaped — no idempotency", () => {
    // escapeHtmlAttr is not idempotent: & in &amp; is re-escaped to &amp;amp;
    expect(escapeHtmlAttr("&amp;")).toBe("&amp;amp;");
  });

  test("no special chars → unchanged", () => {
    expect(escapeHtmlAttr("hello world")).toBe("hello world");
  });
});

// ---------------------------------------------------------------------------
// escapeHtmlContent
// ---------------------------------------------------------------------------

describe("escapeHtmlContent", () => {
  test("& → &amp;", () => {
    expect(escapeHtmlContent("a & b")).toBe("a &amp; b");
  });

  test("< → &lt;", () => {
    expect(escapeHtmlContent("a < b")).toBe("a &lt; b");
  });

  test("> → &gt;", () => {
    expect(escapeHtmlContent("a > b")).toBe("a &gt; b");
  });

  test('" is NOT escaped — unlike escapeHtmlAttr', () => {
    expect(escapeHtmlContent('say "hello"')).toBe('say "hello"');
  });

  test("single quote is NOT escaped", () => {
    expect(escapeHtmlContent("it's fine")).toBe("it's fine");
  });

  test("empty string returns empty string", () => {
    expect(escapeHtmlContent("")).toBe("");
  });

  test("all escapable chars together", () => {
    expect(escapeHtmlContent("& < >")).toBe("&amp; &lt; &gt;");
  });

  test("already-escaped input is double-escaped — no idempotency", () => {
    expect(escapeHtmlContent("&amp;")).toBe("&amp;amp;");
  });

  test("no special chars → unchanged", () => {
    expect(escapeHtmlContent("hello world")).toBe("hello world");
  });
});

// ---------------------------------------------------------------------------
// encodeLinkUrl
// ---------------------------------------------------------------------------

describe("encodeLinkUrl", () => {
  test(") → %29", () => {
    expect(encodeLinkUrl("https://example.com/a)b")).toBe("https://example.com/a%29b");
  });

  test("( → %28", () => {
    expect(encodeLinkUrl("https://example.com/a(b")).toBe("https://example.com/a%28b");
  });

  test("URL with no special chars → unchanged", () => {
    expect(encodeLinkUrl("https://example.com/path")).toBe("https://example.com/path");
  });

  test("empty string → empty string", () => {
    expect(encodeLinkUrl("")).toBe("");
  });

  test("[ and ] in URL are not encoded — only parens are in scope", () => {
    expect(encodeLinkUrl("https://example.com/[0]")).toBe("https://example.com/[0]");
  });
});

// ---------------------------------------------------------------------------
// encodeLinkLabel
// ---------------------------------------------------------------------------

describe("encodeLinkLabel", () => {
  test("] → %5D", () => {
    expect(encodeLinkLabel("bracket]alt")).toBe("bracket%5Dalt");
  });

  test("[ → %5B", () => {
    expect(encodeLinkLabel("[bracket")).toBe("%5Bbracket");
  });

  test("both [ and ] together → both encoded", () => {
    expect(encodeLinkLabel("[text]")).toBe("%5Btext%5D");
  });

  test("no special chars → unchanged", () => {
    expect(encodeLinkLabel("plain alt text")).toBe("plain alt text");
  });

  test("empty string → empty string", () => {
    expect(encodeLinkLabel("")).toBe("");
  });

  test("( and ) in label are not encoded — only brackets are in scope", () => {
    expect(encodeLinkLabel("alt (note)")).toBe("alt (note)");
  });
});

// ---------------------------------------------------------------------------
// backtickFenceLength
// ---------------------------------------------------------------------------

describe("backtickFenceLength", () => {
  test("no backticks in content → 1 (minimum for inline)", () => {
    expect(backtickFenceLength("hello world")).toBe(1);
  });

  test("no backticks → 3 when minimum is 3 (fenced block)", () => {
    expect(backtickFenceLength("hello world", 3)).toBe(3);
  });

  test("single backtick in content → 2", () => {
    expect(backtickFenceLength("a`b")).toBe(2);
  });

  test("run of 2 backticks → 3", () => {
    expect(backtickFenceLength("a``b")).toBe(3);
  });

  test("run of 3 backticks in content → 4 (overrides minimum=3)", () => {
    expect(backtickFenceLength("a```b", 3)).toBe(4);
  });

  test("multiple separate runs — uses longest run", () => {
    expect(backtickFenceLength("a`b``c`d")).toBe(3);
  });

  test("empty string → minimum (1)", () => {
    expect(backtickFenceLength("")).toBe(1);
  });

  test("empty string → minimum (3)", () => {
    expect(backtickFenceLength("", 3)).toBe(3);
  });

  test("content that is all backticks → length + 1", () => {
    expect(backtickFenceLength("```")).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// escapeMarkdown
// ---------------------------------------------------------------------------

describe("escapeMarkdown", () => {
  test("plain text is unchanged", () => {
    expect(escapeMarkdown("hello world")).toBe("hello world");
  });

  test("empty string is unchanged", () => {
    expect(escapeMarkdown("")).toBe("");
  });

  test("** → \\*\\*", () => {
    expect(escapeMarkdown("**bold**")).toBe("\\*\\*bold\\*\\*");
  });

  test("_italic_ → \\_italic\\_", () => {
    expect(escapeMarkdown("_italic_")).toBe("\\_italic\\_");
  });

  test("backtick → \\`", () => {
    expect(escapeMarkdown("`code`")).toBe("\\`code\\`");
  });

  test("[link](url) → all metacharacters escaped", () => {
    expect(escapeMarkdown("[link](url)")).toBe("\\[link\\]\\(url\\)");
  });

  test("backslash → \\\\", () => {
    expect(escapeMarkdown("a\\b")).toBe("a\\\\b");
  });

  test("# heading trigger → \\#", () => {
    expect(escapeMarkdown("# heading")).toBe("\\# heading");
  });

  test("! image trigger → \\!", () => {
    expect(escapeMarkdown("!important")).toBe("\\!important");
  });

  test("| pipe → \\|", () => {
    expect(escapeMarkdown("a | b")).toBe("a \\| b");
  });

  test("~ tilde → \\~", () => {
    expect(escapeMarkdown("~~strike~~")).toBe("\\~\\~strike\\~\\~");
  });

  test("& ampersand is NOT escaped — HTML concern, not markdown", () => {
    expect(escapeMarkdown("a & b")).toBe("a & b");
  });
});
