import { describe, expect, it } from "vitest";

import type { ParsedProposal } from "@/types/proposal";

import {
  buildProposalMetadata,
  canonicalUrl,
  jsonLdScript,
  META_DESCRIPTION_MAX,
  pageMetadata,
  PROPOSAL_FALLBACK_METADATA,
  siteOpenGraph,
  summarizeForMeta,
  websiteJsonLd,
} from "./seo";

const PROPOSAL_ID =
  "112177889743108847165453609165296453398094394093296283306868108264797430897430";

function makeProposal(description: string): ParsedProposal {
  return {
    id: PROPOSAL_ID,
    contractAddress: "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9",
    proposer: "0xb4c064f466931B8d0F637654c916E3F203c46f13",
    targets: [],
    values: [],
    signatures: [],
    calldatas: [],
    startBlock: "0",
    endBlock: "0",
    description,
    networkId: "42161",
    state: "Executed",
    governorName: "Core Governor",
  };
}

describe("canonicalUrl", () => {
  it("builds absolute URLs on the site origin", () => {
    expect(canonicalUrl("/proposals")).toBe(
      "https://alt.gov.arbitrum.foundation/proposals"
    );
    expect(canonicalUrl("delegates")).toBe(
      "https://alt.gov.arbitrum.foundation/delegates"
    );
  });

  it("uses a trailing slash for the home page only", () => {
    expect(canonicalUrl("/")).toBe("https://alt.gov.arbitrum.foundation/");
    expect(canonicalUrl("")).toBe("https://alt.gov.arbitrum.foundation/");
  });
});

describe("pageMetadata", () => {
  it("points og:url at the page's own canonical", () => {
    const meta = pageMetadata({
      title: "Delegates",
      description: "ArbitrumDAO delegates.",
      path: "/delegates",
    });
    const canonical = "https://alt.gov.arbitrum.foundation/delegates";

    expect(meta.title).toBe("Delegates");
    expect(meta.alternates?.canonical).toBe(canonical);
    expect(meta.openGraph).toMatchObject({
      url: canonical,
      title: "Delegates | Arbitrum Governance",
      description: "ArbitrumDAO delegates.",
      type: "website",
      images: siteOpenGraph.images,
    });
  });

  it("leaves no default og:url for pages that skip the helper", () => {
    expect(siteOpenGraph).not.toHaveProperty("url");
  });
});

describe("summarizeForMeta", () => {
  it("strips markdown and collapses whitespace", () => {
    expect(summarizeForMeta("# Title\n\nSome **bold**   text.")).toBe(
      "Title Some bold text."
    );
  });

  it("cuts at a word boundary and never exceeds the limit", () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const summary = summarizeForMeta(long);

    expect(summary.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
    expect(summary.endsWith("…")).toBe(true);
    // Ends on a whole word, never a partial one
    const lastWord = summary.slice(0, -1).split(" ").pop();
    expect(long.split(" ")).toContain(lastWord);
  });

  it("hard-cuts a single long token instead of returning nothing", () => {
    const token = "x".repeat(300);
    expect(summarizeForMeta(token, 20)).toBe(`${"x".repeat(20)}…`);
  });
});

describe("buildProposalMetadata", () => {
  it("uses the proposal title and the body after it", () => {
    const meta = buildProposalMetadata(
      PROPOSAL_ID,
      makeProposal(
        "# [Constitutional] DVP Quorum & Proposal Cancellation\n\nThis AIP adjusts the quorum numerator and adds cancellation."
      )
    );

    expect(meta.title).toBe(
      "[Constitutional] DVP Quorum & Proposal Cancellation"
    );
    expect(meta.description).toBe(
      "This AIP adjusts the quorum numerator and adds cancellation."
    );
    expect(meta.alternates?.canonical).toBe(
      `https://alt.gov.arbitrum.foundation/proposal/${PROPOSAL_ID}`
    );
    expect(meta.openGraph).toMatchObject({
      url: `https://alt.gov.arbitrum.foundation/proposal/${PROPOSAL_ID}`,
      type: "article",
    });
  });

  it("falls back to governor copy when the body is only a title", () => {
    const meta = buildProposalMetadata(
      PROPOSAL_ID,
      makeProposal("# Transfer 1,800 ETH from the Treasury")
    );

    expect(meta.description).toContain("Core Governor proposal");
  });

  it("uses the generic copy when the proposal is not in the static cache", () => {
    const meta = buildProposalMetadata(PROPOSAL_ID, null);

    expect(meta.title).toBe(PROPOSAL_FALLBACK_METADATA.title);
    expect(meta.description).toBe(PROPOSAL_FALLBACK_METADATA.description);
    expect(meta.alternates?.canonical).toContain(`/proposal/${PROPOSAL_ID}`);
  });
});

describe("JSON-LD", () => {
  it("describes the site as a WebSite on the canonical origin", () => {
    const data = websiteJsonLd();

    expect(data["@type"]).toBe("WebSite");
    expect(data.url).toBe("https://alt.gov.arbitrum.foundation/");
    expect(data.name).toBe("Arbitrum Governance");
  });

  it("escapes angle brackets so a value cannot close the script tag", () => {
    expect(jsonLdScript({ a: "</script>" })).not.toContain("</script>");
  });
});
