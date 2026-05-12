import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { TallyDelegateProfile } from "@/lib/delegate-data";

import { DelegateProfile, getDelegateDisplayName } from "./DelegateProfile";

const DELEGATE_ADDRESS = "0x1111111111111111111111111111111111111111";

function renderProfile(delegate: TallyDelegateProfile): string {
  return renderToStaticMarkup(
    <DelegateProfile address={DELEGATE_ADDRESS} delegate={delegate} />
  );
}

function createDelegate(
  overrides: {
    account?: Partial<TallyDelegateProfile["account"]>;
    knownLabel?: string | null;
    statement?: Partial<TallyDelegateProfile["statement"]>;
  } = {}
): TallyDelegateProfile {
  return {
    account: {
      address: DELEGATE_ADDRESS,
      bio: "Delegate biography",
      ens: "delegate.eth",
      name: "Account Delegate",
      picture: "https://example.com/avatar.png",
      twitter: "delegate_handle",
      ...overrides.account,
    },
    delegateEligibility: null,
    delegatorsCount: 1234,
    id: "delegate-id",
    isPrioritized: false,
    knownLabel: Object.prototype.hasOwnProperty.call(overrides, "knownLabel")
      ? (overrides.knownLabel ?? null)
      : "Known Delegate",
    labels: [],
    statement: {
      isSeekingDelegation: true,
      statement: "I care about **governance**.",
      statementSummary: "Statement summary",
      ...overrides.statement,
    },
    votesCount: "1230000000000000000000",
  };
}

vi.mock("@/components/delegate/DelegationCard", () => ({
  DelegationCard: ({
    delegateAddress,
    delegateName,
  }: {
    delegateAddress: string;
    delegateName: string;
  }) => (
    <div data-testid="delegation-card">
      DelegationCard:{delegateAddress}:{delegateName}
    </div>
  ),
}));

vi.mock("@/components/delegate/DelegateVotesLoader", () => ({
  DelegateVotesLoader: ({ address }: { address: string }) => (
    <div data-testid="delegate-votes-loader">Votes for {address}</div>
  ),
}));

vi.mock("@/components/ui/Tabs", () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsContent: ({
    children,
    value,
  }: {
    children: ReactNode;
    value: string;
  }) => <div data-tab-content={value}>{children}</div>,
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({
    children,
    value,
  }: {
    children: ReactNode;
    value: string;
  }) => <button data-tab-trigger={value}>{children}</button>,
}));

describe("DelegateProfile", () => {
  describe("getDelegateDisplayName", () => {
    it("uses known labels before account metadata", () => {
      const delegate = createDelegate({
        account: {
          ens: "ens-name.eth",
          name: "Account Name",
        },
        knownLabel: "Known Label",
      });

      expect(getDelegateDisplayName(delegate, DELEGATE_ADDRESS)).toBe(
        "Known Label"
      );
    });

    it("falls back to account name, ENS, then shortened address", () => {
      const namedDelegate = createDelegate({
        account: {
          ens: "ens-name.eth",
          name: "Account Name",
        },
        knownLabel: null,
      });
      const ensDelegate = createDelegate({
        account: {
          ens: "ens-name.eth",
          name: "",
        },
        knownLabel: null,
      });
      const addressOnlyDelegate = createDelegate({
        account: {
          ens: "",
          name: "",
        },
        knownLabel: null,
      });

      expect(getDelegateDisplayName(namedDelegate, DELEGATE_ADDRESS)).toBe(
        "Account Name"
      );
      expect(getDelegateDisplayName(ensDelegate, DELEGATE_ADDRESS)).toBe(
        "ens-name.eth"
      );
      expect(
        getDelegateDisplayName(addressOnlyDelegate, DELEGATE_ADDRESS)
      ).toBe("0x1111...1111");
    });
  });

  it("renders an unknown delegate card when no profile data exists", () => {
    const html = renderToStaticMarkup(
      <DelegateProfile address={DELEGATE_ADDRESS} delegate={null} />
    );

    expect(html).toContain("Delegate");
    expect(html).toContain(DELEGATE_ADDRESS);
    expect(html).toContain(
      `href="https://arbiscan.io/address/${DELEGATE_ADDRESS}"`
    );
    expect(html).not.toContain("DelegationCard:");
  });

  it("renders header identity, stats, statement, votes, and delegation controls", () => {
    const delegate = createDelegate();

    const html = renderProfile(delegate);

    expect(html).toContain("Known Delegate");
    expect(html).toContain("Delegate biography");
    expect(html).toContain("Seeking Delegation");
    expect(html).toContain('src="https://example.com/avatar.png"');
    expect(html).toContain(DELEGATE_ADDRESS);
    expect(html).toContain(
      `href="https://arbiscan.io/address/${DELEGATE_ADDRESS}"`
    );
    expect(html).toContain("delegate.eth");
    expect(html).toContain('href="https://x.com/delegate_handle"');
    expect(html).toContain("@delegate_handle");

    expect(html).toContain("Voting Power");
    expect(html).toContain("1.23K ARB");
    expect(html).toContain("Delegators");
    expect(html).toContain("1,234");
    expect(html).toContain(`DelegationCard:${DELEGATE_ADDRESS}:Known Delegate`);

    expect(html).toContain("Delegate Statement");
    expect(html).toContain("Statement summary");
    expect(html).toContain("<strong>governance</strong>");
    expect(html).toContain("Past Votes");
    expect(html).toContain(`Votes for ${DELEGATE_ADDRESS}`);
  });

  it("renders empty optional profile fields and an empty statement message", () => {
    const delegate = createDelegate({
      account: {
        bio: "",
        ens: "",
        name: "Named Delegate",
        picture: null,
        twitter: "",
      },
      knownLabel: null,
      statement: {
        isSeekingDelegation: false,
        statement: "   ",
        statementSummary: "",
      },
    });

    const html = renderProfile(delegate);

    expect(html).toContain("Named Delegate");
    expect(html).not.toContain("Seeking Delegation");
    expect(html).not.toContain("delegate.eth");
    expect(html).not.toContain("x.com");
    expect(html).not.toContain("<img");
    expect(html).toContain("This delegate has not published a statement.");
    expect(html).toContain(`DelegationCard:${DELEGATE_ADDRESS}:Named Delegate`);
  });

  it("falls back to ENS and then shortened address for display names", () => {
    const ensDelegate = createDelegate({
      account: {
        ens: "fallback.eth",
        name: "",
      },
      knownLabel: null,
    });
    const addressOnlyDelegate = createDelegate({
      account: {
        ens: "",
        name: "",
      },
      knownLabel: null,
    });

    const ensHtml = renderProfile(ensDelegate);
    const addressHtml = renderProfile(addressOnlyDelegate);

    expect(ensHtml).toContain("fallback.eth");
    expect(ensHtml).toContain(
      `DelegationCard:${DELEGATE_ADDRESS}:fallback.eth`
    );
    expect(addressHtml).toContain("0x1111...1111");
    expect(addressHtml).toContain(
      `DelegationCard:${DELEGATE_ADDRESS}:0x1111...1111`
    );
  });
});
