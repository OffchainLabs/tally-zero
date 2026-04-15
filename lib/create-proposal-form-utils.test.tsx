import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { describe, expect, it } from "vitest";

import {
  buildSubmittedProposalPath,
  createFormProposalAction,
  getProposalEligibility,
  getProposalPreviewRehypePlugins,
  getProposalSubmissionPhase,
} from "./create-proposal-form-utils";

describe("create-proposal-form-utils", () => {
  describe("createFormProposalAction", () => {
    it("creates default action rows with stable ids", () => {
      const first = createFormProposalAction();
      const second = createFormProposalAction();

      expect(first).toMatchObject({
        target: "",
        value: "0",
        calldata: "0x",
      });
      expect(first.id).toMatch(/^proposal-action-\d+$/);
      expect(second.id).toMatch(/^proposal-action-\d+$/);
      expect(first.id).not.toBe(second.id);
    });
  });

  describe("getProposalEligibility", () => {
    it("returns unknown until both values are available", () => {
      expect(getProposalEligibility(undefined, undefined)).toBe("unknown");
      expect(getProposalEligibility(BigInt(1), undefined)).toBe("unknown");
      expect(getProposalEligibility(undefined, BigInt(1))).toBe("unknown");
    });

    it("returns meets when voting power is at or above threshold", () => {
      expect(getProposalEligibility(BigInt(10), BigInt(10))).toBe("meets");
      expect(getProposalEligibility(BigInt(11), BigInt(10))).toBe("meets");
    });

    it("returns below when voting power is insufficient", () => {
      expect(getProposalEligibility(BigInt(9), BigInt(10))).toBe("below");
    });
  });

  describe("getProposalSubmissionPhase", () => {
    const txHash =
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    it("stays idle before a submission starts", () => {
      expect(
        getProposalSubmissionPhase({
          txHash: undefined,
          isWriting: false,
          isConfirming: false,
          isConfirmed: false,
        })
      ).toBe("idle");
    });

    it("reports awaiting-wallet while the wallet request is pending", () => {
      expect(
        getProposalSubmissionPhase({
          txHash: undefined,
          isWriting: true,
          isConfirming: false,
          isConfirmed: false,
        })
      ).toBe("awaiting-wallet");
    });

    it("does not report confirmed until a receipt is confirmed", () => {
      expect(
        getProposalSubmissionPhase({
          txHash,
          isWriting: false,
          isConfirming: true,
          isConfirmed: false,
        })
      ).toBe("confirming");
    });

    it("reports confirmed only after receipt confirmation", () => {
      expect(
        getProposalSubmissionPhase({
          txHash,
          isWriting: false,
          isConfirming: false,
          isConfirmed: true,
        })
      ).toBe("confirmed");
    });
  });

  describe("buildSubmittedProposalPath", () => {
    const proposalId =
      "112177996398925212273579485756315626637025938627124330171390356044681347897430";
    const governorAddress = "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9";

    it("builds a canonical proposal URL including governor identity", () => {
      expect(
        buildSubmittedProposalPath({
          proposalId,
          governorAddress,
        })
      ).toBe(`/proposal/${proposalId}?govId=eip155:42161:${governorAddress}`);
    });

    it("returns null when required values are missing", () => {
      expect(
        buildSubmittedProposalPath({
          proposalId: null,
          governorAddress,
        })
      ).toBeNull();
      expect(
        buildSubmittedProposalPath({
          proposalId,
          governorAddress: null,
        })
      ).toBeNull();
    });
  });

  describe("getProposalPreviewRehypePlugins", () => {
    it("sanitizes raw html after parsing it", () => {
      const html = renderToStaticMarkup(
        <ReactMarkdown rehypePlugins={getProposalPreviewRehypePlugins()}>
          {
            '<div onclick="alert(1)">safe</div><script>alert(1)</script><a href="javascript:alert(1)">bad</a>'
          }
        </ReactMarkdown>
      );

      expect(html).toContain("<div>safe</div>");
      expect(html).not.toContain("onclick=");
      expect(html).not.toContain("<script>");
      expect(html).not.toContain('href="javascript:alert(1)"');
      expect(html).toContain("<a>bad</a>");
    });
  });
});
