import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { QuorumIndicator } from "./QuorumIndicator";

// 18-decimal wei strings: 12.57M and 90M ARB
const CURRENT = "12570000000000000000000000";
const REQUIRED = "90000000000000000000000000";

describe("QuorumIndicator", () => {
  it("prints the vote and quorum counts beside the percentage when asked", () => {
    const markup = renderToStaticMarkup(
      <QuorumIndicator current={CURRENT} required={REQUIRED} showCounts />
    );

    expect(markup).toContain("14%");
    // Counts are rounded to one decimal so they fit beside the percentage
    expect(markup).toContain("12.6M / 90M");
    expect(markup).toContain("14% of required votes (12.6M / 90M)");
  });

  it("shows only the percentage by default", () => {
    const markup = renderToStaticMarkup(
      <QuorumIndicator current="1" required="1" reached />
    );

    expect(markup).toContain("100%");
    expect(markup).not.toContain(" / ");
  });
});
