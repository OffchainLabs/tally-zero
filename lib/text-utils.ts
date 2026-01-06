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

/**
 * Truncates text to a maximum length with ellipsis
 * @param text - The text to truncate
 * @param maxLength - Maximum length before truncation (default: 100)
 * @returns Original text or truncated text with "..." appended
 */
export function truncateText(text: string, maxLength = 100): string {
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
