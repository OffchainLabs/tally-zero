"use client";

import { useEffect, useRef, useState } from "react";

/** Options for useInView */
export interface UseInViewOptions {
  /** Margin around the root, forwarded to IntersectionObserver.rootMargin */
  rootMargin?: string;
  /** Stop observing once the element has been seen at least once (default: true) */
  once?: boolean;
}

/**
 * Track whether an element is within the viewport via IntersectionObserver.
 *
 * Returns a ref to attach to the element and a boolean that flips to true once
 * the element intersects. With `once` (the default) the observer disconnects
 * after the first intersection, so it is cheap to use on many table rows that
 * only need to trigger a one-time lazy fetch.
 */
export function useInView<T extends Element = HTMLDivElement>(
  options: UseInViewOptions = {}
): [React.RefObject<T | null>, boolean] {
  const { rootMargin = "0px", once = true } = options;
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // SSR / very old browsers: assume visible so content is never withheld.
    if (typeof IntersectionObserver === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fallback when the observer API is missing
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin, once]);

  return [ref, inView];
}
