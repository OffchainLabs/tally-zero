// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ProposalsPage from "@/app/proposals/page";

const mocks = vi.hoisted(() => ({ useSiwe: vi.fn() }));

vi.mock("@/hooks/use-siwe", () => ({ useSiwe: mocks.useSiwe }));
vi.mock("@/components/container/Search", () => ({
  default: () => <p>Proposals table</p>,
}));
vi.mock("@/components/container/SearchSkeleton", () => ({
  default: () => <p>Loading proposals</p>,
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe("/proposals", () => {
  it("keeps New Proposal available before and after signing in", () => {
    mocks.useSiwe.mockReturnValue({ isSignedIn: false });
    const view = render(<ProposalsPage />);

    expect(
      view.getByRole("link", { name: "New Proposal" }).getAttribute("href")
    ).toBe("/proposal/new");
    expect(view.getByRole("link", { name: "My Drafts" })).toBeDefined();

    mocks.useSiwe.mockReturnValue({ isSignedIn: true });
    view.rerender(<ProposalsPage />);

    expect(
      view.getByRole("link", { name: "New Proposal" }).getAttribute("href")
    ).toBe("/proposal/new");
  });
});
