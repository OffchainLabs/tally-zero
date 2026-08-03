import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SecurityCouncilTabs } from "./SecurityCouncilTabs";

const mocks = vi.hoisted(() => ({
  usePathname: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: mocks.usePathname,
}));

const ELECTIONS = "/security-council";
const ACTIONS = "/security-council/actions";

describe("SecurityCouncilTabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usePathname.mockReturnValue(ELECTIONS);
  });

  it("renders both tabs", () => {
    const html = renderTabs();

    expect(html).toContain("Elections");
    expect(html).toContain("Security Council Actions");
    expect(html).toContain(`href="${ELECTIONS}"`);
    expect(html).toContain(`href="${ACTIONS}"`);
  });

  it("marks Elections active on the section root", () => {
    const html = renderTabs();

    expect(linkHasCurrentPage(html, ELECTIONS)).toBe(true);
    expect(linkHasCurrentPage(html, ACTIONS)).toBe(false);
  });

  it("keeps Elections active on contender sub-pages", () => {
    mocks.usePathname.mockReturnValue(
      "/security-council/contender/0x1111111111111111111111111111111111111111"
    );

    const html = renderTabs();

    expect(linkHasCurrentPage(html, ELECTIONS)).toBe(true);
    expect(linkHasCurrentPage(html, ACTIONS)).toBe(false);
  });

  it("marks Actions active on the actions route", () => {
    mocks.usePathname.mockReturnValue(ACTIONS);

    const html = renderTabs();

    expect(linkHasCurrentPage(html, ACTIONS)).toBe(true);
    expect(linkHasCurrentPage(html, ELECTIONS)).toBe(false);
  });
});

function renderTabs(): string {
  return renderToStaticMarkup(<SecurityCouncilTabs />);
}

function linkHasCurrentPage(html: string, href: string): boolean {
  const escapedHref = href.replaceAll("/", "\\/");
  return new RegExp(
    `<a(?=[^>]*href="${escapedHref}")(?=[^>]*aria-current="page")`
  ).test(html);
}
