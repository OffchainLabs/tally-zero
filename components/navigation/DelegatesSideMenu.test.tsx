import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DelegatesSideMenu } from "./DelegatesSideMenu";

const mocks = vi.hoisted(() => ({
  usePathname: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: mocks.usePathname,
}));

describe("DelegatesSideMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usePathname.mockReturnValue("/delegates");
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
