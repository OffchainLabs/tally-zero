import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  detectSourceFromUrl,
  fetchForumDescription,
  fetchSnapshotDescription,
  importProposalDescription,
  parseForumUrl,
  parseSnapshotUrl,
} from "./proposal-import";

// Known Arbitrum governor addresses. Hardcoded so the test asserts against
// the exact checksum expected to be returned.
const TREASURY_GOVERNOR = "0x789fC99093B09aD01C34DC7251D0C89ce743e5a4";
const CORE_GOVERNOR = "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html" },
  });
}

describe("proposal-import", () => {
  describe("parseForumUrl", () => {
    it("reads the topic id from a canonical Discourse URL", () => {
      expect(
        parseForumUrl(
          "https://forum.arbitrum.foundation/t/some-slug-here/30691"
        )
      ).toEqual({ topicId: 30691 });
    });

    it("tolerates a trailing slash and extra path segments", () => {
      expect(
        parseForumUrl("https://forum.arbitrum.foundation/t/some-slug/30691/2")
      ).toEqual({ topicId: 30691 });
    });

    it("tolerates query strings and hash fragments", () => {
      expect(
        parseForumUrl(
          "https://forum.arbitrum.foundation/t/slug/30691?u=alice#reply-4"
        )
      ).toEqual({ topicId: 30691 });
    });

    it("rejects a non-forum hostname", () => {
      expect(() =>
        parseForumUrl("https://evil.example.com/t/slug/30691")
      ).toThrow(/forum.arbitrum.foundation/);
    });

    it("rejects a URL that is not a topic path", () => {
      expect(() =>
        parseForumUrl("https://forum.arbitrum.foundation/c/category/1")
      ).toThrow(/recognizable forum topic/);
    });

    it("rejects a URL with too few path segments", () => {
      expect(() =>
        parseForumUrl("https://forum.arbitrum.foundation/t/only-slug")
      ).toThrow(/recognizable forum topic/);
    });

    it("rejects a non-numeric topic id", () => {
      expect(() =>
        parseForumUrl("https://forum.arbitrum.foundation/t/slug/not-a-number")
      ).toThrow(/topic id/);
    });

    it("rejects a zero or negative topic id", () => {
      expect(() =>
        parseForumUrl("https://forum.arbitrum.foundation/t/slug/0")
      ).toThrow(/topic id/);
    });

    it("rejects unparseable input", () => {
      expect(() => parseForumUrl("not a url at all")).toThrow(
        /valid forum URL/
      );
    });
  });

  describe("parseSnapshotUrl", () => {
    it("reads an off-chain proposal id from the hash fragment", () => {
      const id =
        "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
      expect(
        parseSnapshotUrl(
          `https://snapshot.box/#/s:arbitrumfoundation.eth/proposal/${id}`
        )
      ).toEqual({ kind: "offchain", proposalId: id });
    });

    it("reads an on-chain proposal id and checksums the governor address", () => {
      // Lowercase input should be returned in checksum form.
      const url = `https://snapshot.box/#/42161:${TREASURY_GOVERNOR.toLowerCase()}/proposal/12345`;
      expect(parseSnapshotUrl(url)).toEqual({
        kind: "onchain",
        governorAddress: TREASURY_GOVERNOR,
        proposalId: "12345",
      });
    });

    it("preserves a malformed governor address without throwing", () => {
      const url =
        "https://snapshot.box/#/42161:0xnotreallyanaddress/proposal/99";
      expect(parseSnapshotUrl(url)).toEqual({
        kind: "onchain",
        governorAddress: "0xnotreallyanaddress",
        proposalId: "99",
      });
    });

    it("also accepts the path-form variant", () => {
      expect(
        parseSnapshotUrl("https://snapshot.org/s:example.eth/proposal/0xaa")
      ).toEqual({ kind: "offchain", proposalId: "0xaa" });
    });

    it("strips query and hash from the proposal segment", () => {
      const url =
        "https://snapshot.box/#/s:example.eth/proposal/0xbb?ref=twitter";
      expect(parseSnapshotUrl(url)).toEqual({
        kind: "offchain",
        proposalId: "0xbb",
      });
    });

    it("rejects a non-snapshot hostname", () => {
      expect(() =>
        parseSnapshotUrl("https://example.com/#/s:x/proposal/0x1")
      ).toThrow(/snapshot.box or snapshot.org/);
    });

    it("rejects a URL without a proposal segment", () => {
      expect(() =>
        parseSnapshotUrl("https://snapshot.box/#/s:example.eth")
      ).toThrow(/proposal id/);
    });

    it("rejects unparseable input", () => {
      expect(() => parseSnapshotUrl("garbage")).toThrow(/valid Snapshot URL/);
    });
  });

  describe("detectSourceFromUrl", () => {
    it("returns 'forum' for a forum URL", () => {
      expect(
        detectSourceFromUrl("https://forum.arbitrum.foundation/t/slug/1")
      ).toBe("forum");
    });

    it("returns 'snapshot' for snapshot.box", () => {
      expect(detectSourceFromUrl("https://snapshot.box/#/anything")).toBe(
        "snapshot"
      );
    });

    it("returns 'snapshot' for snapshot.org", () => {
      expect(detectSourceFromUrl("https://snapshot.org/#/anything")).toBe(
        "snapshot"
      );
    });

    it("trims whitespace before parsing", () => {
      expect(
        detectSourceFromUrl("   https://forum.arbitrum.foundation/t/a/1   ")
      ).toBe("forum");
    });

    it("returns null for any other host", () => {
      expect(detectSourceFromUrl("https://example.com/x")).toBeNull();
    });

    it("returns null for unparseable input", () => {
      expect(detectSourceFromUrl("not a url")).toBeNull();
    });
  });

  describe("fetchForumDescription", () => {
    const url = "https://forum.arbitrum.foundation/t/slug/30691";
    const fetchMock = vi.fn();

    beforeEach(() => {
      vi.stubGlobal("fetch", fetchMock);
      fetchMock.mockReset();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("calls the same-origin proxy endpoint with the topic id", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ title: "Hello", body: "world" })
      );
      await fetchForumDescription(url);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe("/api/forum/topic?id=30691");
    });

    it("returns a shaped import result on success", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          title: "Constitutional AIP 1",
          body: "Body paragraph one.\n\nBody paragraph two.",
        })
      );
      const result = await fetchForumDescription(url);
      expect(result.title).toBe("Constitutional AIP 1");
      expect(result.body).toBe("Body paragraph one.\n\nBody paragraph two.");
      expect(result.markdown).toBe(
        "# Constitutional AIP 1\n\nBody paragraph one.\n\nBody paragraph two.\n"
      );
      // "constitutional" in the title resolves to the core governor.
      expect(result.suggestedGovernor).toBe("core");
    });

    it("prefers 'non-constitutional' over 'constitutional' when both appear", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          title: "Non-constitutional proposal",
          body: "Discusses constitutional changes.",
        })
      );
      const result = await fetchForumDescription(url);
      expect(result.suggestedGovernor).toBe("treasury");
    });

    it("also matches the unhyphenated 'nonconstitutional' spelling", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          title: "Funding request",
          body: "This is a nonconstitutional proposal.",
        })
      );
      const result = await fetchForumDescription(url);
      expect(result.suggestedGovernor).toBe("treasury");
    });

    it("leaves suggestedGovernor undefined when no keywords match", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ title: "Hello", body: "World." })
      );
      const result = await fetchForumDescription(url);
      expect(result.suggestedGovernor).toBeUndefined();
    });

    it("falls back to a generic title when the response has none", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ title: "", body: "Just a body." })
      );
      const result = await fetchForumDescription(url);
      expect(result.title).toBe("Arbitrum Forum Topic 30691");
    });

    it("throws 'topic not found' on a JSON 404", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: "Forum topic not found." }, 404)
      );
      await expect(fetchForumDescription(url)).rejects.toThrow(
        "Forum topic not found."
      );
    });

    it("throws 'proxy endpoint not responding' on a non-JSON response", async () => {
      // Next.js dev returns an HTML 404 page when the route handler is missing.
      fetchMock.mockResolvedValueOnce(
        htmlResponse("<!doctype html><h1>404</h1>", 404)
      );
      await expect(fetchForumDescription(url)).rejects.toThrow(
        /proxy endpoint is not responding/
      );
    });

    it("throws a status-tagged error on other non-OK statuses", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: "Upstream error." }, 502)
      );
      await expect(fetchForumDescription(url)).rejects.toThrow(
        "Forum request failed (502)."
      );
    });

    it("throws a network error when fetch rejects", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("offline"));
      await expect(fetchForumDescription(url)).rejects.toThrow(
        "Could not reach the forum."
      );
    });

    it("throws when the response body is empty", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ title: "Hello", body: "   " })
      );
      await expect(fetchForumDescription(url)).rejects.toThrow(
        /no first-post content/
      );
    });

    it("throws on malformed JSON from the proxy", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("not json", {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
      await expect(fetchForumDescription(url)).rejects.toThrow(
        /not valid JSON/
      );
    });
  });

  describe("fetchSnapshotDescription", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
      vi.stubGlobal("fetch", fetchMock);
      fetchMock.mockReset();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("queries hub.snapshot.org for off-chain proposals", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          data: {
            proposal: { title: "Off-chain", body: "Off-chain body." },
          },
        })
      );
      const result = await fetchSnapshotDescription(
        "https://snapshot.box/#/s:arbitrumfoundation.eth/proposal/0xab"
      );
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://hub.snapshot.org/graphql"
      );
      expect(result.title).toBe("Off-chain");
      expect(result.markdown).toBe("# Off-chain\n\nOff-chain body.\n");
    });

    it("queries api.snapshot.box for on-chain proposals", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          data: {
            proposal: {
              metadata: { title: "On-chain", body: "On-chain body." },
            },
          },
        })
      );
      await fetchSnapshotDescription(
        `https://snapshot.box/#/42161:${TREASURY_GOVERNOR}/proposal/99`
      );
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://api.snapshot.box/graphql"
      );
    });

    it("uses the on-chain governor address to pick suggestedGovernor", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          data: {
            proposal: {
              metadata: { title: "Anything", body: "No keywords here." },
            },
          },
        })
      );
      const result = await fetchSnapshotDescription(
        `https://snapshot.box/#/42161:${CORE_GOVERNOR}/proposal/1`
      );
      expect(result.suggestedGovernor).toBe("core");
    });

    it("on-chain governor address takes precedence over keyword detection", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          data: {
            proposal: {
              metadata: {
                title: "Non-constitutional proposal",
                body: "Body.",
              },
            },
          },
        })
      );
      const result = await fetchSnapshotDescription(
        `https://snapshot.box/#/42161:${CORE_GOVERNOR}/proposal/1`
      );
      // Text would say "treasury", but the on-chain address wins.
      expect(result.suggestedGovernor).toBe("core");
    });

    it("translates 'Row not found' into the 'not found' error", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          errors: [{ message: "Row not found: proposal" }],
        })
      );
      await expect(
        fetchSnapshotDescription("https://snapshot.box/#/s:x.eth/proposal/0x01")
      ).rejects.toThrow("Snapshot proposal not found.");
    });

    it("surfaces a null off-chain proposal as 'not found'", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ data: { proposal: null } })
      );
      await expect(
        fetchSnapshotDescription("https://snapshot.box/#/s:x.eth/proposal/0x01")
      ).rejects.toThrow("Snapshot proposal not found.");
    });

    it("surfaces a missing on-chain metadata as 'not found'", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ data: { proposal: { metadata: null } } })
      );
      await expect(
        fetchSnapshotDescription(
          `https://snapshot.box/#/42161:${TREASURY_GOVERNOR}/proposal/1`
        )
      ).rejects.toThrow("Snapshot proposal not found.");
    });

    it("throws for other GraphQL errors using the first message", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          errors: [{ message: "Rate limited" }, { message: "Ignored" }],
        })
      );
      await expect(
        fetchSnapshotDescription("https://snapshot.box/#/s:x.eth/proposal/0x01")
      ).rejects.toThrow("Rate limited");
    });

    it("throws on a non-OK HTTP status", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, 503));
      await expect(
        fetchSnapshotDescription("https://snapshot.box/#/s:x.eth/proposal/0x01")
      ).rejects.toThrow("Snapshot request failed (503).");
    });

    it("throws when both title and body are empty", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          data: { proposal: { title: "", body: "" } },
        })
      );
      await expect(
        fetchSnapshotDescription("https://snapshot.box/#/s:x.eth/proposal/0x01")
      ).rejects.toThrow("Snapshot proposal has no content.");
    });

    it("falls back to a generic title when only the body is present", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          data: { proposal: { title: "", body: "Just a body." } },
        })
      );
      const result = await fetchSnapshotDescription(
        "https://snapshot.box/#/s:x.eth/proposal/0x01"
      );
      expect(result.title).toBe("Snapshot Proposal");
    });

    it("throws a network error when fetch rejects", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("offline"));
      await expect(
        fetchSnapshotDescription("https://snapshot.box/#/s:x.eth/proposal/0x01")
      ).rejects.toThrow("Could not reach Snapshot.");
    });
  });

  describe("importProposalDescription", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
      vi.stubGlobal("fetch", fetchMock);
      fetchMock.mockReset();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("routes 'forum' to the proxy endpoint", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ title: "T", body: "B" }));
      await importProposalDescription(
        "forum",
        "https://forum.arbitrum.foundation/t/slug/1"
      );
      expect(fetchMock.mock.calls[0][0]).toBe("/api/forum/topic?id=1");
    });

    it("routes 'snapshot' to the GraphQL endpoints", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ data: { proposal: { title: "T", body: "B" } } })
      );
      await importProposalDescription(
        "snapshot",
        "https://snapshot.box/#/s:x.eth/proposal/0x01"
      );
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://hub.snapshot.org/graphql"
      );
    });
  });
});
