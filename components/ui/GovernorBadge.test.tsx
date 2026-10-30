import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { L1_VOTING_GOVERNOR_NAME } from "@/config/governors";

import { GovernorBadge } from "./GovernorBadge";

describe("GovernorBadge", () => {
  it("labels each governor", () => {
    expect(
      renderToStaticMarkup(<GovernorBadge governorName="Core Governor" />)
    ).toContain(">Core<");
    expect(
      renderToStaticMarkup(<GovernorBadge governorName="Treasury Governor" />)
    ).toContain(">Treasury<");
  });

  it("labels the L1 voting governor apart from Treasury", () => {
    const html = renderToStaticMarkup(
      <GovernorBadge governorName={L1_VOTING_GOVERNOR_NAME} />
    );

    expect(html).toContain(">L1 Voting<");
    expect(html).not.toContain("Treasury");
    expect(html).not.toContain("arb-accent2");
    expect(html).toContain("violet");
  });
});
