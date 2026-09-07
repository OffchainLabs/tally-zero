import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { describe, expect, it } from "vitest";

import {
  buildSubmittedProposalPath,
  createFormProposalAction,
  createProposalDraft,
  getProposalEligibility,
  getProposalPreviewRehypePlugins,
  getProposalSnapshotBlock,
  getProposalSubmissionPhase,
  parseProposalDraft,
  parseServerTimestamp,
  PROPOSAL_DRAFT_VERSION,
  type RestoredProposalDraft,
  serializeProposalSnapshot,
  shouldRestoreLocalDraft,
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

  describe("getProposalSnapshotBlock", () => {
    it("returns undefined while the governance clock is unknown", () => {
      expect(getProposalSnapshotBlock(null)).toBeUndefined();
      expect(getProposalSnapshotBlock(undefined)).toBeUndefined();
    });

    it("stays a few blocks behind the clock so checkpoint reads do not revert", () => {
      expect(getProposalSnapshotBlock(BigInt(23_456_789))).toBe(
        BigInt(23_456_786)
      );
    });

    it("never returns the clock itself, which would revert as not yet mined", () => {
      const clock = BigInt(23_456_789);

      expect(getProposalSnapshotBlock(clock)).toBeLessThan(clock);
    });

    it("clamps to zero instead of going negative", () => {
      expect(getProposalSnapshotBlock(BigInt(3))).toBe(BigInt(0));
      expect(getProposalSnapshotBlock(BigInt(1))).toBe(BigInt(0));
      expect(getProposalSnapshotBlock(BigInt(0))).toBe(BigInt(0));
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

  describe("proposal draft helpers", () => {
    it("creates a serializable draft payload", () => {
      const draft = createProposalDraft({
        governorType: "core",
        description: "# Title",
        actions: [
          {
            target: "0x1111111111111111111111111111111111111111",
            value: "42",
            calldata: "0x1234",
          },
        ],
        savedAt: 123,
      });

      expect(draft).toEqual({
        version: PROPOSAL_DRAFT_VERSION,
        savedAt: 123,
        governorType: "core",
        description: "# Title",
        actions: [
          {
            target: "0x1111111111111111111111111111111111111111",
            value: "42",
            calldata: "0x1234",
          },
        ],
      });
    });

    it("parses a saved draft and regenerates action row ids", () => {
      const restored = parseProposalDraft(
        JSON.stringify({
          version: PROPOSAL_DRAFT_VERSION,
          savedAt: 456,
          governorType: "treasury",
          description: "hello",
          actions: [
            {
              target: "0x2222222222222222222222222222222222222222",
              value: "0",
              calldata: "0x",
            },
          ],
        })
      );

      expect(restored).toMatchObject({
        version: PROPOSAL_DRAFT_VERSION,
        savedAt: 456,
        governorType: "treasury",
        description: "hello",
        actions: [
          {
            target: "0x2222222222222222222222222222222222222222",
            value: "0",
            calldata: "0x",
          },
        ],
      });
      expect(restored?.actions[0]?.id).toMatch(/^proposal-action-\d+$/);
    });

    it("falls back to a blank action when saved actions are unusable", () => {
      const restored = parseProposalDraft(
        JSON.stringify({
          version: PROPOSAL_DRAFT_VERSION,
          savedAt: 789,
          governorType: "core",
          description: "draft",
          actions: [{ target: 1, value: 2, calldata: 3 }],
        })
      );

      expect(restored).toMatchObject({
        governorType: "core",
        description: "draft",
        actions: [
          {
            target: "",
            value: "0",
            calldata: "0x",
          },
        ],
      });
      expect(restored?.actions[0]?.id).toMatch(/^proposal-action-\d+$/);
    });

    it("returns null for invalid json", () => {
      expect(parseProposalDraft("{not-json")).toBeNull();
    });

    it("returns null for unsupported draft metadata", () => {
      expect(
        parseProposalDraft(
          JSON.stringify({
            version: 999,
            savedAt: 123,
            governorType: "core",
            description: "draft",
            actions: [],
          })
        )
      ).toBeNull();

      expect(
        parseProposalDraft(
          JSON.stringify({
            version: PROPOSAL_DRAFT_VERSION,
            savedAt: "today",
            governorType: "core",
            description: "draft",
            actions: [],
          })
        )
      ).toBeNull();
    });

    // The proposal form's mount effect asks this before replacing what it was
    // seeded with. Both halves of the rule have regressed before (a server
    // draft overwriting the anonymous copy; a submission deleting the wrong
    // slot), so the decision is pinned here rather than left inside an effect
    // the node test environment cannot run.
    describe("shouldRestoreLocalDraft", () => {
      const seeded = {
        governorType: "core" as const,
        description: "seeded",
        actions: [{ target: "", value: "0", calldata: "0x" }],
      };
      const seededSerialized = serializeProposalSnapshot(seeded);
      const localAt = Date.UTC(2026, 8, 4, 12, 0, 0);
      const local = (overrides: Partial<RestoredProposalDraft> = {}) => {
        const restored = parseProposalDraft(
          JSON.stringify(
            createProposalDraft({
              ...seeded,
              description: "typed since",
              savedAt: localAt,
            })
          )
        );
        if (!restored) throw new Error("fixture did not parse");
        return { ...restored, ...overrides };
      };

      it("restores the anonymous form's copy whenever it differs from the seed", () => {
        expect(
          shouldRestoreLocalDraft({
            local: local(),
            serverUpdatedAt: null,
            seededSerialized,
          })
        ).toBe(true);
      });

      it("discards a copy identical to the seed, whatever its age", () => {
        expect(
          shouldRestoreLocalDraft({
            local: local({ description: "seeded" }),
            serverUpdatedAt: null,
            seededSerialized,
          })
        ).toBe(false);
      });

      it("restores a copy newer than the server's last save", () => {
        expect(
          shouldRestoreLocalDraft({
            local: local(),
            serverUpdatedAt: localAt - 60_000,
            seededSerialized,
          })
        ).toBe(true);
      });

      it("discards a copy older than the server's last save", () => {
        expect(
          shouldRestoreLocalDraft({
            local: local(),
            serverUpdatedAt: localAt + 60_000,
            seededSerialized,
          })
        ).toBe(false);
      });

      it("discards a copy saved at the same instant as the server", () => {
        expect(
          shouldRestoreLocalDraft({
            local: local(),
            serverUpdatedAt: localAt,
            seededSerialized,
          })
        ).toBe(false);
      });

      // A bad server timestamp must not delete the user's edits: unknown
      // counts as older than anything local.
      it("keeps the local copy when the server time is unknown", () => {
        expect(
          shouldRestoreLocalDraft({
            local: local(),
            serverUpdatedAt: parseServerTimestamp("not a date"),
            seededSerialized,
          })
        ).toBe(true);
      });
    });

    describe("parseServerTimestamp", () => {
      it("returns ms epoch for an ISO string and null otherwise", () => {
        expect(parseServerTimestamp("2026-01-01T00:00:00Z")).toBe(
          Date.UTC(2026, 0, 1)
        );
        expect(parseServerTimestamp("not a date")).toBeNull();
        expect(parseServerTimestamp("")).toBeNull();
      });
    });

    // The dirty check compares what the form holds with what was last saved,
    // so row ids and any extra fields must not make equal contents differ.
    it("serializes equal contents identically regardless of row ids", () => {
      const action = {
        target: "0x1111111111111111111111111111111111111111",
        value: "1",
        calldata: "0x",
      };

      const fromForm = serializeProposalSnapshot({
        governorType: "core",
        description: "body",
        actions: [{ ...action, id: "proposal-action-7" } as typeof action],
      });
      const fromStorage = serializeProposalSnapshot({
        governorType: "core",
        description: "body",
        actions: [action],
      });

      expect(fromForm).toBe(fromStorage);
      expect(
        serializeProposalSnapshot({
          governorType: "core",
          description: "body changed",
          actions: [action],
        })
      ).not.toBe(fromStorage);
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
