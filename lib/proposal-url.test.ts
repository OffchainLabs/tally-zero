import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { registerL1VotingGovernor } from "@/config/governors";

import {
  buildGovernorId,
  buildProposalPath,
  normalizeProposalTab,
  parseGovernorId,
  parseGovernorRef,
} from "./proposal-url";

// These cases include the local testnode L1 (1337), which a build only
// accepts with NEXT_PUBLIC_LOCAL_CHAINS=1.
vi.hoisted(() => {
  vi.stubEnv("NEXT_PUBLIC_LOCAL_CHAINS", "1");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("proposal-url", () => {
  const governorAddress = "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9";
  const governorId = `eip155:42161:${governorAddress}`;

  describe("normalizeProposalTab", () => {
    it("returns undefined for empty values", () => {
      expect(normalizeProposalTab(undefined)).toBeUndefined();
      expect(normalizeProposalTab(null)).toBeUndefined();
      expect(normalizeProposalTab("")).toBeUndefined();
    });

    it("maps legacy lifecycle tab to stages", () => {
      expect(normalizeProposalTab("lifecycle")).toBe("stages");
    });

    it("returns supported tabs", () => {
      expect(normalizeProposalTab("description")).toBe("description");
      expect(normalizeProposalTab("payload")).toBe("payload");
      expect(normalizeProposalTab("stages")).toBe("stages");
    });

    it("rejects unsupported tabs", () => {
      expect(normalizeProposalTab("unknown")).toBeUndefined();
    });
  });

  describe("governor ids", () => {
    it("builds a CAIP-style governor id", () => {
      expect(buildGovernorId(governorAddress)).toBe(governorId);
    });

    it("parses a valid governor id", () => {
      expect(parseGovernorId(governorId)).toBe(governorAddress);
    });

    it("rejects invalid governor ids", () => {
      expect(parseGovernorId("")).toBeNull();
      expect(parseGovernorId("eip155:1:0x1234")).toBeNull();
      expect(parseGovernorId(`eip155:42161:not-an-address`)).toBeNull();
    });
  });

  describe("buildProposalPath", () => {
    const proposalId =
      "112177996398925212273579485756315626637025938627124330171390356044681347897430";

    it("builds the canonical proposal page path", () => {
      expect(
        buildProposalPath({
          proposalId,
          governorAddress,
        })
      ).toBe(`/proposal/${proposalId}?govId=${governorId}`);
    });

    it("adds a tab query for non-default tabs", () => {
      expect(
        buildProposalPath({
          proposalId,
          governorAddress,
          tab: "stages",
        })
      ).toBe(`/proposal/${proposalId}?govId=${governorId}&tab=stages`);
    });

    it("omits the description tab from the URL", () => {
      expect(
        buildProposalPath({
          proposalId,
          governorAddress,
          tab: "description",
        })
      ).toBe(`/proposal/${proposalId}?govId=${governorId}`);
    });
  });

  describe("L1 voting governors", () => {
    const l1Governor = "0x00000000000000000000000000000000000e11e1";
    const proposalId = "42";

    describe("with the local chains off", () => {
      afterEach(() => {
        vi.unstubAllEnvs();
        vi.stubEnv("NEXT_PUBLIC_LOCAL_CHAINS", "1");
        vi.resetModules();
      });

      it("rejects an eip155:1337 governor id", async () => {
        vi.stubEnv("NEXT_PUBLIC_LOCAL_CHAINS", "0");
        vi.resetModules();
        const url = await import("./proposal-url");

        expect(url.parseGovernorRef(`eip155:1337:${l1Governor}`)).toBeNull();
        expect(url.parseGovernorRef(`eip155:1:${l1Governor}`)).toEqual({
          governorAddress: l1Governor,
          chainId: 1,
        });
      });
    });

    it("parses eip155:1 and eip155:1337 governor ids", () => {
      expect(parseGovernorRef(`eip155:1:${l1Governor}`)).toEqual({
        governorAddress: l1Governor,
        chainId: 1,
      });
      expect(parseGovernorRef(`eip155:1337:${l1Governor}`)).toEqual({
        governorAddress: l1Governor,
        chainId: 1337,
      });
      expect(parseGovernorId(`eip155:1:${l1Governor}`)).toBe(l1Governor);
    });

    it("still parses Arbitrum One ids with their chain", () => {
      expect(parseGovernorRef(governorId)).toEqual({
        governorAddress,
        chainId: 42161,
      });
    });

    it("rejects chains no governor lives on", () => {
      expect(parseGovernorRef(`eip155:10:${l1Governor}`)).toBeNull();
      expect(parseGovernorRef(`eip155:x:${l1Governor}`)).toBeNull();
    });

    it("builds a path on the chain it is given", () => {
      expect(
        buildProposalPath({
          proposalId,
          governorAddress: l1Governor,
          chainId: "1337",
        })
      ).toBe(`/proposal/${proposalId}?govId=eip155:1337:${l1Governor}`);
    });

    it("defaults to a registered governor's own chain", () => {
      const registered = "0x00000000000000000000000000000000000f11f1";
      expect(buildGovernorId(registered)).toBe(`eip155:42161:${registered}`);
      registerL1VotingGovernor(registered, 1);
      expect(buildGovernorId(registered)).toBe(`eip155:1:${registered}`);
    });

    it("builds an unregistered governor's id on the chain it is given", () => {
      expect(buildGovernorId(l1Governor, 1)).toBe(`eip155:1:${l1Governor}`);
      expect(buildGovernorId(l1Governor, "1")).toBe(`eip155:1:${l1Governor}`);
    });

    it("prefers the given chain over the registered one", () => {
      const registered = "0x00000000000000000000000000000000000f22f2";
      registerL1VotingGovernor(registered, 1);
      expect(buildGovernorId(registered, 1337)).toBe(
        `eip155:1337:${registered}`
      );
      expect(buildGovernorId(registered, "42161")).toBe(
        `eip155:42161:${registered}`
      );
    });

    it("treats an empty or non-numeric chain as not given", () => {
      expect(buildGovernorId(governorAddress, "")).toBe(governorId);
      expect(buildGovernorId(governorAddress, "mainnet")).toBe(governorId);
      expect(buildGovernorId(governorAddress, NaN)).toBe(governorId);
    });

    it("round-trips a governor id through the parser", () => {
      expect(parseGovernorRef(buildGovernorId(l1Governor, 1))).toEqual({
        governorAddress: l1Governor,
        chainId: 1,
      });
      expect(parseGovernorRef(buildGovernorId(governorAddress))).toEqual({
        governorAddress,
        chainId: 42161,
      });

      const path = buildProposalPath({
        proposalId,
        governorAddress: l1Governor,
        chainId: "1337",
        tab: "stages",
      });
      const govId = new URLSearchParams(path.split("?")[1]).get("govId");
      expect(parseGovernorRef(govId)).toEqual({
        governorAddress: l1Governor,
        chainId: 1337,
      });
    });
  });
});
