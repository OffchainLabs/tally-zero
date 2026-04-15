/**
 * Strips HTML tags and markdown syntax from text
 * @param text - The text to strip HTML and markdown from
 * @returns Plain text with HTML tags and markdown syntax removed
 */
export function stripMarkdownAndHtml(text: string): string {
  // Remove HTML tags first
  const withoutHtml = text.replace(/<[^>]*>/g, "");
  // Remove markdown syntax
  return withoutHtml.replace(/(\[.*?\]\(.*?\)|[*_`#>])/g, "");
}

function normalizeProposalTitleLine(line: string): string {
  return stripMarkdownAndHtml(line)
    .replace(/\s+/g, " ")
    .replace(/^[\s:;,.!?-]+|[\s:;,.!?-]+$/g, "")
    .trim();
}

function isProposalTitleBoundary(line: string): boolean {
  const normalized = normalizeProposalTitleLine(line).toLowerCase();

  return (
    normalized.includes("non-constitutional") ||
    normalized.startsWith("abstract")
  );
}

function isProposalTitleMetadata(line: string): boolean {
  const normalized = normalizeProposalTitleLine(line).toLowerCase();

  return (
    normalized === "title" ||
    normalized === "author" ||
    normalized === "type" ||
    normalized === "constitutional" ||
    normalized === "non-constitutional" ||
    normalized.startsWith("category:") ||
    normalized.startsWith("author:") ||
    normalized.startsWith("type:") ||
    normalized.startsWith("amendments in light of community feedback") ||
    (/^this is (?:an? )?.*proposal\.?$/.test(normalized) &&
      normalized.includes("constitutional"))
  );
}

function truncateProposalTitleAtDelimiter(title: string): string {
  let searchIndex = 0;

  while (searchIndex < title.length) {
    const delimiterIndex = title.indexOf(" - ", searchIndex);
    if (delimiterIndex === -1) {
      return title;
    }

    const prefix = title.slice(0, delimiterIndex).trimEnd();
    if (prefix.length <= 20) {
      searchIndex = delimiterIndex + 3;
      continue;
    }

    return prefix || title;
  }

  return title;
}

/**
 * Extracts a concise proposal title from the markdown description.
 * Prefers the title block before "Non-Constitutional" or "Abstract",
 * and skips proposal metadata such as author/type/category lines.
 */
export function extractProposalTitle(description: string): string {
  if (!description) return "";

  const lines = description.replace(/\r\n?/g, "\n").split("\n");
  const titleLines: string[] = [];

  for (const line of lines) {
    if (isProposalTitleBoundary(line)) {
      break;
    }

    const normalized = normalizeProposalTitleLine(line);
    if (!normalized) {
      continue;
    }

    const explicitTitleMatch = normalized.match(
      /^(?:proposal|title)\s*:\s*(.+)$/i
    );
    if (explicitTitleMatch) {
      const explicitTitle = explicitTitleMatch[1].trim();

      if (titleLines.length === 0 && explicitTitle) {
        titleLines.push(explicitTitle);
        continue;
      }

      break;
    }

    if (isProposalTitleMetadata(line)) {
      if (titleLines.length > 0) {
        break;
      }
      continue;
    }

    titleLines.push(normalized);

    if (titleLines.length >= 2) {
      break;
    }
  }

  const dedupedTitleLines = titleLines.filter(
    (line, index, allLines) =>
      index === 0 || line.toLowerCase() !== allLines[index - 1]?.toLowerCase()
  );

  const title = dedupedTitleLines.slice(0, 2).join(" - ").trim();
  if (title) {
    const truncatedTitle = truncateProposalTitleAtDelimiter(title);
    return truncatedTitle || title;
  }

  return stripMarkdownAndHtml(description).replace(/\s+/g, " ").trim();
}

/**
 * Truncates text to a maximum length with ellipsis
 * @param text - The text to truncate
 * @param maxLength - Maximum length before truncation (default: 150)
 * @returns Original text or truncated text with "..." appended
 */
export function truncateText(text: string, maxLength = 150): string {
  return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
}

/**
 * Truncates a string in the middle, keeping the start and end visible
 *
 * @param text - The text to truncate
 * @param startChars - Number of characters to keep at the start (default: 10)
 * @param endChars - Number of characters to keep at the end (default: 8)
 * @returns Truncated string with ellipsis in the middle, or original if short enough
 *
 * @example
 * truncateMiddle("0x1234567890abcdef", 6, 4) // "0x1234...cdef"
 * truncateMiddle("short") // "short"
 */
export function truncateMiddle(
  text: string,
  startChars = 10,
  endChars = 8
): string {
  const minLength = startChars + endChars + 3; // 3 for "..."
  if (text.length <= minLength) return text;
  return text.slice(0, startChars) + "..." + text.slice(-endChars);
}
