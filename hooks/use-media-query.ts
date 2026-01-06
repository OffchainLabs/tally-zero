import { useEffect, useState } from "react";

const IS_SERVER = typeof window === "undefined";

/**
 * Custom hook for tracking the state of a media query.
 * @param query - The media query to track.
 * @param defaultValue - The default value to return if the hook is being run on the server (default is `false`).
 * @returns The current state of the media query (true if the query matches, false otherwise).
 * @example
 * const isSmallScreen = useMediaQuery('(max-width: 600px)');
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (IS_SERVER) {
      return defaultValue;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (IS_SERVER) return;

    const matchMedia = window.matchMedia(query);

    const handleChange = () => {
      setMatches(matchMedia.matches);
    };

    // Set initial value
    handleChange();

    // Modern browsers
    matchMedia.addEventListener("change", handleChange);

    return () => {
      matchMedia.removeEventListener("change", handleChange);
    };
  }, [query]);

  return matches;
}
