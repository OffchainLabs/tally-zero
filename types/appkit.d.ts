import type { DetailedHTMLProps, HTMLAttributes } from "react";

// Reown AppKit registers <appkit-button> as a custom element (createAppKit).
// Declaring it here lets us render the officially-supported connect control in
// JSX without pulling useAppKit() into components that also run in the
// test-wallet path (where AppKit isn't initialized).
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "appkit-button": DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      >;
    }
  }
}

export {};
