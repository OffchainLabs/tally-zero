import { defaultSchema } from "rehype-sanitize";

/**
 * Sanitization schema for proposal descriptions (untrusted blockchain input).
 * Allowlist of safe HTML elements to prevent XSS attacks.
 */
export const proposalSanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "br",
    "hr",
    "div",
    "span",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "del",
    "ins",
    "sup",
    "sub",
    "a",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
    "caption",
    "dl",
    "dt",
    "dd",
    "details",
    "summary",
  ],
  attributes: {
    // No `target`: the body is authored by anyone who can publish a draft and
    // the shared-draft page is public, so an author-chosen target with no
    // matching rel is not worth allowing.
    a: ["href", "title", "rel"],
    th: ["align", "valign", "scope"],
    td: ["align", "valign"],
    // Only fenced-code language classes. A bare `className` allowlist lets an
    // author apply any utility class in the Tailwind build (`fixed inset-0
    // z-50 bg-background` paints over the page) wherever raw HTML is expanded
    // before sanitising, as the shared-draft page does.
    code: [["className", /^language-./]],
    pre: [["className", /^language-./]],
    "*": ["id"],
  },
  protocols: {
    href: ["http", "https", "mailto"],
  },
  strip: ["script", "style"],
};
