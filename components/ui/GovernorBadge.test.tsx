import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GOVERNORS, L1_VOTING_GOVERNOR_NAME } from "@/config/governors";

import { GovernorBadge } from "./GovernorBadge";

function render(governorName: string): string {
  return renderToStaticMarkup(<GovernorBadge governorName={governorName} />);
}

describe("GovernorBadge", () => {
  it("labels the Core governor", () => {
    const html = render(GOVERNORS.core.name);
    expect(html).toContain(">Core<");
    expect(html).toContain("text-arb-brand");
  });

  it("labels the Treasury governor", () => {
    const html = render(GOVERNORS.treasury.name);
    expect(html).toContain(">Treasury<");
    expect(html).toContain("text-arb-accent2");
  });

  it("labels the L1 voting governor as its own kind, not Treasury", () => {
    const html = render(L1_VOTING_GOVERNOR_NAME);
    expect(html).toContain(">L1<");
    expect(html).not.toContain("Treasury");
    expect(html).not.toContain("text-arb-accent2");
  });
});
