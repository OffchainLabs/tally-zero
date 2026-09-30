// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { siweApi } from "@/lib/siwe/client";
import { siweKeys } from "@/lib/siwe/keys";
import type { DraftSummary, MeResponse } from "@/lib/siwe/types";

import MyDraftsList from "./MyDraftsList";

const mocks = vi.hoisted(() => ({
  useAccount: vi.fn(),
  signMessageAsync: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useAccount: mocks.useAccount,
  useSignMessage: () => ({ signMessageAsync: mocks.signMessageAsync }),
}));
vi.mock("@reown/appkit/react", () => ({
  useAppKit: () => ({ open: vi.fn() }),
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

const FIRST = "0x1111111111111111111111111111111111111111";
const SECOND = "0x2222222222222222222222222222222222222222";

function session(address: string): MeResponse {
  return {
    address,
    actingAs: null,
    effectiveAddress: address,
    profile: {
      name: null,
      bio: null,
      picture: null,
      twitter: null,
      discourseUsername: null,
      discourseProfileLink: null,
      statement: null,
      isSeekingDelegation: null,
      issues: null,
      sources: {
        name: null,
        bio: null,
        picture: null,
        twitter: null,
        discourseUsername: null,
        discourseProfileLink: null,
        statement: null,
        isSeekingDelegation: null,
        issues: null,
      },
    },
    ownedFields: [],
    safes: [],
  };
}

function draft(title: string): DraftSummary {
  return {
    id: title,
    title,
    governorType: "TREASURY",
    status: "draft",
    shareSlug: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };
}

describe("MyDraftsList wallet changes", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("hides the previous wallet's drafts until the new wallet has a matching session", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(siweKeys.me, session(FIRST));
    client.setQueryData(siweKeys.drafts(FIRST), [draft("First wallet draft")]);
    mocks.useAccount.mockReturnValue({ address: FIRST, isConnected: true });
    const listDrafts = vi
      .spyOn(siweApi, "listDrafts")
      .mockResolvedValue([draft("Second wallet draft")]);
    vi.spyOn(siweApi, "me").mockResolvedValue(session(FIRST));

    const view = render(
      <QueryClientProvider client={client}>
        <MyDraftsList />
      </QueryClientProvider>
    );
    expect(view.getByText("First wallet draft")).toBeDefined();

    mocks.useAccount.mockReturnValue({ address: SECOND, isConnected: true });
    view.rerender(
      <QueryClientProvider client={client}>
        <MyDraftsList />
      </QueryClientProvider>
    );

    expect(view.queryByText("First wallet draft")).toBeNull();
    expect(view.getByTestId("siwe-sign-in")).toBeDefined();
    expect(listDrafts).not.toHaveBeenCalled();

    client.setQueryData(siweKeys.me, session(SECOND));
    await waitFor(() =>
      expect(view.getByText("Second wallet draft")).toBeDefined()
    );
    expect(view.queryByText("First wallet draft")).toBeNull();
    expect(listDrafts).toHaveBeenCalledOnce();
    client.clear();
  });
});
