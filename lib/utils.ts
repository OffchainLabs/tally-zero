import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with clsx support
 * Combines clsx conditional classes with tailwind-merge for proper class deduplication
 * @param inputs - Class values to merge (strings, objects, arrays)
 * @returns Merged class string
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Validate an RPC URL format
 * Accepts empty strings (returns true) for optional URL fields
 * @param url - The URL to validate
 * @returns True if empty, or a valid http/https URL
 */
export function isValidRpcUrl(url: string): boolean {
  if (!url || url.trim() === "") return true;

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}
