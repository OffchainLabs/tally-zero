import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DelegatesSideMenu } from "./DelegatesSideMenu";

const mocks = vi.hoisted(() => ({
  usePathname: vi.fn(),
  useL1VotingDeployment: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: mocks.usePathname,
}));

vi.mock("@/hooks/use-l1-voting-deployment", () => ({
  useL1VotingDeployment: mocks.useL1VotingDeployment,
}));

describe("DelegatesSideMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usePathname.mockReturnValue("/delegates");
    mocks.useL1VotingDeployment.mockReturnValue({
      deployment: null,
      isPending: false,
    });
  });

  it("hides L1 voting registration while no L1 voting deployment is served", () => {
    expect(renderMenu()).not.toContain('href="/delegates/l1-registration"');
  });

  it("links L1 voting registration once the indexer serves a deployment", () => {
    mocks.useL1VotingDeployment.mockReturnValue({
      deployment: { governor: "0x1" },
      isPending: false,
    });
    expect(renderMenu()).toContain('href="/delegates/l1-registration"');
  });

  it("marks Delegates active for delegate list and profile routes", () => {
    mocks.usePathname.mockReturnValue(
      "/delegates/0x1111111111111111111111111111111111111111"
    );

    const html = renderMenu();

    expect(linkHasCurrentPage(html, "/delegates")).toBe(true);
    expect(linkHasCurrentPage(html, "/delegates/my-delegation")).toBe(false);
  });

  it("marks My Delegation active only on the My Delegation route", () => {
    mocks.usePathname.mockReturnValue("/delegates/my-delegation");

    const html = renderMenu();

    expect(linkHasCurrentPage(html, "/delegates/my-delegation")).toBe(true);
    expect(linkHasCurrentPage(html, "/delegates")).toBe(false);
  });
});

function renderMenu(): string {
  return renderToStaticMarkup(<DelegatesSideMenu />);
}

function linkHasCurrentPage(html: string, href: string): boolean {
  const escapedHref = href.replaceAll("/", "\\/");
  return new RegExp(
    `<a(?=[^>]*href="${escapedHref}")(?=[^>]*aria-current="page")`
  ).test(html);
}
